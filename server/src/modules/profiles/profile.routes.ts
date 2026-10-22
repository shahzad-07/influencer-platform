import { Router } from "express";
import { z } from "zod";
import { ProfileModel, LANGUAGES, MAX_LANGUAGES } from "./profile.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import {
  createProfileImageUpload,
  deleteProfileImage,
  getProfileImageUrl,
  getProfileImageInfo,
  isProfileImagePathForUser,
  isProfileImageStorageConfigured,
  isProfileImageType,
  PROFILE_IMAGE_MAX_BYTES,
} from "./profile-image-storage";

const router = Router();

// Only real web links are accepted
const httpUrl = z
  .string()
  .trim()
  .max(300)
  .refine(
    (v) => /^https?:\/\/\S+$/i.test(v),
    "Must start with http:// or https://",
  );

const profileSchema = z.object({
  bio: z.string().max(500).optional(),
  niches: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  followerCount: z.number().int().min(0).max(1_000_000_000).optional(),
  // Only languages from the fixed list, no repeats
  languages: z
    .array(z.enum(LANGUAGES))
    .max(MAX_LANGUAGES)
    .transform((list) => [...new Set(list)])
    .optional(),
  location: z.string().trim().max(100).optional(),
  imagePath: z.string().trim().max(300).optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.enum(["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"]),
        url: httpUrl,
        followers: z.number().int().min(0).optional(),
      }),
    )
    .max(5)
    .optional(),
  portfolio: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(100),
        platform: z.enum([
          "INSTAGRAM",
          "YOUTUBE",
          "FACEBOOK",
          "X",
          "LINKEDIN",
          "OTHER",
        ]),
        url: httpUrl,
        summary: z.string().trim().max(300).optional(),
      }),
    )
    .max(12)
    .optional(),
});

const imageUploadSchema = z.object({
  contentType: z.string(),
  sizeBytes: z.number().int().positive().max(PROFILE_IMAGE_MAX_BYTES),
});

// Get my own profile
router.get("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const profile = await ProfileModel.findOne({ user: req.user!.userId });
  res.json({
    profile: profile
      ? { ...profile.toObject(), imageUrl: getProfileImageUrl(profile.imagePath) }
      : null,
  });
});

router.post(
  "/me/image-upload",
  authenticate,
  requireRole("INFLUENCER"),
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
        "creator",
        parsed.data.contentType,
      );
      res.json(upload);
    } catch {
      res.status(503).json({ message: "Could not prepare the profile image upload." });
    }
  },
);

// Create or update my profile
router.put("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const imagePath = parsed.data.imagePath;
  if (
    imagePath !== undefined &&
    imagePath !== "" &&
    !isProfileImagePathForUser(imagePath, "creator", req.user!.userId)
  ) {
    return res.status(400).json({ message: "Invalid profile image path." });
  }

  const existing = imagePath === undefined
    ? null
    : await ProfileModel.findOne({ user: req.user!.userId }).select("imagePath").lean();
  if (imagePath && imagePath !== existing?.imagePath) {
    const info = await getProfileImageInfo(imagePath);
    const metadata = info?.metadata as { size?: number; mimetype?: string; contentType?: string } | undefined;
    const size = Number(info?.size ?? metadata?.size ?? 0);
    const contentType = String(info?.contentType ?? metadata?.mimetype ?? metadata?.contentType ?? "");
    if (!info || size < 1 || size > PROFILE_IMAGE_MAX_BYTES || !isProfileImageType(contentType)) {
      return res.status(400).json({ message: "Upload a JPG, PNG or WebP image up to 2 MB before saving." });
    }
  }

  const profile = await ProfileModel.findOneAndUpdate(
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

export default router;
