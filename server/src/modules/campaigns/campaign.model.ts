import { Schema, model } from "mongoose";
import { COLLAB_TYPES } from "../deals/deal.model";
import { LANGUAGES } from "../profiles/profile.model";

export const CAMPAIGN_STATUSES = ["OPEN", "CLOSED"] as const;

const campaignSchema = new Schema(
  {
    brand: { type: Schema.Types.ObjectId, ref: "User", required: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    brief: { type: String, required: true, trim: true, maxlength: 3000 },
    niche: { type: String, required: true, trim: true, maxlength: 30 },
    minFollowers: { type: Number, required: true, min: 0, validate: Number.isInteger },
    languages: { type: [{ type: String, enum: LANGUAGES }], default: [] },
    creatorSlots: { type: Number, required: true, min: 1, max: 100, validate: Number.isInteger },
    filledSlots: { type: Number, default: 0, min: 0, validate: Number.isInteger },
    collaborationType: { type: String, enum: COLLAB_TYPES, required: true },
    barterDescription: { type: String, trim: true, maxlength: 500, default: "" },
    deadline: { type: Date },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: "OPEN", required: true },
  },
  { timestamps: true },
);

campaignSchema.index({ brand: 1, createdAt: -1 });
campaignSchema.index({ status: 1, deadline: 1, niche: 1 });

export const CampaignModel = model("Campaign", campaignSchema);
