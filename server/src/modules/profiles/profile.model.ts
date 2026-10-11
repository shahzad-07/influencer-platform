import { Schema, model } from "mongoose";

const socialLinkSchema = new Schema(
  {
    platform: {
      type: String,
      enum: ["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"],
      required: true,
    },
    url: { type: String, required: true, trim: true },
    followers: { type: Number, min: 0, default: 0 },
  },
  { _id: false },
);

const profileSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one profile per influencer
    },
    bio: { type: String, trim: true, maxlength: 500, default: "" },
    niches: { type: [String], default: [] }, // e.g. ["fashion", "tech"]
    location: { type: String, trim: true, default: "" },
    socialLinks: { type: [socialLinkSchema], default: [] },
  },
  { timestamps: true },
);

export const ProfileModel = model("Profile", profileSchema);
