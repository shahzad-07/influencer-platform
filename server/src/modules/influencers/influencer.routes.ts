import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ProfileModel, LANGUAGES } from "../profiles/profile.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import { getProfileImageUrl } from "../profiles/profile-image-storage";
import { getTrustSummaries } from "../deals/trust-summary";

const router = Router();

// Makes user input safe to use inside a regular expression
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listQuery = z.object({
  niche: z.string().trim().max(30).optional(),
  location: z.string().trim().max(100).optional(),
  language: z.enum(LANGUAGES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});

// BRAND ONLY: browse influencers
router.get("/", authenticate, requireRole("BRAND"), async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { niche, location, language, page, limit } = parsed.data;

  const filter: Record<string, unknown> = {};
  if (niche) filter.niches = new RegExp(`^${escapeRegex(niche)}$`, "i");
  if (location) filter.location = new RegExp(escapeRegex(location), "i");
  // Matches any profile whose languages list contains this one
  if (language) filter.languages = language;

  const [profiles, total] = await Promise.all([
    ProfileModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ user: { _id: mongoose.Types.ObjectId; name: string } }>(
        "user",
        "name",
      )
      .lean(),
    ProfileModel.countDocuments(filter),
  ]);

  const influencers = profiles
    .filter((p) => p.user) // skip profiles whose user no longer exists
    .map((p) => ({
      id: String(p.user._id),
      name: p.user.name,
      bio: p.bio,
      niches: p.niches,
      followerCount: p.followerCount ?? 0,
      languages: p.languages ?? [],
      location: p.location,
      socialLinks: p.socialLinks,
      socialHandle: getSocialHandle(p.socialLinks?.[0]?.platform, p.socialLinks?.[0]?.url),
      imageUrl: getProfileImageUrl(p.imagePath),
    }));

  res.json({ influencers, total, page, limit });
});

// BRAND ONLY: one influencer's profile
router.get("/:id", authenticate, requireRole("BRAND"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: "Invalid influencer id" });
  }

  const profile = await ProfileModel.findOne({ user: req.params.id })
    .populate<{
      user: { _id: mongoose.Types.ObjectId; name: string };
    }>("user", "name")
    .lean();

  if (!profile || !profile.user) {
    return res.status(404).json({ message: "Influencer not found" });
  }

  const userId = String(profile.user._id);
  const trustSummary = (await getTrustSummaries([userId])).get(userId) ?? {
    pendingPayments: 0,
    pendingDeliverables: 0,
  };

  res.json({
    influencer: {
      id: String(profile.user._id),
      name: profile.user.name,
      bio: profile.bio,
      niches: profile.niches,
      followerCount: profile.followerCount ?? 0,
      languages: profile.languages ?? [],
      location: profile.location,
      socialLinks: profile.socialLinks,
      socialHandle: getSocialHandle(profile.socialLinks?.[0]?.platform, profile.socialLinks?.[0]?.url),
      imageUrl: getProfileImageUrl(profile.imagePath),
      portfolio: profile.portfolio ?? [],
      trustSummary,
    },
  });
});

export default router;

function getSocialHandle(platform?: string, url?: string) {
  if (!platform || !url) return "";
  try {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    const pathIndex = platform === "LINKEDIN" && ["in", "company"].includes(segments[0]?.toLowerCase())
      ? 1
      : platform === "YOUTUBE" && ["channel", "c", "user"].includes(segments[0]?.toLowerCase())
        ? 1
        : 0;
    const handle = segments[pathIndex]?.replace(/^@/, "");
    return handle ? `@${handle}` : "";
  } catch {
    return "";
  }
}
