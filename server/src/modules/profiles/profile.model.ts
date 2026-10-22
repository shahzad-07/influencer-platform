import { Schema, model } from "mongoose";

// Languages an influencer can make content in. A fixed list keeps the
// brand-search filter clean ("Hindi" always means Hindi). The client keeps
// the same list in client/src/lib/languages.ts, so change both together.
export const LANGUAGES = [
  "English",
  "Hindi",
  "Urdu",
  "Bengali",
  "Telugu",
  "Marathi",
  "Tamil",
  "Gujarati",
  "Kannada",
  "Malayalam",
  "Odia",
  "Punjabi",
  "Assamese",
] as const;
export type Language = (typeof LANGUAGES)[number];

export const MAX_LANGUAGES = 6;

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

// One piece of past work: a link plus a short description (no file uploads)
const portfolioItemSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 100 },
    platform: {
      type: String,
      enum: ["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN", "OTHER"],
      required: true,
    },
    url: { type: String, required: true, trim: true, maxlength: 300 },
    summary: { type: String, trim: true, maxlength: 300, default: "" },
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
    // Used for campaign matching; this is self-declared by the creator.
    followerCount: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    // Profiles saved before this field existed simply have none
    languages: {
      type: [{ type: String, enum: LANGUAGES }],
      default: [],
    },
    location: { type: String, trim: true, default: "" },
    socialLinks: { type: [socialLinkSchema], default: [] },
    imagePath: { type: String, trim: true, default: "" },
    portfolio: { type: [portfolioItemSchema], default: [] },
  },
  { timestamps: true },
);

export const ProfileModel = model("Profile", profileSchema);
