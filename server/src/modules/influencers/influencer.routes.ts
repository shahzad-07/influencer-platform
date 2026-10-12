import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { ProfileModel } from "../profiles/profile.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

const router = Router();

// Makes user input safe to use inside a regular expression
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const listQuery = z.object({
  niche: z.string().trim().max(30).optional(),
  location: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(20).default(12),
});

// BRAND ONLY: browse influencers
router.get("/", authenticate, requireRole("BRAND"), async (req, res) => {
  const parsed = listQuery.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }
  const { niche, location, page, limit } = parsed.data;

  const filter: Record<string, unknown> = {};
  if (niche) filter.niches = new RegExp(`^${escapeRegex(niche)}$`, "i");
  if (location) filter.location = new RegExp(escapeRegex(location), "i");

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
      location: p.location,
      socialLinks: p.socialLinks,
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

  res.json({
    influencer: {
      id: String(profile.user._id),
      name: profile.user.name,
      bio: profile.bio,
      niches: profile.niches,
      location: profile.location,
      socialLinks: profile.socialLinks,
    },
  });
});

export default router;
