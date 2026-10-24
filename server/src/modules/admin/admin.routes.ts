import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { DealModel } from "../deals/deal.model";
import { nextStatus } from "../deals/deal.transitions";
import type { DealStatus } from "../deals/deal.transitions";
import { DisputeAuditModel } from "../deals/dispute-audit.model";
import { DisputeModel, TRUST_MARKS } from "../deals/dispute.model";
import { AccountAuditModel } from "./account-audit.model";
import { ACCOUNT_STATUSES, UserModel } from "../users/user.model";
import type { AccountStatus } from "../users/user.model";
import { NotificationModel } from "../notifications/notification.model";
import { disconnectUser, emitNotification } from "../../socket";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

const accountListSchema = z.object({
  role: z.enum(["BRAND", "INFLUENCER"]).optional(),
  status: z.enum(ACCOUNT_STATUSES).optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const accountStatusSchema = z.object({
  action: z.enum(["SUSPEND", "REMOVE", "RESTORE"]),
  reason: z.string().trim().min(10).max(1000),
});

const listSchema = z.object({
  state: z.enum(["OPEN", "RESOLVED"]).default("OPEN"),
});

const resolutionSchema = z.object({
  trustMark: z.enum(TRUST_MARKS),
  reason: z.string().trim().min(10).max(1000),
});

const trustMarkSchema = z.object({
  trustMark: z.enum(TRUST_MARKS),
  reason: z.string().trim().min(10).max(1000),
});

class ReviewConflict extends Error {}
class AccountConflict extends Error {}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ADMIN: list brand and creator accounts without exposing password hashes.
router.get("/accounts", async (req, res) => {
  const parsed = accountListSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const clauses: Record<string, unknown>[] = [
    { role: parsed.data.role ?? { $in: ["BRAND", "INFLUENCER"] } },
  ];
  if (parsed.data.status === "ACTIVE") {
    clauses.push({ $or: [{ accountStatus: "ACTIVE" }, { accountStatus: { $exists: false } }] });
  } else if (parsed.data.status) {
    clauses.push({ accountStatus: parsed.data.status });
  }
  if (parsed.data.search) {
    const pattern = new RegExp(escapeRegex(parsed.data.search), "i");
    clauses.push({ $or: [{ name: pattern }, { email: pattern }] });
  }
  const filter = { $and: clauses };
  const skip = (parsed.data.page - 1) * parsed.data.limit;
  const [accounts, total] = await Promise.all([
    UserModel.find(filter)
      .select("name email role accountStatus createdAt updatedAt")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parsed.data.limit)
      .lean(),
    UserModel.countDocuments(filter),
  ]);

  res.json({ accounts, total, page: parsed.data.page, limit: parsed.data.limit });
});

router.get("/accounts/:id/audit", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Account not found" });
  }
  const account = await UserModel.exists({
    _id: req.params.id,
    role: { $in: ["BRAND", "INFLUENCER"] },
  });
  if (!account) return res.status(404).json({ message: "Account not found" });

  const events = await AccountAuditModel.find({ targetUser: req.params.id })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("actor", "name email")
    .lean();
  res.json({ events });
});

router.patch("/accounts/:id/status", async (req, res) => {
  const parsed = accountStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Account not found" });
  }

  const nextStatus: AccountStatus = parsed.data.action === "RESTORE"
    ? "ACTIVE"
    : parsed.data.action === "SUSPEND"
      ? "SUSPENDED"
      : "REMOVED";
  const session = await mongoose.startSession();
  let accountName = "";
  let accountEmail = "";
  let currentStatus: AccountStatus | null = null;
  try {
    await session.withTransaction(async () => {
      const account = await UserModel.findOne({
        _id: req.params.id,
        role: { $in: ["BRAND", "INFLUENCER"] },
      }).session(session);
      if (!account) throw new AccountConflict("Account not found");

      const previousStatus = (account.accountStatus ?? "ACTIVE") as AccountStatus;
      if (previousStatus === nextStatus) {
        throw new AccountConflict(`Account is already ${nextStatus.toLowerCase()}`);
      }
      if (previousStatus === "REMOVED" && parsed.data.action !== "RESTORE") {
        throw new AccountConflict("Restore a removed account before changing its status");
      }

      account.accountStatus = nextStatus;
      await account.save({ session });
      await AccountAuditModel.create(
        [
          {
            targetUser: account._id,
            actor: req.user!.userId,
            action: parsed.data.action,
            reason: parsed.data.reason,
            previousStatus,
            nextStatus,
          },
        ],
        { session },
      );
      accountName = account.name;
      accountEmail = account.email;
      currentStatus = nextStatus;
    });
  } catch (error) {
    if (error instanceof AccountConflict) {
      const statusCode = error.message === "Account not found" ? 404 : 409;
      return res.status(statusCode).json({ message: error.message });
    }
    return res.status(503).json({ message: "Could not update the account. Please retry." });
  } finally {
    await session.endSession();
  }

  if (currentStatus !== "ACTIVE") {
    try {
      await disconnectUser(req.params.id);
    } catch {
      console.error("Could not disconnect the inactive account's sockets");
    }
  }
  res.json({
    ok: true,
    account: {
      id: req.params.id,
      name: accountName,
      email: accountEmail,
      accountStatus: currentStatus,
    },
  });
});

