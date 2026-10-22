import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const PROFILE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PROFILE_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const PROFILE_IMAGE_BUCKET = process.env.SUPABASE_PROFILE_BUCKET ?? "profile-images";
export const isProfileImageStorageConfigured = Boolean(
  process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY,
);

export type ProfileImageRole = "brand" | "creator";

const extensionByType: Record<(typeof PROFILE_IMAGE_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

let storageClient: ReturnType<typeof createClient> | null = null;

function getStorageClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new Error("Profile image storage is not configured");
  if (!storageClient) {
    storageClient = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return storageClient;
}

export function isProfileImageType(value: string): value is (typeof PROFILE_IMAGE_TYPES)[number] {
  return PROFILE_IMAGE_TYPES.includes(value as (typeof PROFILE_IMAGE_TYPES)[number]);
}

export function isProfileImagePathForUser(
  path: string,
  role: ProfileImageRole,
  userId: string,
) {
  return new RegExp(`^${role}/${userId}/[a-f0-9-]+\\.(jpg|png|webp)$`, "i").test(path);
}

export async function createProfileImageUpload(
  userId: string,
  role: ProfileImageRole,
  contentType: (typeof PROFILE_IMAGE_TYPES)[number],
) {
  const path = `${role}/${userId}/${randomUUID()}.${extensionByType[contentType]}`;
  const { data, error } = await getStorageClient()
    .storage.from(PROFILE_IMAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (error) throw new Error("Could not prepare the profile image upload");

  const { data: publicData } = getStorageClient()
    .storage.from(PROFILE_IMAGE_BUCKET)
    .getPublicUrl(path);
  return { path: data.path, token: data.token, bucket: PROFILE_IMAGE_BUCKET, publicUrl: publicData.publicUrl };
}

export async function getProfileImageInfo(path: string) {
  try {
    const { data, error } = await getStorageClient()
      .storage.from(PROFILE_IMAGE_BUCKET)
      .info(path);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export function getProfileImageUrl(path?: string | null) {
  if (!path) return "";
  const url = process.env.SUPABASE_URL;
  if (!url) return "";
  return `${url.replace(/\/$/, "")}/storage/v1/object/public/${PROFILE_IMAGE_BUCKET}/${path
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export async function deleteProfileImage(path?: string | null) {
  if (!path) return;
  try {
    await getStorageClient().storage.from(PROFILE_IMAGE_BUCKET).remove([path]);
  } catch {
    // Profile saves should succeed even if cleanup of an old image fails.
  }
}
