import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

const PLATFORMS = [
  "INSTAGRAM",
  "YOUTUBE",
  "FACEBOOK",
  "X",
  "LINKEDIN",
] as const;
type Platform = (typeof PLATFORMS)[number];

interface SocialLink {
  platform: Platform;
  url: string;
  followers: number;
}

interface Profile {
  bio: string;
  niches: string[];
  location: string;
  socialLinks: SocialLink[];
}

export default function InfluencerProfile() {
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [nichesText, setNichesText] = useState(""); // "tech, lifestyle"
  const [links, setLinks] = useState<SocialLink[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load the saved profile (if any)
  useEffect(() => {
    api<{ profile: Profile | null }>("/profiles/me")
      .then(({ profile }) => {
        if (profile) {
          setBio(profile.bio);
          setLocation(profile.location);
          setNichesText(profile.niches.join(", "));
          setLinks(profile.socialLinks);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load profile"),
      )
      .finally(() => setLoading(false));
  }, []);

  function updateLink(index: number, changes: Partial<SocialLink>) {
    setLinks(links.map((l, i) => (i === index ? { ...l, ...changes } : l)));
  }

  function addLink() {
    if (links.length >= 5) return;
    setLinks([...links, { platform: "INSTAGRAM", url: "", followers: 0 }]);
  }

  function removeLink(index: number) {
    setLinks(links.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const niches = nichesText
        .split(",")
        .map((n) => n.trim())
        .filter(Boolean);

      await api("/profiles/me", {
        method: "PUT",
        body: JSON.stringify({ bio, location, niches, socialLinks: links }),
      });
      setMessage("Profile saved!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save profile");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/influencer">← Back to dashboard</Link>
      </p>
      <h1>My Profile</h1>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Bio (max 500 characters)
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            maxLength={100}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Niches (separate with commas)
          <input
            value={nichesText}
            onChange={(e) => setNichesText(e.target.value)}
            placeholder="tech, lifestyle, fitness"
            style={{ width: "100%" }}
          />
        </label>

        <div>
          <strong>Social links (up to 5)</strong>
          {links.map((link, i) => (
            <div key={i} style={{ display: "flex", gap: 8, margin: "8px 0" }}>
              <select
                value={link.platform}
                onChange={(e) =>
                  updateLink(i, { platform: e.target.value as Platform })
                }
              >
                {PLATFORMS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
              <input
                type="url"
                placeholder="https://..."
                value={link.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                required
                style={{ flex: 1 }}
              />
              <input
                type="number"
                min={0}
                placeholder="Followers"
                value={link.followers}
                onChange={(e) =>
                  updateLink(i, {
                    followers: Math.max(
                      0,
                      Math.floor(Number(e.target.value) || 0),
                    ),
                  })
                }
                style={{ width: 100 }}
              />
              <button type="button" onClick={() => removeLink(i)}>
                Remove
              </button>
            </div>
          ))}
          {links.length < 5 && (
            <button type="button" onClick={addLink}>
              + Add link
            </button>
          )}
        </div>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
