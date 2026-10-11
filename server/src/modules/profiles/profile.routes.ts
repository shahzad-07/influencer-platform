import { Router } from "express";
import { z } from "zod";
import { ProfileModel } from "./profile.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

const router = Router();

const profileSchema = z.object({
  bio: z.string().max(500).optional(),
  niches: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  location: z.string().trim().max(100).optional(),
  socialLinks: z
    .array(
      z.object({
        platform: z.enum(["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"]),
        url: z.string().url(),
        followers: z.number().int().min(0).optional(),
      }),
    )
    .max(5)
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
