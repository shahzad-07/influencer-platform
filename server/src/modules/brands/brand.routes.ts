import { Router } from "express";
import { z } from "zod";
import { BrandProfileModel } from "./brand.model";
import { authenticate, requireRole } from "../auth/auth.middleware";
import mongoose from "mongoose";

const router = Router();

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
});

// Brand: get my own profile
router.get("/me", authenticate, requireRole("BRAND"), async (req, res) => {
  const profile = await BrandProfileModel.findOne({ user: req.user!.userId });
  res.json({ profile });
});

// Brand: create or update my profile
router.put("/me", authenticate, requireRole("BRAND"), async (req, res) => {
  const parsed = brandSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const profile = await BrandProfileModel.findOneAndUpdate(
    { user: req.user!.userId },
    { $set: parsed.data },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.json({ profile });
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

    res.json({
      brand: {
        id: String(profile.user._id),
        name: profile.companyName || profile.user.name,
        industry: profile.industry,
        website: profile.website,
        description: profile.description,
        location: profile.location,
      },
    });
  },
);

export default router;
