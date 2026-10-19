import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import {
  collabLabel,
  formatRupees,
  isPaidType,
  statusLabel,
} from "../lib/format";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

interface DealItem {
  id: string;
  title: string;
  status: string;
  collaborationType?: string | null;
  amount: number; // paise
  currency: string;
  deadline?: string | null;
  updatedAt: string;
  otherUser: { id: string; name: string };
}

export default function Deals() {
  const { user } = useAuth();
  const isBrand = user?.role === "BRAND";

  const [deals, setDeals] = useState<DealItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ deals: DealItem[] }>("/deals")
      .then((res) => setDeals(res.deals))
      .catch((err) =>
        setError(err instanceof Error ? err.message : "Could not load deals"),
      )
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="stack form-wide">
        <h1>My deals</h1>

        {loading && <p className="muted">Loading...</p>}
        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}

        {!loading && !error && deals.length === 0 && (
          <p className="muted">
            No deals yet.{" "}
            {isBrand ? (
              <Link to="/brand/influencers">
                Find a creator and make an offer.
              </Link>
            ) : (
              "Offers from brands will appear here."
            )}
          </p>
        )}

        <div className="stack">
          {deals.map((d) => (
            <Link key={d.id} to={`/deals/${d.id}`} className="deal">
              <div className="deal-top">
                <strong>{d.title}</strong>
                {/* Barter-only has no money, so show the type instead of ₹0 */}
                <strong>
                  {isPaidType(d.collaborationType)
                    ? formatRupees(d.amount)
                    : "Barter"}
                </strong>
              </div>
              <div className="muted">
                {isBrand ? "Creator" : "Brand"}: {d.otherUser.name}
              </div>
              <div className="deal-meta">
                <span className="tag">{statusLabel(d.status)}</span>
                <span className="tag">{collabLabel(d.collaborationType)}</span>
                {d.deadline && (
                  <span className="muted small">
                    Deadline {new Date(d.deadline).toLocaleDateString()}
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
