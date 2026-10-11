import { Schema, model } from "mongoose";

export const SERVICE_TYPES = [
  "INSTAGRAM_POST",
  "INSTAGRAM_REEL",
  "INSTAGRAM_STORY",
  "YOUTUBE_VIDEO",
  "YOUTUBE_SHORT",
  "OTHER",
] as const;

const pricingSchema = new Schema(
  {
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    serviceType: { type: String, enum: SERVICE_TYPES, required: true },
    // Stored in the smallest currency unit (paise): Rs 5,000 = 500000
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    currency: { type: String, default: "INR" },
    description: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

// One price per service type per influencer
pricingSchema.index({ influencer: 1, serviceType: 1 }, { unique: true });

export const PricingModel = model("Pricing", pricingSchema);
