import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatRupees, hasMoney } from "../lib/format";
import type { CollabType } from "../lib/format";
import PaymentTerms from "../components/PaymentTerms";

interface Price {
  serviceType: string;
  amount: number; // paise
  description: string;
}

const TYPE_OPTIONS: { value: CollabType; label: string; hint: string }[] = [
  { value: "PAID", label: "Paid", hint: "You pay money" },
  {
    value: "BARTER",
    label: "Barter",
    hint: "No money, you give a product or service",
  },
  {
    value: "PAID_AND_BARTER",
    label: "Paid + Barter",
    hint: "Money and a product or service",
  },
];

export default function CreateOffer() {
  const { influencerId } = useParams<{ influencerId: string }>();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [collabType, setCollabType] = useState<CollabType>("PAID");
  const [barterDescription, setBarterDescription] = useState("");
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

  // Does this offer include money? Barter-only has no amount and no advance.
  const paid = hasMoney(collabType);
  // Does it include a product or service? Paid-only does not.
  const hasBarter = collabType !== "PAID";

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

  function pickType(type: CollabType) {
    setCollabType(type);
    setError("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    if (paid && !validAmount) {
      setError("Enter an amount of at least ₹1.");
      return;
    }
    if (paid && !validPct) {
      setError("The advance must be a whole number from 1 to 99.");
      return;
    }
    if (hasBarter && barterDescription.trim().length < 5) {
      setError("Describe what the influencer gets (at least 5 characters).");
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
          collaborationType: collabType,
          // The server also ignores money on barter-only offers
          amount: paid ? amountPaise : 0,
          advancePercent: paid ? pct : 0,
          barterDescription: hasBarter ? barterDescription.trim() : "",
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

        <fieldset style={{ border: "1px solid #ccc", borderRadius: 8 }}>
          <legend>What are you offering?</legend>
          <div style={{ display: "grid", gap: 6 }}>
            {TYPE_OPTIONS.map((o) => (
              <label key={o.value}>
                <input
                  type="radio"
                  name="collabType"
                  value={o.value}
                  checked={collabType === o.value}
                  onChange={() => pickType(o.value)}
                />{" "}
                <strong>{o.label}</strong>
                <span style={{ color: "gray" }}> - {o.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        {hasBarter && (
          <label>
            {paid
              ? "What else do they get besides the money?"
              : "What will they get in return?"}
            <textarea
              value={barterDescription}
              onChange={(e) => setBarterDescription(e.target.value)}
              placeholder="e.g. Dinner for two at our restaurant, worth about ₹3,000"
              minLength={5}
              maxLength={500}
              rows={3}
              required
              style={{ width: "100%" }}
            />
          </label>
        )}

        {paid && (
          <>
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
          </>
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

        {/* The same terms the influencer will see before accepting */}
        <PaymentTerms
          collaborationType={collabType}
          barterDescription={barterDescription}
          amounts={
            paid && validAmount && validPct
              ? { advance, final, advancePercent: pct }
              : undefined
          }
        />

        <p style={{ color: "gray", margin: 0 }}>
          The offer stays open for 7 days.
        </p>

        {error && <p style={{ color: "crimson", margin: 0 }}>{error}</p>}

        <button type="submit" disabled={submitting}>
          {submitting ? "Sending..." : "Send offer"}
        </button>
      </form>
    </div>
  );
}
