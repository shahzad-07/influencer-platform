import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  DealModel,
  splitPayment,
  isPaid,
  COLLAB_TYPES,
  MAX_PAYMENT_ATTEMPTS,
} from "./deal.model";
import type { CollabType } from "./deal.model";
import { DEAL_ACTIONS, nextStatus, isNoteRequired } from "./deal.transitions";
import type {
  Actor,
  DealAction,
  DealStatus,
  DealTerms,
} from "./deal.transitions";
import { UserModel } from "../users/user.model";
import { ConversationModel } from "../chat/conversation.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { PaymentDetailsModel } from "../payments/payment-details.model";

const router = Router();

// Every deal route requires a logged-in user
router.use(authenticate);

type PopUser = { _id: mongoose.Types.ObjectId; name: string };
type PayStage = "ADVANCE" | "FINAL";

// Which actions claim a payment, and which settle one
const SENT_STAGE: Partial<Record<DealAction, PayStage>> = {
  markAdvanceSent: "ADVANCE",
  markFinalSent: "FINAL",
};
const RESOLVE: Partial<
  Record<DealAction, { stage: PayStage; result: "CONFIRMED" | "REJECTED" }>
> = {
  confirmAdvance: { stage: "ADVANCE", result: "CONFIRMED" },
  rejectAdvance: { stage: "ADVANCE", result: "REJECTED" },
  confirmFinal: { stage: "FINAL", result: "CONFIRMED" },
  rejectFinal: { stage: "FINAL", result: "REJECTED" },
};

const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => /^https?:\/\/\S+$/i.test(v),
    "Must start with http:// or https://",
  );

const createSchema = z
  .object({
    influencerId: z
      .string()
      .refine((v) => mongoose.isValidObjectId(v), "Invalid id"),
    title: z.string().trim().min(3).max(120),
    brief: z.string().trim().min(10).max(3000),
    collaborationType: z.enum(COLLAB_TYPES).default("PAID"),
    amount: z.number().int().min(0).default(0), // in paise
    advancePercent: z.number().int().min(0).max(100).default(50),
    barterDescription: z.string().trim().max(500).default(""),
    deadline: z.coerce
      .date()
      .refine((d) => d.getTime() > Date.now(), "Deadline must be in the future")
      .optional(),
  })
  .superRefine((d, ctx) => {
    if (isPaid(d.collaborationType)) {
      if (d.amount < 100) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "Amount must be at least ₹1",
        });
      }
      // 1 to 99, so both the advance and the final payment are real amounts
      if (d.advancePercent < 1 || d.advancePercent > 99) {
        ctx.addIssue({
          code: "custom",
          path: ["advancePercent"],
          message: "The advance must be between 1% and 99%",
        });
      }
    }
    if (d.collaborationType !== "PAID" && d.barterDescription.length < 5) {
      ctx.addIssue({
        code: "custom",
        path: ["barterDescription"],
        message: "Describe what the influencer gets (at least 5 characters)",
      });
    }
  });

const actionSchema = z.object({
  action: z.enum(DEAL_ACTIONS),
  note: z.string().trim().max(1000).optional(),
  url: httpUrl.optional(),
  // Optional. If given, it must look like a UTR; empty counts as not given.
  reference: z
    .string()
    .trim()
    .refine(
      (v) => v === "" || /^[A-Za-z0-9-]{6,30}$/.test(v),
      "Reference must be 6 to 30 letters, digits or dashes",
    )
    .optional(),
});

// Deals made before collaboration types existed have no value, and they are paid
const collabOf = (deal: { collaborationType?: string | null }) =>
  (deal.collaborationType ?? "PAID") as CollabType;

function allowedActionsFor(
  status: DealStatus,
  actor: Actor,
  terms: DealTerms,
): DealAction[] {
  return DEAL_ACTIONS.filter(
    (a) => nextStatus(status, a, actor, terms) !== null,
  );
}

