import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import { LANGUAGES, MAX_LANGUAGES } from "../lib/languages";
import type { Language } from "../lib/languages";
import AppLayout from "../components/AppLayout";
import ProfileImageField from "../components/ProfileImageField";

const PLATFORMS = [
  "INSTAGRAM",
  "YOUTUBE",
  "FACEBOOK",
  "X",
  "LINKEDIN",
] as const;
type Platform = (typeof PLATFORMS)[number];

const PORTFOLIO_PLATFORMS = [...PLATFORMS, "OTHER"] as const;
type PortfolioPlatform = (typeof PORTFOLIO_PLATFORMS)[number];

const MAX_PORTFOLIO = 12;

interface SocialLink {
  platform: Platform;
  url: string;
  followers: number;
}

interface PortfolioItem {
  title: string;
  platform: PortfolioPlatform;
  url: string;
  summary: string;
}

interface Profile {
  bio: string;
  niches: string[];
  followerCount?: number;
  languages?: string[]; // older profiles may not have it
  location: string;
  socialLinks: SocialLink[];
  imagePath?: string;
  imageUrl?: string;
  portfolio?: PortfolioItem[]; // older profiles may not have it
}

export default function InfluencerProfile() {
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [nichesText, setNichesText] = useState(""); // "tech, lifestyle"
  const [followerCount, setFollowerCount] = useState("0");
  const [languages, setLanguages] = useState<Language[]>([]);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [imagePath, setImagePath] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
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
          setFollowerCount(String(profile.followerCount ?? 0));
          // Keep only languages that are on the list
          setLanguages(
            (profile.languages ?? []).filter((l): l is Language =>
              (LANGUAGES as readonly string[]).includes(l),
            ),
          );
          setLinks(profile.socialLinks);
          setImagePath(profile.imagePath ?? "");
          setImageUrl(profile.imageUrl ?? "");
          setPortfolio(
            (profile.portfolio ?? []).map((p) => ({
              ...p,
              summary: p.summary ?? "",
            })),
          );
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load profile"),
      )
      .finally(() => setLoading(false));
  }, []);

  // ----- languages -----
  function toggleLanguage(lang: Language) {
    if (languages.includes(lang)) {
      setLanguages(languages.filter((l) => l !== lang));
    } else if (languages.length < MAX_LANGUAGES) {
      setLanguages([...languages, lang]);
    }
  }

  // ----- social links -----
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

  // ----- portfolio -----
  function updateItem(index: number, changes: Partial<PortfolioItem>) {
    setPortfolio(
      portfolio.map((p, i) => (i === index ? { ...p, ...changes } : p)),
    );
  }

  function addItem() {
    if (portfolio.length >= MAX_PORTFOLIO) return;
    setPortfolio([
      ...portfolio,
      { title: "", platform: "INSTAGRAM", url: "", summary: "" },
    ]);
  }

  function removeItem(index: number) {
    setPortfolio(portfolio.filter((_, i) => i !== index));
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
        body: JSON.stringify({
          bio,
          location,
          niches,
          followerCount: Number(followerCount),
          languages,
          socialLinks: links,
          imagePath,
          portfolio,
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
        <h1>My profile</h1>

        <ProfileImageField
          label="Profile photo (optional)"
          endpoint="/profiles/me/image-upload"
          imageUrl={imageUrl}
          onImageChange={(path, url) => {
            setImagePath(path);
            setImageUrl(url);
          }}
          onBusyChange={setImageUploading}
        />

        <div className="field">
          <label htmlFor="bio">Bio</label>
          <textarea
            id="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
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
          />
        </div>

        <div className="field">
          <label htmlFor="niches">Niches</label>
          <input
            id="niches"
            value={nichesText}
            onChange={(e) => setNichesText(e.target.value)}
            placeholder="tech, lifestyle, fitness"
          />
          <span className="hint">Separate with commas</span>
        </div>

        <div className="field">
          <label htmlFor="follower-count">Total followers (self-declared)</label>
          <input
            id="follower-count"
            type="number"
            min={0}
            max={1_000_000_000}
            step={1}
            value={followerCount}
            onChange={(event) => setFollowerCount(event.target.value)}
            required
          />
          <span className="hint">Brands use this number to match campaign requirements.</span>
        </div>

        <fieldset className="group">
          <legend>
            Languages you make content in ({languages.length}/{MAX_LANGUAGES})
          </legend>
          <div className="chips">
            {LANGUAGES.map((lang) => {
              const checked = languages.includes(lang);
              return (
                <label key={lang} className="chip-check">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && languages.length >= MAX_LANGUAGES}
                    onChange={() => toggleLanguage(lang)}
                  />
                  {lang}
                </label>
              );
            })}
          </div>
        </fieldset>

        <div className="stack">
          <h2 className="h-sm">Social links (up to 5)</h2>
          {links.map((link, i) => (
            <div key={i} className="row row-links">
              <select
                className="input"
                aria-label="Platform"
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
                className="input"
                type="url"
                aria-label="Link"
                placeholder="https://..."
                value={link.url}
                onChange={(e) => updateLink(i, { url: e.target.value })}
                required
              />
              <input
                className="input"
                type="number"
                min={0}
                aria-label="Followers"
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
              />
              <button
                className="btn btn-outline btn-sm"
                type="button"
                onClick={() => removeLink(i)}
              >
                Remove
              </button>
            </div>
          ))}
          {links.length < 5 && (
            <button
              className="btn btn-outline btn-sm self-start"
              type="button"
              onClick={addLink}
            >
              + Add link
            </button>
          )}
        </div>

        <div className="stack">
          <h2 className="h-sm">
            Portfolio ({portfolio.length}/{MAX_PORTFOLIO})
          </h2>
          <p className="muted">
            Show brands your past work. Add a link to each piece (no uploads
            needed).
          </p>

          {portfolio.map((item, i) => (
            <div key={i} className="card stack">
              <input
                className="input"
                aria-label="Title"
                placeholder="Title (e.g. Cafe launch reel)"
                value={item.title}
                onChange={(e) => updateItem(i, { title: e.target.value })}
                maxLength={100}
                required
              />
              <div className="row row-work">
                <select
                  className="input"
                  aria-label="Platform"
                  value={item.platform}
                  onChange={(e) =>
                    updateItem(i, {
                      platform: e.target.value as PortfolioPlatform,
                    })
                  }
                >
                  {PORTFOLIO_PLATFORMS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  className="input"
                  type="url"
                  aria-label="Link"
                  placeholder="https://..."
                  value={item.url}
                  onChange={(e) => updateItem(i, { url: e.target.value })}
                  maxLength={300}
                  required
                />
              </div>
              <textarea
                className="input"
                aria-label="Summary"
                placeholder="Short summary (optional): what it was, results, views..."
                value={item.summary}
                onChange={(e) => updateItem(i, { summary: e.target.value })}
                maxLength={300}
                rows={2}
              />
              <button
                className="btn btn-outline btn-sm self-start"
                type="button"
                onClick={() => removeItem(i)}
              >
                Remove this item
              </button>
            </div>
          ))}

          {portfolio.length < MAX_PORTFOLIO ? (
            <button
              className="btn btn-outline btn-sm self-start"
              type="button"
              onClick={addItem}
            >
              + Add portfolio item
            </button>
          ) : (
            <p className="muted">
              You've reached the limit of {MAX_PORTFOLIO} items.
            </p>
          )}
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
