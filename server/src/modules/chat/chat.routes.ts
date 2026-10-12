import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ConversationModel } from "./conversation.model";
import { MessageModel } from "./message.model";
import { UserModel } from "../users/user.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

const router = Router();

// Every chat route requires a logged-in user
router.use(authenticate);

// Finds a conversation only if the user is one of its two participants
async function findMyConversation(conversationId: string, userId: string) {
  if (!mongoose.isValidObjectId(conversationId)) return null;
  return ConversationModel.findOne({
    _id: conversationId,
    $or: [{ brand: userId }, { influencer: userId }],
  });
}

// BRAND: start a conversation (or get the existing one)
router.post("/conversations", requireRole("BRAND"), async (req, res) => {
  const parsed = z
    .object({
      influencerId: z
        .string()
        .refine((v) => mongoose.isValidObjectId(v), "Invalid id"),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { influencerId } = parsed.data;

  const isInfluencer = await UserModel.exists({
    _id: influencerId,
    role: "INFLUENCER",
  });
  if (!isInfluencer) {
    return res.status(404).json({ message: "Influencer not found" });
  }

  const conversation = await ConversationModel.findOneAndUpdate(
    { brand: req.user!.userId, influencer: influencerId },
    { $setOnInsert: { lastMessageText: "" } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  res.json({ conversationId: String(conversation._id) });
});

// BOTH: list my conversations
router.get("/conversations", async (req, res) => {
  const { userId, role } = req.user!;

  const conversations = await ConversationModel.find({
    $or: [{ brand: userId }, { influencer: userId }],
  })
    .sort({ lastMessageAt: -1 })
    .limit(50)
    .lean();

  const otherId = (c: (typeof conversations)[number]) =>
    role === "BRAND" ? c.influencer : c.brand;

  const users = await UserModel.find({
    _id: { $in: conversations.map(otherId) },
  })
    .select("name")
    .lean();
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  res.json({
    conversations: conversations.map((c) => ({
      id: String(c._id),
      otherUser: {
        id: String(otherId(c)),
        name: nameById.get(String(otherId(c))) ?? "Unknown",
      },
      lastMessageText: c.lastMessageText,
      lastMessageAt: c.lastMessageAt,
    })),
  });
});

// PARTICIPANTS: load the latest 50 messages (oldest first)
router.get("/conversations/:id/messages", async (req, res) => {
  const conversation = await findMyConversation(
    req.params.id,
    req.user!.userId,
  );
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const messages = await MessageModel.find({ conversation: conversation._id })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();
  messages.reverse();

  res.json({
    messages: messages.map((m) => ({
      id: String(m._id),
      sender: String(m.sender),
      text: m.text,
      createdAt: m.createdAt,
    })),
  });
});

// PARTICIPANTS: send a message
router.post("/conversations/:id/messages", async (req, res) => {
  const parsed = z
    .object({ text: z.string().trim().min(1).max(2000) })
    .safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const conversation = await findMyConversation(
    req.params.id,
    req.user!.userId,
  );
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const message = await MessageModel.create({
    conversation: conversation._id,
    sender: req.user!.userId,
    text: parsed.data.text,
  });

  conversation.lastMessageText = parsed.data.text.slice(0, 100);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  res.status(201).json({
    message: {
      id: String(message._id),
      sender: String(message.sender),
      text: message.text,
      createdAt: message.createdAt,
    },
  });
});

export default router;
