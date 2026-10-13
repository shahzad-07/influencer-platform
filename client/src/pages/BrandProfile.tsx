import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface BrandProfileData {
  companyName: string;
  industry: string;
  website: string;
  description: string;
  location: string;
}

export default function BrandProfile() {
  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [website, setWebsite] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load the saved profile (if any)
  useEffect(() => {
    api<{ profile: BrandProfileData | null }>("/brands/me")
      .then(({ profile }) => {
        if (profile) {
          setCompanyName(profile.companyName);
          setIndustry(profile.industry);
          setWebsite(profile.website);
          setDescription(profile.description);
          setLocation(profile.location);
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
        <Link to="/brand">← Back to dashboard</Link>
      </p>
      <h1>Brand Profile</h1>
      <p style={{ color: "gray" }}>
        Influencers see this when they browse brands.
      </p>

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Company name
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Industry
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="restaurant, fashion, tech..."
            maxLength={50}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Website
          <input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://yourbrand.com"
            maxLength={200}
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Description (max 500 characters)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
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

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </div>
  );
}
