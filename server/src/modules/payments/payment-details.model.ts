import { Schema, model } from "mongoose";

const paymentDetailsSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // one set of details per influencer
    },
    // Encrypted JSON of the real details. Hidden from queries unless asked for by name.
    data: { type: String, required: true, select: false },
  },
  // Explicit collection name, so tests and backups know exactly where it lives
  { timestamps: true, collection: "payment_details" },
);

export const PaymentDetailsModel = model(
  "PaymentDetails",
  paymentDetailsSchema,
);
