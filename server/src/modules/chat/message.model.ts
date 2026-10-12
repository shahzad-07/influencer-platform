import { Schema, model } from "mongoose";

const messageSchema = new Schema(
  {
    conversation: {
      type: Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
    },
    sender: { type: Schema.Types.ObjectId, ref: "User", required: true },
    text: { type: String, required: true, trim: true, maxlength: 2000 },
  },
  { timestamps: true },
);

// Fast "messages in this conversation, in order" lookups
messageSchema.index({ conversation: 1, createdAt: 1 });

export const MessageModel = model("Message", messageSchema);
