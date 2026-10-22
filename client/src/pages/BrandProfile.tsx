import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";
import ProfileImageField from "../components/ProfileImageField";

const PLATFORMS = ["INSTAGRAM", "YOUTUBE", "FACEBOOK", "X", "LINKEDIN"] as const;
type Platform = (typeof PLATFORMS)[number];

interface SocialLink {
  platform: Platform;
  url: string;
}

interface BrandProfileData {
  companyName: string;
  industry: string;
  website: string;
  description: string;
  location: string;
  socialLinks: SocialLink[];
  imagePath: string;
  imageUrl: string;
}

export default function BrandProfile() {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [imagePath, setImagePath] = useState("");
  const [imageUrl, setImageUrl] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load the saved profile (if any)
  useEffect(() => {
    api<{ profile: BrandProfileData | null }>("/brands/me")
      .then(({ profile }) => {
        if (profile) {
          setCompanyName(profile.companyName ?? "");
          setIndustry(profile.industry ?? "");
          setWebsite(profile.website ?? "");
          setDescription(profile.description ?? "");
          setLocation(profile.location ?? "");
          setSocialLinks(profile.socialLinks ?? []);
          setImagePath(profile.imagePath ?? "");
          setImageUrl(profile.imageUrl ?? "");
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load profile"),
      )
      .finally(() => setLoading(false));
  }, []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api("/brands/me", {
        method: "PUT",
        body: JSON.stringify({
          companyName,
          industry,
          website,
          description,
          location,
          socialLinks,
          imagePath,
        }),
      });
      setMessage("Profile saved!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <AppLayout>
        <p className="muted">Loading...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <form className="stack form-wide" onSubmit={handleSubmit}>
        <div>
          <h1>Brand profile</h1>
          <p className="muted">Creators see this when they browse brands.</p>
        </div>

        <p className="muted">Company name, industry, city and at least one social account are required before you can send a deal offer. Website, description and logo are optional.</p>

        <ProfileImageField
          label="Brand logo or profile photo (optional)"
          endpoint="/brands/me/image-upload"
          imageUrl={imageUrl}
          onImageChange={(path, url) => {
            setImagePath(path);
            setImageUrl(url);
          }}
          onBusyChange={setImageUploading}
        />

        <div className="field">
          <label htmlFor="companyName">Company name</label>
          <input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        <div className="stack">
          <h2 className="h-sm">Social accounts (at least one to send offers)</h2>
          {socialLinks.map((link, index) => (
            <div key={index} className="row row-links">
              <select
                className="input"
                aria-label={`Social platform ${index + 1}`}
                value={link.platform}
                onChange={(event) => setSocialLinks((current) => current.map((item, i) =>
                  i === index ? { ...item, platform: event.target.value as Platform } : item,
                ))}
              >
                {PLATFORMS.map((platform) => <option key={platform} value={platform}>{platform}</option>)}
              </select>
              <input
                className="input"
                type="url"
                aria-label={`Social account link ${index + 1}`}
                placeholder="https://..."
                value={link.url}
                onChange={(event) => setSocialLinks((current) => current.map((item, i) =>
                  i === index ? { ...item, url: event.target.value } : item,
                ))}
                required
              />
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={() => setSocialLinks((current) => current.filter((_, i) => i !== index))}
              >Remove</button>
            </div>
          ))}
          {socialLinks.length < 5 && (
            <button
              className="btn btn-outline btn-sm self-start"
              type="button"
              onClick={() => setSocialLinks((current) => [...current, { platform: "INSTAGRAM", url: "" }])}
            >+ Add social account</button>
          )}
          <span className="hint">Add up to five public brand social links.</span>
        </div>

        <div className="field">
          <label htmlFor="industry">Industry</label>
          <input
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="restaurant, fashion, tech..."
            maxLength={50}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourbrand.com"
            maxLength={200}
          />
        </div>

        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={4}
          />
          <span className="hint">Up to 500 characters</span>
        </div>

        <div className="field">
          <label htmlFor="location">City</label>
          <input
            id="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={100}
            required
          />
        </div>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className="success" role="status">
            {message}
          </p>
        )}

        <button className="btn btn-primary" type="submit" disabled={saving || imageUploading}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </AppLayout>
  );
}