// BRAND: create an offer
router.post("/", requireRole("BRAND"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const {
    influencerId,
    title,
    brief,
    collaborationType,
    amount,
    advancePercent,
    barterDescription,
    deadline,
  } = parsed.data;
  const brandId = req.user!.userId;
  const paid = isPaid(collaborationType);

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
    collaborationType,
    // Barter-only deals carry no money, whatever the request said
    amount: paid ? amount : 0,
    advancePercent: paid ? advancePercent : 0,
    barterDescription: collaborationType === "PAID" ? "" : barterDescription,
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
          collaborationType: collabOf(d),
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
  const collaborationType = collabOf(deal);
  const terms: DealTerms = { paid: isPaid(collaborationType) };
  const payments = deal.payments ?? [];

  res.json({
    deal: {
      id: String(deal._id),
      title: deal.title,
      brief: deal.brief,
      deadline: deal.deadline,
      collaborationType,
      barterDescription: deal.barterDescription ?? "",
      amount: deal.amount,
      currency: deal.currency,
      advancePercent: deal.advancePercent,
      payments: splitPayment(deal.amount, deal.advancePercent),
      paymentRecords: payments.map((p) => ({
        stage: p.stage,
        amount: p.amount,
        reference: p.reference,
        status: p.status,
        sentAt: p.sentAt,
        resolvedAt: p.resolvedAt ?? null,
        note: p.note,
      })),
      // Only money the influencer has confirmed counts as paid
      paidTotal: payments
        .filter((p) => p.status === "CONFIRMED")
        .reduce((sum, p) => sum + p.amount, 0),
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
      allowedActions: allowedActionsFor(
        deal.status as DealStatus,
        actor,
        terms,
      ),
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
  const { action, note = "", url, reference = "" } = parsed.data;
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
  const terms: DealTerms = { paid: isPaid(collabOf(deal)) };

  const next = nextStatus(current, action, actor, terms);
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

  // Paid offers require saved payment details before the creator accepts.
  // Barter-only offers do not need payment details.
  if (
    action === "accept" &&
    terms.paid &&
    !(await PaymentDetailsModel.exists({ user: deal.influencer }))
  ) {
    return res.status(409).json({
      message: "Save your payment details before accepting this paid offer",
    });
  }

  if (isNoteRequired(action) && !note) {
    return res
      .status(400)
      .json({ message: "A comment is required for this action" });
  }

  const set: Record<string, unknown> = { status: next };
  const push: Record<string, unknown> = {
    statusHistory: { status: next, by: userId, at: new Date(), note },
  };

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

  // Claiming a payment: record it. The amount comes from the deal, never from the request.
  const sentStage = SENT_STAGE[action];
  if (sentStage) {
    const payments = deal.payments ?? [];

    // A reference is optional, but when given it can't be used twice on a deal
    if (
      reference &&
      payments.some(
        (p) => (p.reference ?? "").toLowerCase() === reference.toLowerCase(),
      )
    ) {
      return res
        .status(409)
        .json({ message: "That reference was already used on this deal" });
    }
    if (
      payments.filter((p) => p.stage === sentStage).length >=
      MAX_PAYMENT_ATTEMPTS
    ) {
      return res.status(409).json({
        message:
          "Too many payment attempts for this stage. Please cancel the deal or contact support.",
      });
    }

    const { advance, final } = splitPayment(deal.amount, deal.advancePercent);
    const amount = sentStage === "ADVANCE" ? advance : final;
    if (amount <= 0) {
      return res
        .status(409)
        .json({ message: "No payment is due for this stage" });
    }

    push.payments = {
      stage: sentStage,
      amount,
      reference,
      sentAt: new Date(),
      sentBy: userId,
      status: "SENT",
    };
  }

  // Settling a payment: the influencer confirms or rejects the one that is waiting
  const resolve = RESOLVE[action];
  if (resolve) {
    set["payments.$[p].status"] = resolve.result;
    set["payments.$[p].resolvedAt"] = new Date();
    if (note) set["payments.$[p].note"] = note;
  }

  // Compare-and-set: only applies if the status is still what we read
  const update: Record<string, unknown> = { $set: set, $push: push };
  const updated = await DealModel.findOneAndUpdate(
    { _id: deal._id, status: current },
    update,
    {
      new: true,
      ...(resolve
        ? { arrayFilters: [{ "p.stage": resolve.stage, "p.status": "SENT" }] }
        : {}),
    },
  );
  if (!updated) {
    return res.status(409).json({
      message:
        "The deal was just changed by someone else. Refresh and try again.",
    });
  }

  res.json({
    status: updated.status,
    allowedActions: allowedActionsFor(
      updated.status as DealStatus,
      actor,
      terms,
    ),
  });
});

export default router;