interface TrustMarkNotificationDetails {
  dealId: string;
  dealTitle: string;
  brandId: string;
  influencerId: string;
}

// Notifications are best-effort after the audited trust-mark update commits.
// Both deal participants receive the update; public profiles expose counts only.
async function notifyTrustMarkParticipants(
  details: TrustMarkNotificationDetails,
  adminId: string,
) {
  for (const recipient of [details.brandId, details.influencerId]) {
    try {
      const notification = await NotificationModel.create({
        recipient,
        deal: details.dealId,
        actor: adminId,
        action: "adminTrustMarkUpdated",
      });
      emitNotification(recipient, {
        id: String(notification._id),
        dealId: details.dealId,
        dealTitle: details.dealTitle,
        action: "adminTrustMarkUpdated",
        actorRole: "ADMIN",
        createdAt: notification.createdAt,
        readAt: null,
      });
    } catch {
      console.error("Could not save or deliver admin trust mark notification");
    }
  }
}

async function clearOtherActiveTrustMarks(
  dealId: mongoose.Types.ObjectId,
  currentDisputeId: mongoose.Types.ObjectId,
  adminId: string,
  reason: string,
  session: mongoose.ClientSession,
) {
  const activeDisputes = await DisputeModel.find({
    deal: dealId,
    state: "RESOLVED",
    trustMarkActive: true,
    _id: { $ne: currentDisputeId },
  }).session(session);

  for (const activeDispute of activeDisputes) {
    const previousMark = activeDispute.trustMark;
    activeDispute.trustMark = "NONE";
    activeDispute.trustMarkActive = false;
    activeDispute.trustMarkReason = "";
    activeDispute.trustMarkUpdatedBy = new mongoose.Types.ObjectId(adminId);
    activeDispute.trustMarkUpdatedAt = new Date();
    await activeDispute.save({ session });

    await DisputeAuditModel.create(
      [
        {
          dispute: activeDispute._id,
          deal: dealId,
          actor: adminId,
          action: "TRUST_MARK_CHANGED",
          reason: `Cleared because another dispute review changed the deal's active trust mark: ${reason}`.slice(0, 1000),
          previousMark,
          nextMark: "NONE",
        },
      ],
      { session },
    );
  }

  return activeDisputes.length;
}

// ADMIN: review current or resolved disputes. Names and deal details are
// restricted to this route; public profile summaries expose counts only.
router.get("/disputes", async (req, res) => {
  const parsed = listSchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const disputes = await DisputeModel.find({ state: parsed.data.state })
    .sort({ createdAt: -1 })
    .limit(100)
    .populate("deal", "title brief amount currency status collaborationType payments draftUrl postUrl")
    .populate("brand", "name email")
    .populate("influencer", "name email")
    .populate("raisedBy", "name email")
    .populate("resolvedBy", "name email")
    .lean();

  res.json({ disputes });
});

router.get("/disputes/:id/audit", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Dispute not found" });
  }
  const exists = await DisputeModel.exists({ _id: req.params.id });
  if (!exists) return res.status(404).json({ message: "Dispute not found" });
  const events = await DisputeAuditModel.find({ dispute: req.params.id })
    .sort({ createdAt: 1 })
    .populate("actor", "name email")
    .lean();
  res.json({ events });
});

