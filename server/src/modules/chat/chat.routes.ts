import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ConversationModel } from "./conversation.model";
import { MessageModel } from "./message.model";
import { UserModel } from "../users/user.model";
import { authenticate } from "../auth/auth.middleware";
import { emitChatChanged, emitNewMessage } from "../../socket";

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

const objectId = z
  .string()
  .refine((v) => mongoose.isValidObjectId(v), "Invalid id");

const startSchema = z.object({
  influencerId: objectId.optional(), // sent by a brand
  brandId: objectId.optional(), // sent by an influencer
});

// EITHER ROLE: start a conversation (or get the existing one)
router.post("/conversations", async (req, res) => {
  const parsed = startSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { userId, role } = req.user!;
  let brandId: string;
  let influencerId: string;

  if (role === "BRAND") {
    if (!parsed.data.influencerId) {
      return res.status(400).json({ message: "influencerId is required" });
    }
    brandId = userId;
    influencerId = parsed.data.influencerId;
  } else {
    if (!parsed.data.brandId) {
      return res.status(400).json({ message: "brandId is required" });
    }
    brandId = parsed.data.brandId;
    influencerId = userId;
  }

  // The other person must exist and have the opposite role
  const targetId = role === "BRAND" ? influencerId : brandId;
  const targetRole = role === "BRAND" ? "INFLUENCER" : "BRAND";
  const targetExists = await UserModel.exists({
    _id: targetId,
    role: targetRole,
  });
  if (!targetExists) {
    return res.status(404).json({
      message: role === "BRAND" ? "Influencer not found" : "Brand not found",
    });
  }

  const conversation = await ConversationModel.findOneAndUpdate(
    { brand: brandId, influencer: influencerId },
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

  const allConversations = await ConversationModel.find({
    $or: [{ brand: userId }, { influencer: userId }],
  })
    .select("_id brandLastReadAt influencerLastReadAt")
    .lean();

  const unreadCounts = allConversations.length
    ? await MessageModel.aggregate<{
        _id: mongoose.Types.ObjectId;
        count: number;
      }>([
        {
          $match: {
            $or: allConversations.map((conversation) => ({
              conversation: conversation._id,
              sender: { $ne: new mongoose.Types.ObjectId(userId) },
              createdAt: {
                $gt:
                  (role === "BRAND"
                    ? conversation.brandLastReadAt
                    : conversation.influencerLastReadAt) ?? new Date(0),
              },
            })),
          },
        },
        { $group: { _id: "$conversation", count: { $sum: 1 } } },
      ])
    : [];
  const unreadByConversation = new Map(
    unreadCounts.map((item) => [String(item._id), item.count]),
  );

  res.json({
    unreadTotal: unreadCounts.reduce((total, item) => total + item.count, 0),
    conversations: conversations.map((c) => ({
      id: String(c._id),
      otherUser: {
        id: String(otherId(c)),
        name: nameById.get(String(otherId(c))) ?? "Unknown",
      },
      lastMessageText: c.lastMessageText,
      lastMessageAt: c.lastMessageAt,
      unreadCount: unreadByConversation.get(String(c._id)) ?? 0,
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

// PARTICIPANTS: mark this conversation read for the signed-in participant
router.patch("/conversations/:id/read", async (req, res) => {
  const conversation = await findMyConversation(
    req.params.id,
    req.user!.userId,
  );
  if (!conversation) {
    return res.status(404).json({ message: "Conversation not found" });
  }

  const readAt = new Date();
  if (req.user!.role === "BRAND") {
    conversation.brandLastReadAt = readAt;
  } else {
    conversation.influencerLastReadAt = readAt;
  }
  await conversation.save();
  emitChatChanged(req.user!.userId);

  res.json({ readAt });
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

  const payload = {
    id: String(message._id),
    sender: String(message.sender),
    text: message.text,
    createdAt: message.createdAt,
  };

  // Push to everyone currently in this conversation's room
  emitNewMessage(String(conversation._id), payload);
  const recipientId =
    req.user!.role === "BRAND"
      ? String(conversation.influencer)
      : String(conversation.brand);
  emitChatChanged(recipientId);

  res.status(201).json({ message: payload });
});

export default router;
