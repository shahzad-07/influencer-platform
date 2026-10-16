import { Router } from "express";
import { z } from "zod";
import { ProfileModel } from "./profile.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

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
  location: z.string().trim().max(100).optional(),
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

// Get my own profile
router.get("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const profile = await ProfileModel.findOne({ user: req.user!.userId });
  res.json({ profile });
});

// Create or update my profile
router.put("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const profile = await ProfileModel.findOneAndUpdate(
    { user: req.user!.userId },
    { $set: parsed.data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.json({ profile });
});

export default router;
