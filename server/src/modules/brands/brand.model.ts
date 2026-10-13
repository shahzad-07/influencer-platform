import { Schema, model } from "mongoose";

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
  },
  { timestamps: true },
);

export const BrandProfileModel = model("BrandProfile", brandProfileSchema);
