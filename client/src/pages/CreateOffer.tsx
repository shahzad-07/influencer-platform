import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatRupees } from "../lib/format";

interface Price {
  serviceType: string;
  amount: number; // paise
  description: string;
}

export default function CreateOffer() {
  const { influencerId } = useParams<{ influencerId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [rupees, setRupees] = useState("");
  const [advancePercent, setAdvancePercent] = useState("50");
  const [deadline, setDeadline] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!influencerId) return;
    let cancelled = false;

    Promise.all([
      api<{ influencer: { name: string } }>(`/influencers/${influencerId}`),
      api<{ prices: Price[] }>(`/pricing/influencer/${influencerId}`),
    ])
      .then(([profileRes, priceRes]) => {
        if (cancelled) return;
        setName(profileRes.influencer.name);
        setPrices(priceRes.prices);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load influencer",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [influencerId]);

  // Same rounding as the server, so the preview matches what will be saved
  const amountPaise = Math.round(Number(rupees) * 100);
  const validAmount = Number.isFinite(amountPaise) && amountPaise >= 100;
  const pct = Number(advancePercent);
  const validPct = Number.isInteger(pct) && pct >= 1 && pct <= 99;
  const advance =
    validAmount && validPct ? Math.round((amountPaise * pct) / 100) : 0;
  const final = validAmount && validPct ? amountPaise - advance : 0;

  // The earliest allowed deadline is tomorrow
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (!validAmount) {
      setError("Enter an amount of at least ₹1.");
      return;
    }
    if (!validPct) {
      setError("The advance must be a whole number from 1 to 99.");
      return;
    }

    setSubmitting(true);
    try {
      await api("/deals", {
        method: "POST",
        body: JSON.stringify({
          influencerId,
          title,
          brief,
          amount: amountPaise,
          advancePercent: pct,
          // Empty is left out of the request. A date means the end of that day.
          deadline: deadline
            ? new Date(`${deadline}T23:59:59`).toISOString()
            : undefined,
        }),
      });
      navigate("/deals");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the offer");
      setSubmitting(false);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;

  return (
    <div style={{ maxWidth: 600, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to={`/brand/influencers/${influencerId}`}>← Back to profile</Link>
      </p>
      <h1>Make an offer{name ? ` to ${name}` : ""}</h1>

      {prices.length > 0 && (
        <div
          style={{
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            margin: "12px 0",
          }}
        >
          <strong>Their listed prices</strong>
          <ul style={{ margin: "4px 0 0" }}>
            {prices.map((p) => (
              <li key={p.serviceType}>
                {p.serviceType.replaceAll("_", " ")}: {formatRupees(p.amount)}
                {p.description && (
                  <span style={{ color: "gray" }}> ({p.description})</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12 }}>
        <label>
          Title
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Instagram reel for our new menu"
            minLength={3}
            maxLength={120}
            required
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Brief: what do you want them to create?
          <textarea
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            minLength={10}
            maxLength={3000}
            rows={6}
            required
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Total amount (₹)
          <input
            type="number"
            min={1}
            step="0.01"
            value={rupees}
            onChange={(e) => setRupees(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>

        <label>
          Advance (%) paid before work starts
          <input
            type="number"
            min={1}
            max={99}
            step={1}
            value={advancePercent}
            onChange={(e) => setAdvancePercent(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>

        {validAmount && validPct && (
          <p style={{ margin: 0 }}>
            Advance: <strong>{formatRupees(advance)}</strong> now, final:{" "}
            <strong>{formatRupees(final)}</strong> after the post is verified.
          </p>
        )}

        <label>
          Deadline (optional)
          <input
            type="date"
            min={tomorrow}
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            style={{ width: "100%" }}
          />
        </label>

        <p style={{ color: "gray", margin: 0 }}>
          The offer stays open for 7 days. Payments happen directly between you
          and the influencer, outside this app. The app records them.
        </p>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send offer"}
        </button>
      </form>
    </div>
  );
}
