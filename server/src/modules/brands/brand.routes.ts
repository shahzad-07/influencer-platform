import { Router } from "express";
import { z } from "zod";
import { BrandProfileModel } from "./brand.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import mongoose from "mongoose";
import {
  createProfileImageUpload,
  deleteProfileImage,
  getProfileImageUrl,
  getProfileImageInfo,
  isProfileImagePathForUser,
  isProfileImageStorageConfigured,
  isProfileImageType,
  PROFILE_IMAGE_MAX_BYTES,
} from "../profiles/profile-image-storage";
import { getTrustSummaries } from "../deals/trust-summary";

const router = Router();

const httpUrl = z.string().trim().max(300).refine(
  (value) => /^https?:\/\/\S+$/i.test(value),
  "Social link must start with http:// or https://",
);

const brandSchema = z.object({
  companyName: z.string().trim().max(100).optional(),
  industry: z.string().trim().max(50).optional(),
  website: z
    .string()
    .trim()
    .max(200)
    .refine(
      (v) => v === "" || /^https?:\/\/\S+$/i.test(v),
      "Website must start with http:// or https://",
    )
    .optional(),
  description: z.string().trim().max(500).optional(),
  location: z.string().trim().max(100).optional(),
  imagePath: z.string().trim().max(300).optional(),
  socialLinks: z.array(z.object({
    platform: z.enum(["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"]),
    url: httpUrl,
  })).max(5).optional(),
});

const imageUploadSchema = z.object({
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(PROFILE_IMAGE_MAX_BYTES),
});

// Brand: get my own profile
router.get("/me", authenticate, requireRole("BRAND"), async (req, res) => {
  const profile = await BrandProfileModel.findOne({ user: req.user!.userId });
  res.json({
    profile: profile
      ? { ...profile.toObject(), imageUrl: getProfileImageUrl(profile.imagePath) }
      : null,
  });
});

router.post(
  "/me/image-upload",
  authenticate,
  requireRole("BRAND"),
  async (req, res) => {
    const parsed = imageUploadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: "Choose a JPG, PNG or WebP image up to 2 MB." });
    }
    if (!isProfileImageType(parsed.data.contentType)) {
      return res.status(400).json({ message: "Choose a JPG, PNG or WebP image up to 2 MB." });
    }
    if (!isProfileImageStorageConfigured) {
      return res.status(503).json({ message: "Profile image upload is not configured yet." });
    }
    try {
      const upload = await createProfileImageUpload(
        req.user!.userId,
        "brand",
        parsed.data.contentType,
      );
      res.json(upload);
    } catch {
      res.status(503).json({ message: "Could not prepare the profile image upload." });
    }
  },
);

// Brand: create or update my profile
router.put("/me", authenticate, requireRole("BRAND"), async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const imagePath = parsed.data.imagePath;
  if (
    imagePath !== undefined &&
    imagePath !== "" &&
    !isProfileImagePathForUser(imagePath, "brand", req.user!.userId)
  ) {
    return res.status(400).json({ message: "Invalid profile image path." });
  }

  const existing = imagePath === undefined
    ? null
    : await BrandProfileModel.findOne({ user: req.user!.userId }).select("imagePath").lean();
  if (imagePath && imagePath !== existing?.imagePath) {
    const info = await getProfileImageInfo(imagePath);
    const metadata = info?.metadata as { size?: number; mimetype?: string; contentType?: string } | undefined;
    const size = Number(info?.size ?? metadata?.size ?? 0);
    const contentType = String(info?.contentType ?? metadata?.mimetype ?? metadata?.contentType ?? "");
    if (!info || size < 1 || size > PROFILE_IMAGE_MAX_BYTES || !isProfileImageType(contentType)) {
      return res.status(400).json({ message: "Upload a JPG, PNG or WebP image up to 2 MB before saving." });
    }
  }

  const profile = await BrandProfileModel.findOneAndUpdate(
    { user: req.user!.userId },
    { $set: parsed.data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  if (existing?.imagePath && existing.imagePath !== profile.imagePath) {
    await deleteProfileImage(existing.imagePath);
  }

  res.json({
    profile: { ...profile.toObject(), imageUrl: getProfileImageUrl(profile.imagePath) },
  });
});

// Makes user input safe to use inside a regular expression
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listQuery = z.object({
  industry: z.string().trim().max(50).optional(),
  location: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});

type PopulatedUser = { _id: mongoose.Types.ObjectId; name: string };

// INFLUENCER ONLY: browse brands
router.get("/", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { industry, location, page, limit } = parsed.data;

  const filter: Record<string, unknown> = {};
  if (industry) filter.industry = new RegExp(`^${escapeRegex(industry)}$`, "i");
  if (location) filter.location = new RegExp(escapeRegex(location), "i");

  const [profiles, total] = await Promise.all([
    BrandProfileModel.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate<{ user: PopulatedUser }>("user", "name")
      .lean(),
    BrandProfileModel.countDocuments(filter),
  ]);

  const brands = profiles
    .filter((p) => p.user) // skip profiles whose user no longer exists
    .map((p) => ({
      id: String(p.user._id),
      name: p.companyName || p.user.name,
      industry: p.industry,
      location: p.location,
      description: p.description,
      socialHandle: getSocialHandle(p.socialLinks?.[0]?.platform, p.socialLinks?.[0]?.url),
      imageUrl: getProfileImageUrl(p.imagePath),
    }));

  res.json({ brands, total, page, limit });
});

// INFLUENCER ONLY: one brand's profile
router.get(
  "/:id",
  authenticate,
  requireRole("INFLUENCER"),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid brand id" });
    }

    const profile = await BrandProfileModel.findOne({ user: req.params.id })
      .populate<{ user: PopulatedUser }>("user", "name")
      .lean();

    if (!profile || !profile.user) {
      return res.status(404).json({ message: "Brand not found" });
    }

    const userId = String(profile.user._id);
    const trustSummary = (await getTrustSummaries([userId])).get(userId) ?? {
      pendingPayments: 0,
      pendingDeliverables: 0,
    };

    res.json({
      brand: {
        id: String(profile.user._id),
        name: profile.companyName || profile.user.name,
        industry: profile.industry,
        website: profile.website,
        description: profile.description,
        location: profile.location,
        socialHandle: getSocialHandle(profile.socialLinks?.[0]?.platform, profile.socialLinks?.[0]?.url),
        socialLinks: profile.socialLinks ?? [],
        imageUrl: getProfileImageUrl(profile.imagePath),
        trustSummary,
      },
    });
  },
);

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
