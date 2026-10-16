import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  PaymentShareModel,
  PaymentShareLogModel,
  SHARE_HOURS,
  SHARE_STAGES,
  STAGE_STATUS,
} from "./payment-share.model";
import { PaymentDetailsModel } from "./payment-details.model";
import type { PaymentDetails } from "./payment-details.routes";
import { DealModel, splitPayment } from "../deals/deal.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { decryptJson } from "../../lib/crypto";

const router = Router();

// Every route here needs a logged-in user
router.use(authenticate);

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), "Invalid id");
// Accepts "advance" or "ADVANCE"
const stageSchema = z
  .string()
  .transform((s) => s.toUpperCase())
  .pipe(z.enum(SHARE_STAGES));

const shareBody = z.object({ dealId: objectId, stage: stageSchema });
const stageParams = z.object({ dealId: objectId, stage: stageSchema });
const dealParams = z.object({ dealId: objectId });

const NOT_SHARED =
  "Payment details are not shared, or the share has expired. Ask the influencer to share again.";

// A UPI payment link with the amount filled in (the page can turn it into a QR code)
function buildUpiUri(
  details: PaymentDetails,
  amountPaise: number,
  note: string,
): string | null {
  if (!details.upiId) return null;
  const params = new URLSearchParams({
    pa: details.upiId,
    pn: details.accountHolderName,
    cu: "INR",
    tn: note,
  });
  if (amountPaise > 0) params.set("am", (amountPaise / 100).toFixed(2));
  return `upi://pay?${params.toString().replace(/\+/g, "%20")}`;
}

// INFLUENCER: share my payment details for one stage of one deal
router.post("/", requireRole("INFLUENCER"), async (req, res) => {
  const parsed = shareBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { dealId, stage } = parsed.data;
  const userId = req.user!.userId;

  const deal = await DealModel.findOne({ _id: dealId, influencer: userId });
  if (!deal) {
    return res.status(404).json({ message: "Deal not found" });
  }
  if (deal.status !== STAGE_STATUS[stage]) {
    return res.status(409).json({
      message: `This deal isn't at the ${stage.toLowerCase()} payment stage`,
    });
  }
  if (!(await PaymentDetailsModel.exists({ user: userId }))) {
    return res.status(409).json({ message: "Save your payment details first" });
  }

  // Clear an expired share that MongoDB hasn't removed yet
  await PaymentShareModel.deleteMany({
    deal: deal._id,
    stage,
    expiresAt: { $lte: new Date() },
  });

  const expiresAt = new Date(Date.now() + SHARE_HOURS * 60 * 60 * 1000);
  try {
    await PaymentShareModel.create({
      deal: deal._id,
      influencer: userId,
      brand: deal.brand,
      stage,
      expiresAt,
    });
  } catch (err) {
    // The unique index says a share is already open for this deal and stage
    if ((err as { code?: number }).code === 11000) {
      const existing = await PaymentShareModel.findOne({
        deal: deal._id,
        stage,
      });
      return res.status(409).json({
        message: "Already shared",
        expiresAt: existing?.expiresAt ?? null,
      });
    }
    throw err;
  }

  await PaymentShareLogModel.create({
    deal: deal._id,
    stage,
    event: "SHARED",
    by: userId,
  });
  res.status(201).json({ expiresAt });
});

// INFLUENCER: end a share early (this can only shorten access, never extend it)
router.delete(
  "/deal/:dealId/:stage",
  requireRole("INFLUENCER"),
  async (req, res) => {
    const parsed = stageParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid deal or stage" });
    }
    const { dealId, stage } = parsed.data;
    const userId = req.user!.userId;

    const result = await PaymentShareModel.deleteOne({
      deal: dealId,
      stage,
      influencer: userId,
      expiresAt: { $gt: new Date() },
    });
    if (result.deletedCount === 0) {
      return res
        .status(404)
        .json({ message: "There is no active share to end" });
    }

    await PaymentShareLogModel.create({
      deal: dealId,
      stage,
      event: "REVOKED",
      by: userId,
    });
    res.json({ revoked: true });
  },
);

// BOTH SIDES: which shares are open on this deal, plus the audit trail (no bank details)
router.get("/deal/:dealId", async (req, res) => {
  const parsed = dealParams.safeParse(req.params);
  if (!parsed.success) {
    return res.status(404).json({ message: "Deal not found" });
  }
  const userId = req.user!.userId;

  const deal = await DealModel.findOne({
    _id: parsed.data.dealId,
    $or: [{ brand: userId }, { influencer: userId }],
  })
    .select("brand influencer")
    .lean();
  if (!deal) {
    return res.status(404).json({ message: "Deal not found" });
  }

  const shares = await PaymentShareModel.find({
    deal: deal._id,
    expiresAt: { $gt: new Date() },
  })
    .select("stage expiresAt")
    .lean();
  const log = await PaymentShareLogModel.find({ deal: deal._id })
    .sort({ at: -1 })
    .limit(50)
    .lean();

  res.json({
    shares: shares.map((s) => ({ stage: s.stage, expiresAt: s.expiresAt })),
    log: log.map((l) => ({
      stage: l.stage,
      event: l.event,
      at: l.at,
      by: String(l.by) === String(deal.brand) ? "BRAND" : "INFLUENCER",
    })),
  });
});

// BRAND: view the shared details (only while a valid share exists)
router.get(
  "/deal/:dealId/:stage/view",
  requireRole("BRAND"),
  async (req, res) => {
    const parsed = stageParams.safeParse(req.params);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid deal or stage" });
    }
    const { dealId, stage } = parsed.data;
    const userId = req.user!.userId;

    const deal = await DealModel.findOne({ _id: dealId, brand: userId });
    if (!deal) {
      return res.status(404).json({ message: "Deal not found" });
    }

    // Check the time ourselves: MongoDB's automatic deletion can lag by a minute
    const share = await PaymentShareModel.findOne({
      deal: deal._id,
      stage,
      brand: userId,
    });
    if (!share || share.expiresAt.getTime() <= Date.now()) {
      return res.status(404).json({ message: NOT_SHARED });
    }

    // If the deal has moved past this stage, the details are no longer needed
    if (deal.status !== STAGE_STATUS[stage]) {
      return res
        .status(409)
        .json({ message: "This deal is no longer at that payment stage" });
    }

    const doc = await PaymentDetailsModel.findOne({
      user: deal.influencer,
    }).select("+data");
    if (!doc) {
      return res.status(404).json({ message: NOT_SHARED });
    }

    let details: PaymentDetails;
    try {
      details = decryptJson<PaymentDetails>(doc.data);
    } catch {
      return res
        .status(500)
        .json({ message: "Could not read the payment details" });
    }

    await PaymentShareLogModel.create({
      deal: deal._id,
      stage,
      event: "VIEWED",
      by: userId,
    });

    const { advance, final } = splitPayment(deal.amount, deal.advancePercent);
    const amountDue = stage === "ADVANCE" ? advance : final;

    // Tell browsers and proxies not to keep a copy
    res.set("Cache-Control", "no-store");
    res.json({
      stage,
      expiresAt: share.expiresAt,
      amountDue, // in paise
      currency: deal.currency,
      details: {
        accountHolderName: details.accountHolderName,
        bankName: details.bankName,
        accountNumber: details.accountNumber,
        ifsc: details.ifsc,
        upiId: details.upiId,
      },
      upiUri: buildUpiUri(
        details,
        amountDue,
        `${stage === "ADVANCE" ? "Advance" : "Final"} payment`,
      ),
    });
  },
);

export default router;
