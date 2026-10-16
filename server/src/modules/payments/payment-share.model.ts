import { Schema, model } from "mongoose";

// How long a share stays open. A server setting: influencers cannot change it.
export const SHARE_HOURS = 6;

export const SHARE_STAGES = ["ADVANCE", "FINAL"] as const;
export type ShareStage = (typeof SHARE_STAGES)[number];

// The deal status each payment stage belongs to
export const STAGE_STATUS = {
  ADVANCE: "ACCEPTED",
  FINAL: "LINK_VERIFIED",
} as const;

const shareSchema = new Schema(
  {
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    brand: { type: Schema.Types.ObjectId, ref: "User", required: true },
    stage: { type: String, enum: SHARE_STAGES, required: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, collection: "payment_shares" },
);

// Only one open share per deal and stage
shareSchema.index({ deal: 1, stage: 1 }, { unique: true });
// MongoDB deletes the share once expiresAt passes (about once a minute)
shareSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PaymentShareModel = model("PaymentShare", shareSchema);

// Permanent audit trail. It holds no bank details, so it can outlive the shares.
const logSchema = new Schema(
  {
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    stage: { type: String, enum: SHARE_STAGES, required: true },
    event: {
      type: String,
      enum: ["SHARED", "VIEWED", "REVOKED"],
      required: true,
    },
    by: { type: Schema.Types.ObjectId, ref: "User", required: true },
    at: { type: Date, default: Date.now },
  },
  { collection: "payment_share_logs" },
);

logSchema.index({ deal: 1, at: 1 });

export const PaymentShareLogModel = model("PaymentShareLog", logSchema);
