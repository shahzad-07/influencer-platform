import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { DealModel, splitPayment } from "./deal.model";
import { DEAL_ACTIONS, nextStatus, isNoteRequired } from "./deal.transitions";
import type { Actor, DealAction, DealStatus } from "./deal.transitions";
import { UserModel } from "../users/user.model";
import { ConversationModel } from "../chat/conversation.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

const router = Router();

// Every deal route requires a logged-in user
router.use(authenticate);

type PopUser = { _id: mongoose.Types.ObjectId; name: string };

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => /^https?:\/\/\S+$/i.test(v),
    "Must start with http:// or https://",
  );

const createSchema = z.object({
  influencerId: z
    .string()
    .refine((v) => mongoose.isValidObjectId(v), "Invalid id"),
  title: z.string().trim().min(3).max(120),
  brief: z.string().trim().min(10).max(3000),
  amount: z.number().int().min(100), // in paise, so at least Rs 1
  advancePercent: z.number().int().min(0).max(100).default(50),
  deadline: z.coerce
    .date()
    .refine((d) => d.getTime() > Date.now(), "Deadline must be in the future")
    .optional(),
});

const actionSchema = z.object({
  action: z.enum(DEAL_ACTIONS),
  note: z.string().trim().max(1000).optional(),
  url: httpUrl.optional(),
});

function allowedActionsFor(status: DealStatus, actor: Actor): DealAction[] {
  return DEAL_ACTIONS.filter((a) => nextStatus(status, a, actor) !== null);
}

// BRAND: create an offer
router.post("/", requireRole("BRAND"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { influencerId, title, brief, amount, advancePercent, deadline } =
    parsed.data;
  const brandId = req.user!.userId;

  const isInfluencer = await UserModel.exists({
    _id: influencerId,
    role: "INFLUENCER",
  });
  if (!isInfluencer) {
    return res.status(404).json({ message: "Influencer not found" });
  }

  // Link the deal to their chat, if they already have one
  const conversation = await ConversationModel.findOne({
    brand: brandId,
    influencer: influencerId,
  }).select("_id");

  const deal = await DealModel.create({
    brand: brandId,
    influencer: influencerId,
    conversation: conversation?._id,
    title,
    brief,
    amount,
    advancePercent,
    deadline,
    statusHistory: [{ status: "OFFERED", by: brandId }],
  });

  res.status(201).json({ dealId: String(deal._id) });
});

// BOTH: list my deals
router.get("/", async (req, res) => {
  const { userId, role } = req.user!;

  const deals = await DealModel.find(
    role === "BRAND" ? { brand: userId } : { influencer: userId },
  )
    .sort({ updatedAt: -1 })
    .limit(50)
    .populate<{ brand: PopUser; influencer: PopUser }>(
      "brand influencer",
      "name",
    )
    .lean();

  res.json({
    deals: deals
      .filter((d) => d.brand && d.influencer)
      .map((d) => {
        const other = role === "BRAND" ? d.influencer : d.brand;
        return {
          id: String(d._id),
          title: d.title,
          status: d.status,
          amount: d.amount,
          currency: d.currency,
          deadline: d.deadline,
          updatedAt: d.updatedAt,
          otherUser: { id: String(other._id), name: other.name },
        };
      }),
  });
});

// PARTICIPANTS: one deal
router.get("/:id", async (req, res) => {
  const { userId } = req.user!;
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Deal not found" });
  }

  const deal = await DealModel.findOne({
    _id: req.params.id,
    $or: [{ brand: userId }, { influencer: userId }],
  })
    .populate<{ brand: PopUser; influencer: PopUser }>(
      "brand influencer",
      "name",
    )
    .lean();

  if (!deal || !deal.brand || !deal.influencer) {
    return res.status(404).json({ message: "Deal not found" });
  }

  const actor: Actor =
    String(deal.brand._id) === userId ? "BRAND" : "INFLUENCER";

  res.json({
    deal: {
      id: String(deal._id),
      title: deal.title,
      brief: deal.brief,
      deadline: deal.deadline,
      amount: deal.amount,
      currency: deal.currency,
      advancePercent: deal.advancePercent,
      payments: splitPayment(deal.amount, deal.advancePercent),
      status: deal.status,
      expiresAt: deal.expiresAt,
      draftUrl: deal.draftUrl,
      postUrl: deal.postUrl,
      brand: { id: String(deal.brand._id), name: deal.brand.name },
      influencer: {
        id: String(deal.influencer._id),
        name: deal.influencer.name,
      },
      statusHistory: deal.statusHistory.map((h) => ({
        status: h.status,
        at: h.at,
        by: h.by ? String(h.by) : null,
        note: h.note,
      })),
      allowedActions: allowedActionsFor(deal.status as DealStatus, actor),
      createdAt: deal.createdAt,
      updatedAt: deal.updatedAt,
    },
  });
});

// PARTICIPANTS: perform an action on a deal
router.post("/:id/actions", async (req, res) => {
  const parsed = actionSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { action, note = "", url } = parsed.data;
  const { userId } = req.user!;

  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(404).json({ message: "Deal not found" });
  }
  const deal = await DealModel.findOne({
    _id: req.params.id,
    $or: [{ brand: userId }, { influencer: userId }],
  });
  if (!deal) {
    return res.status(404).json({ message: "Deal not found" });
  }

  // Which side am I on? Taken from the deal, never from the request.
  const actor: Actor = String(deal.brand) === userId ? "BRAND" : "INFLUENCER";
  const current = deal.status as DealStatus;

  const next = nextStatus(current, action, actor);
  if (!next) {
    return res
      .status(409)
      .json({ message: "That action isn't allowed right now" });
  }

  // The scheduled job that marks old offers EXPIRED comes later, so check here too
  if (
    action === "accept" &&
    deal.expiresAt &&
    deal.expiresAt.getTime() < Date.now()
  ) {
    return res.status(409).json({ message: "This offer has expired" });
  }

  if (isNoteRequired(action) && !note) {
    return res
      .status(400)
      .json({ message: "A comment is required for this action" });
  }

  const set: Record<string, unknown> = { status: next };
  if (action === "submitDraft") {
    if (!url)
      return res.status(400).json({ message: "A draft link is required" });
    set.draftUrl = url;
  }
  if (action === "submitLink") {
    if (!url)
      return res.status(400).json({ message: "The post link is required" });
    set.postUrl = url;
  }

  // Compare-and-set: only applies if the status is still what we read
  const updated = await DealModel.findOneAndUpdate(
    { _id: deal._id, status: current },
    {
      $set: set,
      $push: {
        statusHistory: { status: next, by: userId, at: new Date(), note },
      },
    },
    { new: true },
  );
  if (!updated) {
    return res.status(409).json({
      message:
        "The deal was just changed by someone else. Refresh and try again.",
    });
  }

  res.json({
    status: updated.status,
    allowedActions: allowedActionsFor(updated.status as DealStatus, actor),
  });
});

export default router;
