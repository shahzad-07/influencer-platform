import { Router } from "express";
import { z } from "zod";
import { PaymentDetailsModel } from "./payment-details.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { encryptJson, decryptJson } from "../../lib/crypto";
import { PaymentShareModel } from "./payment-share.model";

const router = Router();

// Influencers only, for every route in this file
router.use(authenticate, requireRole("INFLUENCER"));

export interface PaymentDetails {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
}

// A text field that may be empty, but must match a pattern when filled in
const optionalPattern = (regex: RegExp, message: string, upper = false) =>
  z
    .string()
    .default("")
    .transform((s) => (upper ? s.trim().toUpperCase() : s.trim()))
    .refine((v) => v === "" || regex.test(v), message);

const detailsSchema = z
  .object({
    accountHolderName: z.string().trim().min(2).max(100),
    bankName: z.string().trim().max(100).default(""),
    accountNumber: optionalPattern(
      /^\d{9,18}$/,
      "Account number must be 9 to 18 digits",
    ),
    ifsc: optionalPattern(
      /^[A-Z]{4}0[A-Z0-9]{6}$/,
      "IFSC must look like HDFC0001234",
      true,
    ),
    upiId: optionalPattern(
      /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,32}$/,
      "UPI ID must look like name@bank",
    ),
  })
  .refine((d) => d.upiId !== "" || (d.accountNumber !== "" && d.ifsc !== ""), {
    message:
      "Provide a UPI ID, or an account number together with its IFSC code",
    path: ["upiId"],
  });

// What the owner sees: the account number is masked to its last 4 digits
function toResponse(d: PaymentDetails, updatedAt: Date) {
  return {
    accountHolderName: d.accountHolderName,
    bankName: d.bankName,
    accountNumberLast4: d.accountNumber.slice(-4),
    ifsc: d.ifsc,
    upiId: d.upiId,
    updatedAt,
  };
}

// My saved details (masked), or null if I haven't saved any
router.get("/me", async (req, res) => {
  const doc = await PaymentDetailsModel.findOne({
    user: req.user!.userId,
  }).select("+data");
  if (!doc) {
    return res.json({ details: null });
  }
  try {
    return res.json({
      details: toResponse(decryptJson<PaymentDetails>(doc.data), doc.updatedAt),
    });
  } catch {
    // Never reveal why (a wrong key, damaged data)
    return res
      .status(500)
      .json({ message: "Could not read the saved details" });
  }
});

// Save (replaces everything)
router.put("/me", async (req, res) => {
  const parsed = detailsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const doc = await PaymentDetailsModel.findOneAndUpdate(
    { user: req.user!.userId },
    { $set: { data: encryptJson(parsed.data) } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ details: toResponse(parsed.data, doc.updatedAt) });
});

// Delete (any open shares end too, since they point at these details)
router.delete("/me", async (req, res) => {
  const userId = req.user!.userId;
  await PaymentDetailsModel.deleteOne({ user: userId });
  await PaymentShareModel.deleteMany({ influencer: userId });
  res.json({ message: "Deleted" });
});

export default router;
