import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LANGUAGES, MAX_LANGUAGES } from "../lib/languages";
import type { Language } from "../lib/languages";

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
  languages?: string[]; // older profiles may not have it
  location: string;
  socialLinks: SocialLink[];
  portfolio?: PortfolioItem[]; // older profiles may not have it
}

export default function InfluencerProfile() {
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [nichesText, setNichesText] = useState(""); // "tech, lifestyle"
  const [languages, setLanguages] = useState<Language[]>([]);
  const [links, setLinks] = useState<SocialLink[]>([]);
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([]);

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
          // Keep only languages that are on the list
          setLanguages(
            (profile.languages ?? []).filter((l): l is Language =>
              (LANGUAGES as readonly string[]).includes(l),
            ),
          );
          setLinks(profile.socialLinks);
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
          languages,
          socialLinks: links,
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

        <fieldset style={{ border: "1px solid #ccc", borderRadius: 8 }}>
          <legend>
            Languages you make content in ({languages.length}/{MAX_LANGUAGES})
          </legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 16px" }}>
            {LANGUAGES.map((lang) => {
              const checked = languages.includes(lang);
              return (
                <label key={lang}>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && languages.length >= MAX_LANGUAGES}
                    onChange={() => toggleLanguage(lang)}
                  />{" "}
                  {lang}
                </label>
              );
            })}
          </div>
        </fieldset>

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

        <div>
          <strong>
            Portfolio ({portfolio.length}/{MAX_PORTFOLIO})
          </strong>
          <p style={{ color: "gray", margin: "4px 0 8px" }}>
            Show brands your past work. Add a link to each piece (no uploads
            needed).
          </p>

          {portfolio.map((item, i) => (
            <div
              key={i}
              style={{
                border: "1px solid #ccc",
                borderRadius: 8,
                padding: 8,
                margin: "8px 0",
                display: "grid",
                gap: 8,
              }}
            >
              <input
                placeholder="Title (e.g. Cafe launch reel)"
                value={item.title}
                onChange={(e) => updateItem(i, { title: e.target.value })}
                maxLength={100}
                required
              />
              <div style={{ display: "flex", gap: 8 }}>
                <select
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
                  type="url"
                  placeholder="https://..."
                  value={item.url}
                  onChange={(e) => updateItem(i, { url: e.target.value })}
                  maxLength={300}
                  required
                  style={{ flex: 1 }}
                />
              </div>
              <textarea
                placeholder="Short summary (optional): what it was, results, views..."
                value={item.summary}
                onChange={(e) => updateItem(i, { summary: e.target.value })}
                maxLength={300}
                rows={2}
              />
              <button type="button" onClick={() => removeItem(i)}>
                Remove this item
              </button>
            </div>
          ))}

          {portfolio.length < MAX_PORTFOLIO ? (
            <button type="button" onClick={addItem}>
              + Add portfolio item
            </button>
          ) : (
            <p style={{ color: "gray" }}>
              You've reached the limit of {MAX_PORTFOLIO} items.
            </p>
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
