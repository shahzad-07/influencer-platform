import { Schema, model } from "mongoose";
import { DEAL_ACTIONS } from "../deals/deal.transitions";

const notificationSchema = new Schema(
  {
    recipient: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    actor: { type: Schema.Types.ObjectId, ref: "User", required: true },
    action: { type: String, enum: DEAL_ACTIONS, required: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Fetch one user's notifications with unread items and newest events first.
notificationSchema.index({ recipient: 1, readAt: 1, createdAt: -1 });

export const NotificationModel = model("Notification", notificationSchema);
