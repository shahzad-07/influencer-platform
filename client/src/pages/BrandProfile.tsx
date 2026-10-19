import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

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

        <div className="field">
          <label htmlFor="companyName">Company name</label>
          <input
            id="companyName"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            maxLength={100}
          />
        </div>

        <div className="field">
          <label htmlFor="industry">Industry</label>
          <input
            id="industry"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="restaurant, fashion, tech..."
            maxLength={50}
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

        <button className="btn btn-primary" type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save profile"}
        </button>
      </form>
    </AppLayout>
  );
}
