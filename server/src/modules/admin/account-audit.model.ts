import { Schema, model } from "mongoose";
import { ACCOUNT_STATUSES } from "../users/user.model";

const accountAuditSchema = new Schema(
  {
    targetUser: { type: Schema.Types.ObjectId, ref: "User", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: ["SUSPEND", "REMOVE", "RESTORE"], required: true },
    reason: { type: String, trim: true, required: true, maxlength: 1000 },
    previousStatus: { type: String, enum: ACCOUNT_STATUSES, required: true },
    nextStatus: { type: String, enum: ACCOUNT_STATUSES, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

accountAuditSchema.index({ targetUser: 1, createdAt: -1 });

export const AccountAuditModel = model("AccountAudit", accountAuditSchema);
