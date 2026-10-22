import { useState } from "react";
import { api } from "../lib/api";

interface ProfileImageFieldProps {
  label: string;
  endpoint: string;
  imageUrl: string;
  onImageChange: (path: string, url: string) => void;
  onBusyChange: (busy: boolean) => void;
}

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

export default function ProfileImageField({
  label,
  endpoint,
  imageUrl,
  onImageChange,
  onBusyChange,
}: ProfileImageFieldProps) {
  const [previewUrl, setPreviewUrl] = useState("");
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleChange(file?: File) {
    if (!file) return;
    setError("");
    if (!IMAGE_TYPES.includes(file.type)) {
      setError("Choose a JPG, PNG or WebP image.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError("The image must be no larger than 2 MB.");
      return;
    }

    setBusy(true);
    onBusyChange(true);
    try {
      const signed = await api<{
        path: string;
        token: string;
        bucket: string;
        publicUrl: string;
      }>(endpoint, {
        method: "POST",
        body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      });
      const { getSupabaseClient } = await import("../lib/supabase");
      const { error: uploadError } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type,
        });
      if (uploadError) throw new Error("The image upload failed. Please try again.");
      setPreviewUrl(signed.publicUrl);
      setRemoved(false);
      onImageChange(signed.path, signed.publicUrl);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload the image.");
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }

  const shownUrl = removed ? "" : previewUrl || imageUrl;

  return (
    <div className="field">
      <label htmlFor={`image-${endpoint}`}>{label}</label>
      {shownUrl ? (
        <img className="profile-image-preview" src={shownUrl} alt="Profile image preview" />
      ) : (
        <span className="avatar profile-image-placeholder" aria-hidden="true">+</span>
      )}
      <input
        id={`image-${endpoint}`}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={(event) => void handleChange(event.currentTarget.files?.[0])}
        disabled={busy}
      />
      <span className="hint">JPG, PNG or WebP, up to 2 MB. This image is stored publicly and anyone with its link can view it.</span>
      {busy && <span className="muted small">Uploading image...</span>}
      {shownUrl && (
        <button
          className="btn btn-outline btn-sm self-start"
          type="button"
          disabled={busy}
          onClick={() => {
            setPreviewUrl("");
            setRemoved(true);
            onImageChange("", "");
          }}
        >
          Remove image
        </button>
      )}
      {error && <span className="alert" role="alert">{error}</span>}
    </div>
  );
}
