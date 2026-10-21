import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  PaymentShareLogModel,
  SHARE_STAGES,
  STAGE_STATUS,
} from "./payment-share.model";
import { PaymentDetailsModel } from "./payment-details.model";
import type { PaymentDetails } from "./payment-details.routes";
import { DealModel, isPaid, splitPayment } from "../deals/deal.model";
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

const stageParams = z.object({ dealId: objectId, stage: stageSchema });
const dealParams = z.object({ dealId: objectId });

const NOT_AVAILABLE =
  "Payment details are not available for this deal at this payment stage";

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

// BOTH SIDES: payment-detail access history for this deal (never bank details)
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

  const log = await PaymentShareLogModel.find({ deal: deal._id })
    .sort({ at: -1 })
    .limit(50)
    .lean();

  res.json({
    log: log.map((entry) => ({
      stage: entry.stage,
      event: entry.event,
      at: entry.at,
      by: String(entry.by) === String(deal.brand) ? "BRAND" : "INFLUENCER",
    })),
  });
});

// BRAND: view the creator's details at a due payment stage for this deal
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
    if (!isPaid(deal.collaborationType ?? "PAID")) {
      return res
        .status(409)
        .json({ message: "This deal has no payment details to show" });
    }
    if (deal.status !== STAGE_STATUS[stage]) {
      return res.status(409).json({ message: NOT_AVAILABLE });
    }

    const doc = await PaymentDetailsModel.findOne({
      user: deal.influencer,
    }).select("+data");
    if (!doc) {
      return res.status(404).json({ message: NOT_AVAILABLE });
    }

    let details: PaymentDetails;
    try {
      details = decryptJson<PaymentDetails>(doc.data);
    } catch {
      return res
        .status(500)
        .json({ message: "Could not read the payment details" });
    }

    // Log before returning sensitive data so a failed log never gives an
    // unrecorded view. Each successful request creates its own audit entry.
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
