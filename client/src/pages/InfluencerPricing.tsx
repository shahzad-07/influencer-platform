import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

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
        setError(err instanceof Error ? err.message : "Could not load prices"),
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
      setMessage("Price saved!");
      setRupees("");
      setDescription("");
      setRefreshKey((k) => k + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save price");
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
      setError(err instanceof Error ? err.message : "Could not delete price");
    }
  }

  // Click "Edit" to load an existing price into the form
  function handleEdit(p: Price) {
    setServiceType(p.serviceType);
    setRupees(String(p.amount / 100));
    setDescription(p.description);
    setMessage("");
  }

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/influencer">← Back to dashboard</Link>
      </p>
      <h1>My Pricing</h1>
      <p style={{ color: "gray" }}>Only brands can see these prices.</p>

      <h2>Your prices</h2>
      {prices.length === 0 ? (
        <p>No prices yet. Add your first one below.</p>
      ) : (
        <ul style={{ paddingLeft: 0, listStyle: "none" }}>
          {prices.map((p) => (
            <li
              key={p.serviceType}
              style={{
                display: "flex",
                gap: 12,
                alignItems: "center",
                margin: "8px 0",
              }}
            >
              <span style={{ flex: 1 }}>
                <strong>{p.serviceType.replaceAll("_", " ")}</strong>:{" "}
                {formatRupees(p.amount)}
                {p.description && (
                  <span style={{ color: "gray" }}> ({p.description})</span>
                )}
              </span>
              <button type="button" onClick={() => handleEdit(p)}>
                Edit
              </button>
              <button type="button" onClick={() => handleDelete(p.serviceType)}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      <h2>Add or update a price</h2>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Service
          <select
            value={serviceType}
            onChange={(e) => setServiceType(e.target.value as ServiceType)}
            style={{ width: "100%" }}
          >
            {SERVICE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label>
          Price in rupees (₹)
          <input
            type="number"
            min={0}
            step={1}
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Description (optional)
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={300}
            placeholder="1 reel, up to 30 seconds"
            style={{ width: "100%" }}
          />
        </label>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}
        {message && <p style={{ color: "green", margin: 0 }}>{message}</p>}

        <button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save price"}
        </button>
      </form>
    </div>
  );
}
