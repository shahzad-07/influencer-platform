import { Schema, model } from "mongoose";
import { DEAL_STATUSES } from "./deal.transitions";

export const TRUST_MARKS = [
  "PAYMENT_PENDING",
  "DELIVERABLE_PENDING",
  "NONE",
] as const;
export type TrustMark = (typeof TRUST_MARKS)[number];

const disputeSchema = new Schema(
  {
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    brand: { type: Schema.Types.ObjectId, ref: "User", required: true },
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    raisedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    reason: { type: String, trim: true, required: true, maxlength: 1000 },
    previousStatus: { type: String, enum: DEAL_STATUSES, required: true },
    state: { type: String, enum: ["OPEN", "RESOLVED"], default: "OPEN", required: true },
    resolutionNote: { type: String, trim: true, maxlength: 1000, default: "" },
    resolvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    resolvedAt: { type: Date },
    trustMark: { type: String, enum: TRUST_MARKS, default: "NONE", required: true },
    trustMarkActive: { type: Boolean, default: false, required: true },
    trustMarkReason: { type: String, trim: true, maxlength: 1000, default: "" },
    trustMarkUpdatedBy: { type: Schema.Types.ObjectId, ref: "User" },
    trustMarkUpdatedAt: { type: Date },
  },
  { timestamps: true },
);

// A deal can have a later dispute after an earlier one has been reviewed.
disputeSchema.index(
  { deal: 1 },
  { unique: true, partialFilterExpression: { state: "OPEN" } },
);
disputeSchema.index({ brand: 1, state: 1, trustMark: 1, trustMarkActive: 1 });
disputeSchema.index({ influencer: 1, state: 1, trustMark: 1, trustMarkActive: 1 });

export const DisputeModel = model("Dispute", disputeSchema);
