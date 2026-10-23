import { Schema, model } from "mongoose";
import { TRUST_MARKS } from "./dispute.model";

const disputeAuditSchema = new Schema(
  {
    dispute: { type: Schema.Types.ObjectId, ref: "Dispute", required: true },
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: {
      type: String,
      enum: ["OPENED", "RESOLVED", "TRUST_MARK_CHANGED"],
      required: true,
    },
    reason: { type: String, trim: true, required: true, maxlength: 1000 },
    previousMark: { type: String, enum: TRUST_MARKS },
    nextMark: { type: String, enum: TRUST_MARKS },
    previousStatus: { type: String, maxlength: 40 },
    nextStatus: { type: String, maxlength: 40 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

disputeAuditSchema.index({ dispute: 1, createdAt: 1 });

export const DisputeAuditModel = model("DisputeAudit", disputeAuditSchema);
