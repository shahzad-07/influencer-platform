import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { CampaignModel } from "./campaign.model";
import { CampaignApplicationModel } from "./campaign-application.model";
import { ProfileModel, LANGUAGES, MAX_LANGUAGES } from "../profiles/profile.model";
import { UserModel } from "../users/user.model";
import { COLLAB_TYPES } from "../deals/deal.model";
import { ConversationModel } from "../chat/conversation.model";
import { MessageModel } from "../chat/message.model";
import { NotificationModel } from "../notifications/notification.model";
import { emitChatChanged, emitNewMessage, emitNotification } from "../../socket";

const router = Router();
router.use(authenticate);

const idSchema = z.string().refine(mongoose.isValidObjectId, "Invalid id");
const campaignSchema = z.object({
  title: z.string().trim().min(3).max(120),
  brief: z.string().trim().min(10).max(3000),
  niche: z.string().trim().min(1).max(30),
  minFollowers: z.number().int().min(0).max(1_000_000_000),
  languages: z.array(z.enum(LANGUAGES)).max(MAX_LANGUAGES).transform((values) => [...new Set(values)]),
  creatorSlots: z.number().int().min(1).max(100),
  collaborationType: z.enum(COLLAB_TYPES),
  barterDescription: z.string().trim().max(500).default(""),
  deadline: z.coerce.date().refine((value) => value.getTime() > Date.now(), "Deadline must be in the future").optional(),
}).superRefine((value, context) => {
  if (value.collaborationType !== "PAID" && value.barterDescription.length < 5) {
    context.addIssue({ code: "custom", path: ["barterDescription"], message: "Describe the product or service offered (at least 5 characters)" });
  }
});

function isEligible(
  campaign: { niche: string; minFollowers: number; languages: string[] },
  profile: { niches: string[]; followerCount?: number; languages?: string[] },
) {
  const nicheMatches = profile.niches.some((niche) => niche.toLowerCase() === campaign.niche.toLowerCase());
  const languagesMatch = campaign.languages.every((language) => (profile.languages ?? []).includes(language));
  return nicheMatches && (profile.followerCount ?? 0) >= campaign.minFollowers && languagesMatch;
}

function campaignView(campaign: any, applicationStatus?: string) {
  return {
    id: String(campaign._id),
    brandId: String(campaign.brand?._id ?? campaign.brand),
    brandName: campaign.brand?.name ?? "Brand",
    title: campaign.title,
    brief: campaign.brief,
    niche: campaign.niche,
    minFollowers: campaign.minFollowers,
    languages: campaign.languages ?? [],
    creatorSlots: campaign.creatorSlots,
    filledSlots: campaign.filledSlots ?? 0,
    remainingSlots: Math.max(0, campaign.creatorSlots - (campaign.filledSlots ?? 0)),
    collaborationType: campaign.collaborationType,
    barterDescription: campaign.barterDescription ?? "",
    deadline: campaign.deadline ?? null,
    status: campaign.status,
    createdAt: campaign.createdAt,
    applicationStatus: applicationStatus ?? null,
  };
}

// BRANDS see their campaigns; creators see only currently open, eligible campaigns.
router.get("/", async (req, res) => {
  if (req.user!.role === "BRAND") {
    const campaigns = await CampaignModel.find({ brand: req.user!.userId }).sort({ createdAt: -1 }).limit(100).populate("brand", "name").lean();
    return res.json({ campaigns: campaigns.map((item) => campaignView(item)) });
  }

  const profile = await ProfileModel.findOne({ user: req.user!.userId }).lean();
  if (!profile) return res.json({ campaigns: [] });
  const campaigns = await CampaignModel.find({ status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] })
    .sort({ createdAt: -1 }).limit(200).populate("brand", "name").lean();
  const eligible = campaigns.filter((item) => isEligible(item, profile) && item.filledSlots < item.creatorSlots);
  const applications = await CampaignApplicationModel.find({ campaign: { $in: eligible.map((item) => item._id) }, influencer: req.user!.userId }).select("campaign status").lean();
  const statusByCampaign = new Map(applications.map((item) => [String(item.campaign), item.status]));
  return res.json({ campaigns: eligible.map((item) => campaignView(item, statusByCampaign.get(String(item._id)))) });
});

