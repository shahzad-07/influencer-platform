import { Schema, model } from "mongoose";

export const CAMPAIGN_APPLICATION_STATUSES = [
  "INTERESTED",
  "OFFERED",
  "ACTIVE",
  "DECLINED",
] as const;

const applicationSchema = new Schema(
  {
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    status: { type: String, enum: CAMPAIGN_APPLICATION_STATUSES, required: true, default: "INTERESTED" },
    deal: { type: Schema.Types.ObjectId, ref: "Deal" },
  },
  { timestamps: true },
);

applicationSchema.index({ campaign: 1, influencer: 1 }, { unique: true });
applicationSchema.index({ campaign: 1, status: 1, createdAt: 1 });
applicationSchema.index({ influencer: 1, status: 1, updatedAt: -1 });

export const CampaignApplicationModel = model("CampaignApplication", applicationSchema);
