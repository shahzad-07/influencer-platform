import { DealModel } from "./deal.model";
import { DraftVersionModel } from "./draft-version.model";
import { deleteDraftObjects, isDraftStorageConfigured } from "./draft-storage";

const RETAIN_DRAFT_DAYS_AFTER_END = 30;

export async function cleanupExpiredDrafts() {
  if (!isDraftStorageConfigured) return;
  const cutoff = new Date(
    Date.now() - RETAIN_DRAFT_DAYS_AFTER_END * 24 * 60 * 60 * 1000,
  );
  const endedDeals = await DealModel.find({
    status: { $in: ["COMPLETED", "CANCELLED", "DECLINED", "EXPIRED"] },
    updatedAt: { $lte: cutoff },
  })
    .select("_id")
    .lean();
  if (endedDeals.length === 0) return;

  const dealIds = endedDeals.map((deal) => deal._id);
  const versions = await DraftVersionModel.find({ deal: { $in: dealIds } })
    .select("_id storagePath")
    .lean();
  const paths = versions
    .map((draft) => draft.storagePath)
    .filter((path): path is string => Boolean(path));

  for (let i = 0; i < paths.length; i += 1000) {
    if (!(await deleteDraftObjects(paths.slice(i, i + 1000)))) return;
  }
  await DraftVersionModel.deleteMany({ deal: { $in: dealIds } });
}
