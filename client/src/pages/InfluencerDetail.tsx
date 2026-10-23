import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

interface SocialLink {
  platform: string;
  url: string;
  followers: number;
}

interface PortfolioItem {
  title: string;
  platform: string;
  url: string;
  summary?: string;
}

interface Influencer {
  id: string;
  name: string;
  bio: string;
  niches: string[];
  followerCount?: number;
  languages?: string[]; // older profiles may not have it
  location: string;
  socialLinks: SocialLink[];
  socialHandle: string;
  imageUrl: string;
  portfolio?: PortfolioItem[]; // older profiles may not have it
  trustSummary?: { pendingPayments: number; pendingDeliverables: number };
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
  const navigate = useNavigate();

  const [influencer, setInfluencer] = useState<Influencer | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState(false);
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
            err instanceof Error ? err.message : "Could not load creator",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleContact() {
    if (!id) return;
    setContacting(true);
    setError("");
    try {
      const res = await api<{ conversationId: string }>("/chat/conversations", {
        method: "POST",
        body: JSON.stringify({ influencerId: id }),
      });
      navigate(`/messages/${res.conversationId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start conversation",
      );
      setContacting(false);
    }
  }

  const portfolio = influencer?.portfolio ?? [];
  const languages = influencer?.languages ?? [];

  return (
    <AppLayout>
      <p>
        <Link to="/brand/influencers">Back to search</Link>
      </p>

      {loading && <p className="muted">Loading...</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {influencer && (
        <div className="stack">
          <div className="detail-head">
            <div className="person-head">
              {influencer.imageUrl ? (
                <img className="avatar avatar-image" src={influencer.imageUrl} alt={`${influencer.name} profile`} />
              ) : (
                <span className="avatar" aria-hidden="true">
                  {influencer.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <div>
                <h1>{influencer.name}</h1>
                {influencer.socialHandle && <div className="muted">{influencer.socialHandle}</div>}
                {influencer.location && (
                  <div className="muted">{influencer.location}</div>
                )}
              </div>
            </div>
            <div className="btn-row">
              <button
                className="btn btn-primary"
                onClick={handleContact}
                disabled={contacting}
              >
                {contacting ? "Opening chat..." : "Contact"}
              </button>
              <Link
                className="btn btn-outline"
                to={`/brand/offers/new/${influencer.id}`}
              >
                Make an offer
              </Link>
            </div>
          </div>

          <div className="detail">
            <div className="stack">
              <div className="tags">
                {influencer.niches.map((n) => (
                  <span key={n} className="tag">
                    {n}
                  </span>
                ))}
              </div>

              {languages.length > 0 && (
                <div>
                  <strong>Languages:</strong> {languages.join(", ")}
                </div>
              )}

              {influencer.bio && <p>{influencer.bio}</p>}
              <p className="muted small"><strong>{Number(influencer.followerCount ?? 0).toLocaleString("en-IN")}</strong> self-declared followers</p>

              <h2>Social media</h2>
              {influencer.socialLinks.length === 0 ? (
                <p className="muted">No social links added.</p>
              ) : (
                <ul className="plain-list">
                  {influencer.socialLinks.map((l, i) => (
                    <li key={i}>
                      <strong>{l.platform}</strong>:{" "}
                      {isSafeUrl(l.url) ? (
                        <a
                          href={l.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {l.url}
                        </a>
                      ) : (
                        l.url
                      )}{" "}
                      <span className="muted">
                        ({l.followers.toLocaleString("en-IN")} followers)
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <h2>Past work</h2>
              {portfolio.length === 0 ? (
                <p className="muted">No portfolio items yet.</p>
              ) : (
                <div className="stack">
                  {portfolio.map((item, i) => (
                    <article key={i} className="person">
                      <div className="person-head">
                        <strong>{item.title}</strong>
                        <span className="tag">{item.platform}</span>
                      </div>
                      {item.summary && <p>{item.summary}</p>}
                      {isSafeUrl(item.url) ? (
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          View work
                        </a>
                      ) : (
                        <span className="muted">{item.url}</span>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>

            <aside className="card">
              <h2>Rates</h2>
              <p className="muted small">Only brands can see these.</p>
              {prices.length === 0 ? (
                <p className="muted">This creator hasn't listed rates yet.</p>
              ) : (
                <div>
                  {prices.map((p) => (
                    <div key={p.serviceType} className="price-row">
                      <div>
                        <strong>{p.serviceType.replaceAll("_", " ")}</strong>
                        {p.description && (
                          <div className="muted small">{p.description}</div>
                        )}
                      </div>
                      <strong>{formatRupees(p.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </aside>
          </div>

          {(influencer.trustSummary?.pendingDeliverables ?? 0) > 0 && (
            <p className="muted small">
              Deliverables pending for {influencer.trustSummary!.pendingDeliverables} {influencer.trustSummary!.pendingDeliverables === 1 ? "brand" : "brands"}.
            </p>
          )}
        </div>
      )}
    </AppLayout>
  );
}
