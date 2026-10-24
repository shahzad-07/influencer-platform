import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ConversationModel } from "./conversation.model";
import { MessageModel } from "./message.model";
import { UserModel } from "../users/user.model";
import { authenticate } from "../auth/auth.middleware";
import { emitChatChanged, emitNewMessage } from "../../socket";
import { CampaignModel } from "../campaigns/campaign.model";

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
    accountStatus: { $in: ["ACTIVE", null] },
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
    .populate("campaign", "title brief niche collaborationType")
    .lean();
  messages.reverse();

  res.json({
    messages: messages.map((m) => ({
      id: String(m._id),
      sender: String(m.sender),
      text: m.text,
      campaign: m.campaign ? {
        id: String((m.campaign as any)._id),
        title: (m.campaign as any).title,
        brief: (m.campaign as any).brief,
        niche: (m.campaign as any).niche,
        collaborationType: (m.campaign as any).collaborationType,
      } : null,
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
    .object({
      text: z.string().trim().max(2000).optional(),
      campaignId: z.string().refine((v) => mongoose.isValidObjectId(v), "Invalid campaign id").optional(),
    })
    .refine((data) => Boolean(data.text || data.campaignId), "Write a message or share a campaign")
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

  const recipientId =
    req.user!.role === "BRAND"
      ? String(conversation.influencer)
      : String(conversation.brand);
  const activeRecipient = await UserModel.exists({
    _id: recipientId,
    accountStatus: { $in: ["ACTIVE", null] },
  });
  if (!activeRecipient) {
    return res.status(409).json({ message: "This account is not active. Messages cannot be sent." });
  }

  let campaign: { _id: mongoose.Types.ObjectId; title: string; brief: string; niche: string; collaborationType: string } | null = null;
  if (parsed.data.campaignId) {
    if (req.user!.role !== "BRAND") return res.status(403).json({ message: "Only the campaign's brand can share it" });
    campaign = await CampaignModel.findOne({
      _id: parsed.data.campaignId,
      brand: req.user!.userId,
      status: "OPEN",
      $expr: { $lt: ["$filledSlots", "$creatorSlots"] },
      $or: [{ deadline: null }, { deadline: { $gt: new Date() } }],
    })
      .select("title brief niche collaborationType").lean();
    if (!campaign) return res.status(404).json({ message: "Open campaign not found" });
  }

  const text = parsed.data.text || `Shared campaign: ${campaign!.title}`;

  const message = await MessageModel.create({
    conversation: conversation._id,
    sender: req.user!.userId,
    text,
    ...(campaign ? { campaign: campaign._id } : {}),
  });

  conversation.lastMessageText = text.slice(0, 100);
  conversation.lastMessageAt = new Date();
  await conversation.save();

  const payload = {
    id: String(message._id),
    sender: String(message.sender),
    text: message.text,
    campaign: campaign ? {
      id: String(campaign._id), title: campaign.title, brief: campaign.brief,
      niche: campaign.niche, collaborationType: campaign.collaborationType,
    } : null,
    createdAt: message.createdAt,
  };

  // Push to everyone currently in this conversation's room
  emitNewMessage(String(conversation._id), payload);
  emitChatChanged(recipientId);

  res.status(201).json({ message: payload });
});

export default router;
