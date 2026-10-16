import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { formatRupees, statusLabel } from "../lib/format";
import { useAuth } from "../context/AuthContext";

interface DealItem {
  id: string;
  title: string;
  status: string;
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
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to={isBrand ? "/brand" : "/influencer"}>← Back to dashboard</Link>
      </p>
      <h1>My deals</h1>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {!loading && !error && deals.length === 0 && (
        <p>
          No deals yet.{" "}
          {isBrand ? (
            <Link to="/brand/influencers">
              Find an influencer and make an offer.
            </Link>
          ) : (
            "Offers from brands will appear here."
          )}
        </p>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {deals.map((d) => (
          <Link
            key={d.id}
            to={`/deals/${d.id}`}
            style={{
              display: "block",
              border: "1px solid #ccc",
              borderRadius: 8,
              padding: 12,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <strong>{d.title}</strong>
              <span>{formatRupees(d.amount)}</span>
            </div>
            <div style={{ color: "gray", marginTop: 4 }}>
              {isBrand ? "Influencer" : "Brand"}: {d.otherUser.name}
            </div>
            <div style={{ marginTop: 8 }}>
              <span
                style={{
                  background: "#eee",
                  color: "#333",
                  borderRadius: 12,
                  padding: "2px 8px",
                  fontSize: 12,
                }}
              >
                {statusLabel(d.status)}
              </span>
              {d.deadline && (
                <span style={{ color: "gray", marginLeft: 8, fontSize: 13 }}>
                  Deadline {new Date(d.deadline).toLocaleDateString()}
                </span>
              )}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
