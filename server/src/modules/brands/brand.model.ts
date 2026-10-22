import { Schema, model } from "mongoose";

const brandSocialLinkSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"],
      required: true,
    },
    url: { type: String, required: true, trim: true, maxlength: 300 },
  },
  { _id: false },
);

const brandProfileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one brand profile per brand user
    },
    companyName: { type: String, trim: true, maxlength: 100, default: "" },
    industry: { type: String, trim: true, maxlength: 50, default: "" }, // e.g. "restaurant", "fashion"
    website: { type: String, trim: true, maxlength: 200, default: "" },
    description: { type: String, trim: true, maxlength: 500, default: "" },
    location: { type: String, trim: true, maxlength: 100, default: "" },
    socialLinks: { type: [brandSocialLinkSchema], default: [] },
    imagePath: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

export const BrandProfileModel = model("BrandProfile", brandProfileSchema);
