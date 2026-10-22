import { Schema, model } from "mongoose";
import { DEAL_STATUSES } from "./deal.transitions";

// How long an unanswered offer stays open
export const OFFER_VALID_DAYS = 7;

// How many times a payment can be claimed for one stage (advance or final)
export const MAX_PAYMENT_ATTEMPTS = 5;

// What the brand offers in return for the content
export const COLLAB_TYPES = ["PAID", "BARTER", "PAID_AND_BARTER"] as const;
export type CollabType = (typeof COLLAB_TYPES)[number];

// Does money change hands? (everything except barter-only)
export const isPaid = (type: CollabType) => type !== "BARTER";

const historySchema = new Schema(
  {
    status: { type: String, enum: DEAL_STATUSES, required: true },
    by: { type: Schema.Types.ObjectId, ref: "User" }, // empty for SYSTEM actions
    at: { type: Date, default: Date.now },
    // Brand's requested changes, dispute reason, "not received" explanation, etc.
    note: { type: String, trim: true, maxlength: 1000, default: "" },
  },
  { _id: false },
);

// One claimed payment. The brand sends it, the influencer confirms or rejects it.
const paymentSchema = new Schema(
  {
    stage: { type: String, enum: ["ADVANCE", "FINAL"], required: true },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    }, // paise
    // Optional: the brand may leave it empty (stored as an empty string)
    reference: { type: String, trim: true, maxlength: 30, default: "" },
    sentAt: { type: Date, default: Date.now },
    sentBy: { type: Schema.Types.ObjectId, ref: "User" },
    status: {
      type: String,
      enum: ["SENT", "CONFIRMED", "REJECTED"],
      default: "SENT",
    },
    resolvedAt: { type: Date },
    note: { type: String, trim: true, maxlength: 500, default: "" }, // e.g. "only half arrived"
  },
  { _id: false },
);

const visitPlanSchema = new Schema(
  {
    mode: { type: String, enum: ["FIXED", "FLEXIBLE"], required: true },
    // Fixed visit time is stored as an instant; the client enters and displays IST.
    scheduledAt: { type: Date },
    // Flexible windows are calendar dates, not blocked calendar slots.
    startDate: { type: String, trim: true, maxlength: 10 },
    endDate: { type: String, trim: true, maxlength: 10 },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const scheduleSchema = new Schema(
  {
    visitPlan: { type: visitPlanSchema, default: null },
    // A date-only reminder, stored as YYYY-MM-DD.
    goLiveDeadline: { type: String, trim: true, maxlength: 10, default: "" },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false },
);

const dealSchema = new Schema(
  {
    brand: { type: Schema.Types.ObjectId, ref: "User", required: true },
    influencer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    conversation: { type: Schema.Types.ObjectId, ref: "Conversation" },
    campaign: { type: Schema.Types.ObjectId, ref: "Campaign" },
    campaignSlotReserved: { type: Boolean, default: false },

    title: { type: String, required: true, trim: true, maxlength: 120 },
    brief: { type: String, required: true, trim: true, maxlength: 3000 },
    deadline: { type: Date },
    schedule: { type: scheduleSchema, default: () => ({}) },

    // Paid, barter, or both. Deals made before this field existed are paid.
    collaborationType: {
      type: String,
      enum: COLLAB_TYPES,
      default: "PAID",
      required: true,
    },
    // What the influencer gets besides (or instead of) money, e.g. "Dinner for two"
    barterDescription: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },

    // Money in paise (Rs 5,000 = 500000), always whole numbers. Zero for barter-only.
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isInteger,
    },
    currency: { type: String, default: "INR" },
    advancePercent: {
      type: Number,
      default: 50,
      min: 0,
      max: 100,
      validate: Number.isInteger,
    },

    status: {
      type: String,
      enum: DEAL_STATUSES,
      default: "OFFERED",
      required: true,
    },
    statusHistory: { type: [historySchema], default: [] },

    // Every claimed payment, in order (bounded by MAX_PAYMENT_ATTEMPTS per stage)
    payments: { type: [paymentSchema], default: [] },

    // An offer nobody answers expires (applied later by a scheduled job)
    expiresAt: {
      type: Date,
      default: () =>
        new Date(Date.now() + OFFER_VALID_DAYS * 24 * 60 * 60 * 1000),
    },

    draftUrl: { type: String, trim: true, maxlength: 300, default: "" },
    postUrl: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

// Fast "my deals" lookups
dealSchema.index({ brand: 1, updatedAt: -1 });
dealSchema.index({ influencer: 1, updatedAt: -1 });
// Lets the future expiry job find old offers quickly
dealSchema.index({ status: 1, expiresAt: 1 });

export const DealModel = model("Deal", dealSchema);

// Splits the total into advance + final. Whole paise only, so the two always add up.
export function splitPayment(amount: number, advancePercent: number) {
  const advance = Math.round((amount * advancePercent) / 100);
  return { advance, final: amount - advance };
}
