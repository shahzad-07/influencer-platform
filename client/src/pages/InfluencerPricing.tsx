import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

const SERVICE_TYPES = [
  "INSTAGRAM_POST",
  "INSTAGRAM_REEL",
  "INSTAGRAM_STORY",
  "YOUTUBE_VIDEO",
  "YOUTUBE_SHORT",
  "OTHER",
] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

interface Price {
  serviceType: ServiceType;
  amount: number; // paise
  currency: string;
  description: string;
}

const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

export default function InfluencerPricing() {
  const [prices, setPrices] = useState<Price[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [loading, setLoading] = useState(true);

  const [serviceType, setServiceType] = useState<ServiceType>("INSTAGRAM_REEL");
  const [rupees, setRupees] = useState("");
  const [description, setDescription] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Load prices on first render and whenever refreshKey changes
  useEffect(() => {
    api<{ prices: Price[] }>("/pricing/me")
      .then(({ prices }) => setPrices(prices))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load rates"),
      )
      .finally(() => setLoading(false));
  }, [refreshKey]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      await api("/pricing/me", {
        method: "PUT",
        body: JSON.stringify({
          serviceType,
          amount: Math.round(Number(rupees)) * 100, // rupees -> paise
          description,
        }),
      });
      setMessage("Rate saved!");
      setRupees("");
      setDescription("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save rate");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(type: ServiceType) {
    setError("");
    setMessage("");
    try {
      await api(`/pricing/me/${type}`, { method: "DELETE" });
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete rate");
    }
  }

  // Click "Edit" to load an existing price into the form
  function handleEdit(p: Price) {
    setServiceType(p.serviceType);
    setRupees(String(p.amount / 100));
    setDescription(p.description);
    setMessage("");
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
      <div className="stack form-wide">
        <div>
          <h1>My rates</h1>
          <p className="muted">Only brands can see these.</p>
        </div>

        <section className="card">
          <h2 className="h-sm">Your rates</h2>
          {prices.length === 0 ? (
            <p className="muted">No rates yet. Add your first one below.</p>
          ) : (
            <div>
              {prices.map((p) => (
                <div key={p.serviceType} className="price-row wrap">
                  <div>
                    <strong>{p.serviceType.replaceAll("_", " ")}</strong>:{" "}
                    {formatRupees(p.amount)}
                    {p.description && (
                      <div className="muted small">{p.description}</div>
                    )}
                  </div>
                  <div className="btn-row">
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => handleEdit(p)}
                    >
                      Edit
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => handleDelete(p.serviceType)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <form className="card stack" onSubmit={handleSubmit}>
          <h2 className="h-sm">Add or update a rate</h2>

          <div className="field">
            <label htmlFor="service">Service</label>
            <select
              id="service"
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value as ServiceType)}
            >
              {SERVICE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="rupees">Rate in rupees (₹)</label>
            <input
              id="rupees"
              type="number"
              inputMode="numeric"
              min={0}
              step={1}
              value={rupees}
              onChange={(e) => setRupees(e.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="description">Description (optional)</label>
            <input
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
              placeholder="1 reel, up to 30 seconds"
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
            {saving ? "Saving..." : "Save rate"}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