// BRAND: create a campaign and notify eligible creators.
router.post("/", requireRole("BRAND"), async (req, res) => {
  const parsed = campaignSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  const campaign = await CampaignModel.create({ ...parsed.data, brand: req.user!.userId });

  const profiles = await ProfileModel.find({}).select("user niches followerCount languages").limit(5000).lean();
  const matches = profiles.filter((profile) => isEligible(campaign, profile)).slice(0, 500);
  const recipientIds = matches.map((profile) => String(profile.user));
  if (recipientIds.length) {
    try {
      const notifications = await NotificationModel.insertMany(recipientIds.map((recipient) => ({
        recipient, campaign: campaign._id, actor: req.user!.userId, action: "campaignNew",
      })));
      for (const notification of notifications) {
        emitNotification(String(notification.recipient), {
          id: String(notification._id), campaignId: String(campaign._id),
          dealId: null, dealTitle: campaign.title, action: "campaignNew",
          actorRole: "BRAND", createdAt: notification.createdAt, readAt: null,
        });
      }
    } catch {
      console.error("Could not save or deliver campaign notifications");
    }
  }
  return res.status(201).json({ campaign: campaignView(campaign), notifiedCreators: recipientIds.length });
});

// BOTH roles: view one campaign. A creator may open a directly shared card even if it is not a match.
router.get("/:id", async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid campaign id" });
  const campaign = await CampaignModel.findById(req.params.id).populate("brand", "name").lean();
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  if (req.user!.role === "BRAND" && String(campaign.brand?._id ?? campaign.brand) !== req.user!.userId) {
    return res.status(404).json({ message: "Campaign not found" });
  }
  const application = req.user!.role === "INFLUENCER"
    ? await CampaignApplicationModel.findOne({ campaign: campaign._id, influencer: req.user!.userId }).select("status").lean()
    : null;
  const creatorProfile = req.user!.role === "INFLUENCER"
    ? await ProfileModel.findOne({ user: req.user!.userId }).select("niches followerCount languages").lean()
    : null;
  return res.json({ campaign: {
    ...campaignView(campaign, application?.status),
    eligible: creatorProfile ? isEligible(campaign, creatorProfile) : false,
  } });
});

// CREATOR: mark interest after server-side eligibility and capacity checks.
router.post("/:id/interest", requireRole("INFLUENCER"), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid campaign id" });
  const campaign = await CampaignModel.findOne({ _id: req.params.id, status: "OPEN", $or: [{ deadline: null }, { deadline: { $gt: new Date() } }] }).lean();
  if (!campaign) return res.status(404).json({ message: "This campaign is no longer open" });
  const profile = await ProfileModel.findOne({ user: req.user!.userId }).lean();
  if (!profile || !isEligible(campaign, profile)) return res.status(403).json({ message: "Your profile does not meet this campaign's niche, language or follower requirements" });
  if (campaign.filledSlots >= campaign.creatorSlots) return res.status(409).json({ message: "All creator spots are filled" });
  try {
    await CampaignApplicationModel.create({ campaign: campaign._id, influencer: req.user!.userId, status: "INTERESTED" });
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === 11000) {
      return res.status(409).json({ message: "You have already responded to this campaign" });
    }
    throw error;
  }
  try {
    const notification = await NotificationModel.create({ recipient: campaign.brand, campaign: campaign._id, actor: req.user!.userId, action: "campaignInterest" });
    emitNotification(String(campaign.brand), {
      id: String(notification._id), campaignId: String(campaign._id), dealId: null,
      dealTitle: campaign.title, action: "campaignInterest", actorRole: "INFLUENCER",
      createdAt: notification.createdAt, readAt: null,
    });
  } catch {
    console.error("Could not save or deliver campaign interest notification");
  }
  return res.status(201).json({ status: "INTERESTED" });
});

