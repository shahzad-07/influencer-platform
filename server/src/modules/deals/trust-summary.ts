import mongoose from "mongoose";
import { DisputeModel } from "./dispute.model";

export interface TrustSummary {
  pendingPayments: number;
  pendingDeliverables: number;
}

export async function getTrustSummaries(userIds: string[]) {
  const summaries = new Map<string, TrustSummary>();
  const validIds = userIds
    .filter((id) => mongoose.isValidObjectId(id))
    .map((id) => new mongoose.Types.ObjectId(id));
  if (validIds.length === 0) return summaries;

  const rows = await DisputeModel.aggregate<{
    _id: mongoose.Types.ObjectId;
    mark: "PAYMENT_PENDING" | "DELIVERABLE_PENDING";
    count: number;
  }>([
    {
      $match: {
        state: "RESOLVED",
        trustMarkActive: true,
        trustMark: { $in: ["PAYMENT_PENDING", "DELIVERABLE_PENDING"] },
        $or: [{ brand: { $in: validIds } }, { influencer: { $in: validIds } }],
      },
    },
    {
      $project: {
        target: {
          $cond: [
            { $eq: ["$trustMark", "PAYMENT_PENDING"] },
            "$brand",
            "$influencer",
          ],
        },
        mark: "$trustMark",
      },
    },
    { $group: { _id: { user: "$target", mark: "$mark" }, count: { $sum: 1 } } },
    { $project: { _id: "$_id.user", mark: "$_id.mark", count: 1 } },
  ]);

  for (const row of rows) {
    const key = String(row._id);
    const current = summaries.get(key) ?? {
      pendingPayments: 0,
      pendingDeliverables: 0,
    };
    if (row.mark === "PAYMENT_PENDING") current.pendingPayments = row.count;
    if (row.mark === "DELIVERABLE_PENDING") current.pendingDeliverables = row.count;
    summaries.set(key, current);
  }
  return summaries;
}
