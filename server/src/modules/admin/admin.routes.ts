import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { DealModel } from "../deals/deal.model";
import { nextStatus } from "../deals/deal.transitions";
import type { DealStatus } from "../deals/deal.transitions";
import { DisputeAuditModel } from "../deals/dispute-audit.model";
import { DisputeModel, TRUST_MARKS } from "../deals/dispute.model";
import { NotificationModel } from "../notifications/notification.model";
import { emitNotification } from "../../socket";

const router = Router();
router.use(authenticate, requireRole("ADMIN"));

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
      if (parsed.data.trustMark !== "NONE") {
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
      if (previousMark !== nextMark) {
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