// ADMIN: unfreeze a disputed deal, restore its last active stage, and record
// the reviewed outcome and optional anonymous trust mark atomically.
router.post("/disputes/:id/resolve", async (req, res) => {
  const parsed = resolutionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Dispute not found" });
  }

  const session = await mongoose.startSession();
  let restoredStatus: DealStatus | null = null;
  let notificationDetails: TrustMarkNotificationDetails | null = null;
  try {
    await session.withTransaction(async () => {
      const dispute = await DisputeModel.findOne({
        _id: req.params.id,
        state: "OPEN",
      }).session(session);
      if (!dispute) throw new ReviewConflict("Dispute is already resolved or missing");

      const deal = await DealModel.findOne({
        _id: dispute.deal,
        status: "DISPUTED",
      }).session(session);
      if (!deal) throw new ReviewConflict("Disputed deal is missing or has changed");

      const nextDealStatus = nextStatus(
        deal.status as DealStatus,
        "resolveDispute",
        "ADMIN",
        { paid: true },
        dispute.previousStatus as DealStatus,
      );
      if (!nextDealStatus) throw new ReviewConflict("The previous deal stage cannot be restored");

      const now = new Date();
      const clearedOtherMarks = await clearOtherActiveTrustMarks(
        deal._id,
        dispute._id,
        req.user!.userId,
        parsed.data.reason,
        session,
      );

      const updatedDeal = await DealModel.findOneAndUpdate(
        { _id: deal._id, status: "DISPUTED" },
        {
          $set: { status: nextDealStatus },
          $push: {
            statusHistory: {
              status: nextDealStatus,
              by: req.user!.userId,
              at: now,
              note: `Admin reviewed dispute: ${parsed.data.reason}`,
            },
          },
        },
        { new: true, session },
      );
      if (!updatedDeal) throw new ReviewConflict("Disputed deal changed during review");

      dispute.state = "RESOLVED";
      dispute.resolutionNote = parsed.data.reason;
      dispute.resolvedBy = new mongoose.Types.ObjectId(req.user!.userId);
      dispute.resolvedAt = now;
      dispute.trustMark = parsed.data.trustMark;
      dispute.trustMarkActive = parsed.data.trustMark !== "NONE";
      dispute.trustMarkReason = parsed.data.trustMark === "NONE" ? "" : parsed.data.reason;
      dispute.trustMarkUpdatedBy = new mongoose.Types.ObjectId(req.user!.userId);
      dispute.trustMarkUpdatedAt = now;
      await dispute.save({ session });

      await DisputeAuditModel.create(
        [
          {
            dispute: dispute._id,
            deal: deal._id,
            actor: req.user!.userId,
            action: "RESOLVED",
            reason: parsed.data.reason,
            previousMark: "NONE",
            nextMark: parsed.data.trustMark,
            previousStatus: "DISPUTED",
            nextStatus: nextDealStatus,
          },
        ],
        { session },
      );
      restoredStatus = nextDealStatus;
      if (parsed.data.trustMark !== "NONE" || clearedOtherMarks > 0) {
        notificationDetails = {
          dealId: String(deal._id),
          dealTitle: deal.title,
          brandId: String(dispute.brand),
          influencerId: String(dispute.influencer),
        };
      }
    });
  } catch (error) {
    if (error instanceof ReviewConflict) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(503).json({ message: "Could not save the dispute review. Please retry." });
  } finally {
    await session.endSession();
  }

  if (!restoredStatus) {
    return res.status(409).json({ message: "Dispute review did not complete" });
  }
  if (notificationDetails) {
    await notifyTrustMarkParticipants(notificationDetails, req.user!.userId);
  }
  res.json({ ok: true, restoredStatus, trustMark: parsed.data.trustMark });
});

// ADMIN: change or clear a previously reviewed trust mark. Each correction
// requires a reason and is appended to the immutable audit collection.
router.patch("/disputes/:id/trust-mark", async (req, res) => {
  const parsed = trustMarkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Dispute not found" });
  }

  const session = await mongoose.startSession();
  let notificationDetails: TrustMarkNotificationDetails | null = null;
  try {
    await session.withTransaction(async () => {
      const dispute = await DisputeModel.findOne({
        _id: req.params.id,
        state: "RESOLVED",
      }).session(session);
      if (!dispute) throw new ReviewConflict("Only reviewed disputes can have a trust mark");

      const previousMark = dispute.trustMark;
      const nextMark = parsed.data.trustMark;
      const now = new Date();
      const clearedOtherMarks = await clearOtherActiveTrustMarks(
        dispute.deal,
        dispute._id,
        req.user!.userId,
        parsed.data.reason,
        session,
      );
      if (previousMark !== nextMark || clearedOtherMarks > 0) {
        const deal = await DealModel.findById(dispute.deal)
          .select("title")
          .session(session);
        if (deal) {
          notificationDetails = {
            dealId: String(deal._id),
            dealTitle: deal.title,
            brandId: String(dispute.brand),
            influencerId: String(dispute.influencer),
          };
        }
      }
      dispute.trustMark = nextMark;
      dispute.trustMarkActive = nextMark !== "NONE";
      dispute.trustMarkReason = nextMark === "NONE" ? "" : parsed.data.reason;
      dispute.trustMarkUpdatedBy = new mongoose.Types.ObjectId(req.user!.userId);
      dispute.trustMarkUpdatedAt = now;
      await dispute.save({ session });
      await DisputeAuditModel.create(
        [
          {
            dispute: dispute._id,
            deal: dispute.deal,
            actor: req.user!.userId,
            action: "TRUST_MARK_CHANGED",
            reason: parsed.data.reason,
            previousMark,
            nextMark,
          },
        ],
        { session },
      );
    });
  } catch (error) {
    if (error instanceof ReviewConflict) {
      return res.status(409).json({ message: error.message });
    }
    return res.status(503).json({ message: "Could not update the trust mark. Please retry." });
  } finally {
    await session.endSession();
  }

  if (notificationDetails) {
    await notifyTrustMarkParticipants(notificationDetails, req.user!.userId);
  }
  res.json({ ok: true, trustMark: parsed.data.trustMark });
});

export default router;