// BRAND: share a campaign card with selected creators by creating chat messages.
router.post("/:id/share", requireRole("BRAND"), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid campaign id" });
  const parsed = z.object({ creatorIds: z.array(idSchema).min(1).max(50).transform((ids) => [...new Set(ids)]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  const campaign = await CampaignModel.findOne({
    _id: req.params.id, brand: req.user!.userId, status: "OPEN",
    $expr: { $lt: ["$filledSlots", "$creatorSlots"] },
    $or: [{ deadline: null }, { deadline: { $gt: new Date() } }],
  })
    .select("title brief niche collaborationType").lean();
  if (!campaign) return res.status(404).json({ message: "Open campaign not found" });
  const creators = await UserModel.find({ _id: { $in: parsed.data.creatorIds }, role: "INFLUENCER" }).select("_id").lean();
  if (creators.length !== parsed.data.creatorIds.length) return res.status(400).json({ message: "One or more selected creators could not be found" });

  const sharedWith: string[] = [];
  for (const creator of creators) {
    const conversation = await ConversationModel.findOneAndUpdate(
      { brand: req.user!.userId, influencer: creator._id },
      { $setOnInsert: { lastMessageText: "" } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    const text = `Shared campaign: ${campaign.title}`;
    const message = await MessageModel.create({
      conversation: conversation._id,
      sender: req.user!.userId,
      text,
      campaign: campaign._id,
    });
    conversation.lastMessageText = text.slice(0, 100);
    conversation.lastMessageAt = message.createdAt;
    await conversation.save();
    const payload = {
      id: String(message._id), sender: req.user!.userId, text,
      campaign: {
        id: String(campaign._id), title: campaign.title, brief: campaign.brief,
        niche: campaign.niche, collaborationType: campaign.collaborationType,
      },
      createdAt: message.createdAt,
    };
    emitNewMessage(String(conversation._id), payload);
    emitChatChanged(String(creator._id));
    sharedWith.push(String(creator._id));
  }
  return res.status(201).json({ sharedCount: sharedWith.length, creatorIds: sharedWith });
});

// BRAND: see only applicants on this brand's campaign.
router.get("/:id/applicants", requireRole("BRAND"), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success) return res.status(400).json({ message: "Invalid campaign id" });
  const campaign = await CampaignModel.findOne({ _id: req.params.id, brand: req.user!.userId }).lean();
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  const applications = await CampaignApplicationModel.find({ campaign: campaign._id }).sort({ createdAt: -1 })
    .populate<{ influencer: { _id: mongoose.Types.ObjectId; name: string } }>("influencer", "name")
    .populate<{ deal: { _id: mongoose.Types.ObjectId } | null }>("deal", "_id").lean();
  const profiles = await ProfileModel.find({ user: { $in: applications.map((item) => item.influencer?._id).filter(Boolean) } }).select("user niches followerCount languages").lean();
  const profileByUser = new Map(profiles.map((profile) => [String(profile.user), profile]));
  return res.json({ applicants: applications.filter((item) => item.influencer).map((item) => {
    const profile = profileByUser.get(String(item.influencer._id));
    return {
      id: String(item.influencer._id), name: item.influencer.name,
      status: item.status, dealId: item.deal ? String(item.deal._id) : null,
      niches: profile?.niches ?? [], followerCount: profile?.followerCount ?? 0,
      languages: profile?.languages ?? [],
    };
  }) });
});

// BRAND: decline an application; only INTERESTED applicants can be declined.
router.post("/:id/applicants/:creatorId/decline", requireRole("BRAND"), async (req, res) => {
  if (!idSchema.safeParse(req.params.id).success || !idSchema.safeParse(req.params.creatorId).success) {
    return res.status(400).json({ message: "Invalid id" });
  }
  const campaign = await CampaignModel.exists({ _id: req.params.id, brand: req.user!.userId });
  if (!campaign) return res.status(404).json({ message: "Campaign not found" });
  const application = await CampaignApplicationModel.findOneAndUpdate(
    { campaign: req.params.id, influencer: req.params.creatorId, status: "INTERESTED" },
    { $set: { status: "DECLINED" } }, { new: true },
  );
  if (!application) return res.status(409).json({ message: "This application can no longer be declined" });
  return res.json({ status: application.status });
});

export default router;
