import { Schema, model } from "mongoose";

export const ACCOUNT_STATUSES = ["ACTIVE", "SUSPENDED", "REMOVED"] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: { type: String, required: true },
    // ADMIN accounts are promoted directly by the owner in Atlas; public
    // registration remains limited to BRAND and INFLUENCER.
    role: { type: String, enum: ["ADMIN", "BRAND", "INFLUENCER"], required: true },
    accountStatus: { type: String, enum: ACCOUNT_STATUSES, default: "ACTIVE", required: true },
  },
  { timestamps: true },
);

export const UserModel = model("User", userSchema);
