import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatRupees, hasMoney } from "../lib/format";
import type { CollabType } from "../lib/format";
import PaymentTerms from "../components/PaymentTerms";
import AppLayout from "../components/AppLayout";

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
    label: "Paid + barter",
    hint: "Money and a product or service",
  },
];

export default function CreateOffer() {
  const { influencerId } = useParams<{ influencerId: string }>();
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaignId");
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
      campaignId
        ? api<{ campaign: { title: string; brief: string; collaborationType: CollabType; barterDescription: string } }>(`/campaigns/${campaignId}`)
        : Promise.resolve(null),
    ])
      .then(([profileRes, priceRes, campaignRes]) => {
        if (cancelled) return;
        setName(profileRes.influencer.name);
        setPrices(priceRes.prices);
        if (campaignRes?.campaign) {
          setTitle(campaignRes.campaign.title);
          setBrief(campaignRes.campaign.brief);
          setCollabType(campaignRes.campaign.collaborationType);
          setBarterDescription(campaignRes.campaign.barterDescription);
        }
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load creator",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [influencerId, campaignId]);

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
      setError("Describe what the creator gets (at least 5 characters).");
      return;
    }

    setSubmitting(true);
    try {
      await api("/deals", {
        method: "POST",
        body: JSON.stringify({
          ...(campaignId ? { campaignId } : {}),
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

  if (loading) {
    return (
      <AppLayout>
        <p className="muted">Loading...</p>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <p>
        <Link to={`/brand/influencers/${influencerId}`}>Back to profile</Link>
      </p>

      <div className="stack form-wide">
        <h1>Make an offer{name ? ` to ${name}` : ""}</h1>

        {prices.length > 0 && (
          <section className="card">
            <h2 className="h-sm">Their listed rates</h2>
            <div>
              {prices.map((p) => (
                <div key={p.serviceType} className="price-row">
                  <div>
                    {p.serviceType.replaceAll("_", " ")}
                    {p.description && (
                      <div className="muted small">{p.description}</div>
                    )}
                  </div>
                  <strong>{formatRupees(p.amount)}</strong>
                </div>
              ))}
            </div>
          </section>
        )}

        <form className="stack" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="title">Title</label>
            <input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Instagram reel for our new menu"
              minLength={3}
              maxLength={120}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="brief">
              Brief: what do you want them to create?
            </label>
            <textarea
              id="brief"
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              minLength={10}
              maxLength={3000}
              rows={6}
              required
            />
          </div>

          <fieldset className="group" disabled={Boolean(campaignId)}>
            <legend>What are you offering?{campaignId ? " (set by campaign)" : ""}</legend>
            <div className="choices">
              {TYPE_OPTIONS.map((o) => (
                <label key={o.value} className="choice">
                  <input
                    type="radio"
                    name="collabType"
                    value={o.value}
                    checked={collabType === o.value}
                    onChange={() => pickType(o.value)}
                  />
                  <span>
                    <strong>{o.label}</strong>
                    <small>{o.hint}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {hasBarter && (
            <div className="field">
              <label htmlFor="barter">
                {paid
                  ? "What else do they get besides the money?"
                  : "What will they get in return?"}
              </label>
              <textarea
                id="barter"
                value={barterDescription}
                onChange={(e) => setBarterDescription(e.target.value)}
                placeholder="e.g. Dinner for two at our restaurant, worth about ₹3,000"
                minLength={5}
                maxLength={500}
                rows={3}
                required
              />
            </div>
          )}

          {paid && (
            <div className="two">
              <div className="field">
                <label htmlFor="amount">Total amount (₹)</label>
                <input
                  id="amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="0.01"
                  value={rupees}
                  onChange={(e) => setRupees(e.target.value)}
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="advance">
                  Advance (%) paid before work starts
                </label>
                <input
                  id="advance"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={99}
                  step={1}
                  value={advancePercent}
                  onChange={(e) => setAdvancePercent(e.target.value)}
                  required
                />
              </div>
            </div>
          )}

          <div className="field">
            <label htmlFor="deadline">Deadline (optional)</label>
            <input
              id="deadline"
              type="date"
              min={tomorrow}
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
            />
          </div>

          {/* The same terms the creator will see before accepting */}
          <PaymentTerms
            collaborationType={collabType}
            barterDescription={barterDescription}
            amounts={
              paid && validAmount && validPct
                ? { advance, final, advancePercent: pct }
                : undefined
            }
          />

          <p className="muted">The offer stays open for 7 days.</p>

          {error && (
            <p className="alert" role="alert">
              {error}
            </p>
          )}

          <button
            className="btn btn-primary"
            type="submit"
            disabled={submitting}
          >
            {submitting ? "Sending..." : "Send offer"}
          </button>
        </form>
      </div>
    </AppLayout>
  );
}
