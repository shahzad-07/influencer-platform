import { createClient } from "@supabase/supabase-js";

export const MAX_DRAFT_BYTES = 1024 * 1024;
export const DRAFT_VIDEO_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;
export const DRAFT_BUCKET = process.env.SUPABASE_DRAFT_BUCKET ?? "deal-drafts";
export const isDraftStorageConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);

let storageClient: ReturnType<typeof createClient> | null = null;

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error("Draft storage is not configured");
  }
  if (!storageClient) {
    storageClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return storageClient;
}

export async function createDraftUpload(path: string) {
  const { data, error } = await getStorageClient()
    .storage.from(DRAFT_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new Error("Could not prepare the draft upload");
  return { path: data.path, token: data.token };
}

export async function getDraftInfo(path: string) {
  try {
    const { data, error } = await getStorageClient()
      .storage.from(DRAFT_BUCKET)
      .info(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function createDraftViewUrl(path: string) {
  try {
    const { data, error } = await getStorageClient()
      .storage.from(DRAFT_BUCKET)
      .createSignedUrl(path, 60 * 60);
    if (error || !data) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function deleteDraftObjects(paths: string[]) {
  if (paths.length === 0) return true;
  try {
    const { error } = await getStorageClient()
      .storage.from(DRAFT_BUCKET)
      .remove(paths);
    return !error;
  } catch {
    return false;
  }
}

