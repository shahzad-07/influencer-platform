import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { PricingModel, SERVICE_TYPES } from "./pricing.model";
import { authenticate, requireRole } from "../auth/auth.middleware";

const router = Router();

const priceSchema = z.object({
  serviceType: z.enum(SERVICE_TYPES),
  amount: z.number().int().min(0), // in paise: Rs 5,000 = 500000
  description: z.string().trim().max(300).optional(),
});

// Influencer: see my own prices
router.get("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const prices = await PricingModel.find({ influencer: req.user!.userId }).sort(
    "serviceType",
  );
  res.json({ prices });
});

// Influencer: add or update a price for one service type
router.put("/me", authenticate, requireRole("INFLUENCER"), async (req, res) => {
  const parsed = priceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ errors: parsed.error.flatten().fieldErrors });
  }

  const { serviceType, ...rest } = parsed.data;
  const price = await PricingModel.findOneAndUpdate(
    { influencer: req.user!.userId, serviceType },
    { $set: rest },
    { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
  );

  res.json({ price });
});

// Influencer: remove a price
router.delete(
  "/me/:serviceType",
  authenticate,
  requireRole("INFLUENCER"),
  async (req, res) => {
    const parsed = z.enum(SERVICE_TYPES).safeParse(req.params.serviceType);
    if (!parsed.success) {
      return res.status(400).json({ message: "Invalid service type" });
    }

    await PricingModel.deleteOne({
      influencer: req.user!.userId,
      serviceType: parsed.data,
    });
    res.json({ message: "Deleted" });
  },
);

// BRAND ONLY: see an influencer's prices
router.get(
  "/influencer/:id",
  authenticate,
  requireRole("BRAND"),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid influencer id" });
    }

    const prices = await PricingModel.find({ influencer: req.params.id }).sort(
      "serviceType",
    );
    res.json({ prices });
  },
);

export default router;
