import { Schema, model } from "mongoose";

const conversationSchema = new Schema(
  {
    brand: { type: Schema.Types.ObjectId, ref: "User", required: true },
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    lastMessageText: { type: String, default: "" },
    lastMessageAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Only one conversation per brand + influencer pair
conversationSchema.index({ brand: 1, influencer: 1 }, { unique: true });
// Fast "my conversations, newest first" lookups
conversationSchema.index({ brand: 1, lastMessageAt: -1 });
conversationSchema.index({ influencer: 1, lastMessageAt: -1 });

export const ConversationModel = model("Conversation", conversationSchema);
