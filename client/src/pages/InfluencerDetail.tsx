import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";

interface SocialLink {
  platform: string;
  url: string;
  followers: number;
}

interface Influencer {
  id: string;
  name: string;
  bio: string;
  niches: string[];
  location: string;
  socialLinks: SocialLink[];
}

interface Price {
  serviceType: string;
  amount: number; // paise
  currency: string;
  description: string;
}

const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

// Only turn http(s) URLs into clickable links
const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

export default function InfluencerDetail() {
  const { id } = useParams<{ id: string }>();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setError("");
    Promise.all([
      api<{ influencer: Influencer }>(`/influencers/${id}`),
      api<{ prices: Price[] }>(`/pricing/influencer/${id}`),
    ])
      .then(([profileRes, priceRes]) => {
        if (cancelled) return;
        setInfluencer(profileRes.influencer);
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
  }, [id]);

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/brand/influencers">← Back to search</Link>
      </p>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {influencer && (
        <>
          <h1 style={{ marginBottom: 4 }}>{influencer.name}</h1>
          {influencer.location && (
            <div style={{ color: "gray" }}>{influencer.location}</div>
          )}

          <div style={{ margin: "12px 0" }}>
            {influencer.niches.map((n) => (
              <span
                key={n}
                style={{
                  display: "inline-block",
                  background: "#eee",
                  color: "#333",
                  borderRadius: 12,
                  padding: "2px 8px",
                  margin: "0 4px 4px 0",
                  fontSize: 12,
                }}
              >
                {n}
              </span>
            ))}
          </div>

          {influencer.bio && <p>{influencer.bio}</p>}

          <h2>Social media</h2>
          {influencer.socialLinks.length === 0 ? (
            <p>No social links added.</p>
          ) : (
            <ul>
              {influencer.socialLinks.map((l, i) => (
                <li key={i}>
                  <strong>{l.platform}</strong>:{" "}
                  {isSafeUrl(l.url) ? (
                    <a href={l.url} target="_blank" rel="noopener noreferrer">
                      {l.url}
                    </a>
                  ) : (
                    l.url
                  )}{" "}
                  ({l.followers.toLocaleString("en-IN")} followers)
                </li>
              ))}
            </ul>
          )}

          <h2>Pricing</h2>
          {prices.length === 0 ? (
            <p>This influencer hasn't listed prices yet.</p>
          ) : (
            <ul>
              {prices.map((p) => (
                <li key={p.serviceType}>
                  <strong>{p.serviceType.replaceAll("_", " ")}</strong>:{" "}
                  {formatRupees(p.amount)}
                  {p.description && (
                    <span style={{ color: "gray" }}> ({p.description})</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          <button disabled title="Chat is coming in a later step">
            Contact (coming soon)
          </button>
        </>
      )}
    </div>
  );
}
