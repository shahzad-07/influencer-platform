import { Schema, model } from "mongoose";

const draftVersionSchema = new Schema(
  {
    deal: { type: Schema.Types.ObjectId, ref: "Deal", required: true },
    version: { type: Number, required: true, min: 1, validate: Number.isInteger },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    storagePath: { type: String, trim: true, maxlength: 500, default: "" },
    contentType: { type: String, trim: true, maxlength: 100, default: "" },
    sizeBytes: { type: Number, min: 0, validate: Number.isInteger, default: 0 },
    link: { type: String, trim: true, maxlength: 300, default: "" },
  },
  { timestamps: true },
);

draftVersionSchema.index({ deal: 1, version: -1 }, { unique: true });

export const DraftVersionModel = model("DraftVersion", draftVersionSchema);

