import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";

interface Brand {
  id: string;
  name: string;
  industry: string;
  website: string;
  description: string;
  location: string;
}

// Only turn http(s) URLs into clickable links
const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

export default function BrandDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [brand, setBrand] = useState<Brand | null>(null);
  const [loading, setLoading] = useState(true);
  const [contacting, setContacting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    setLoading(true);
    setError("");
    api<{ brand: Brand }>(`/brands/${id}`)
      .then((res) => {
        if (!cancelled) setBrand(res.brand);
      })
      .catch((err) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load brand");
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
        body: JSON.stringify({ brandId: id }),
      });
      navigate(`/messages/${res.conversationId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start conversation",
      );
      setContacting(false);
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/influencer/brands">← Back to search</Link>
      </p>

      {loading && <p>Loading...</p>}
      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {brand && (
        <>
          <h1 style={{ marginBottom: 4 }}>{brand.name}</h1>
          {brand.location && (
            <div style={{ color: "gray" }}>{brand.location}</div>
          )}

          {brand.industry && (
            <span
              style={{
                display: "inline-block",
                background: "#eee",
                color: "#333",
                borderRadius: 12,
                padding: "2px 8px",
                margin: "12px 0",
                fontSize: 12,
              }}
            >
              {brand.industry}
            </span>
          )}

          {brand.description && <p>{brand.description}</p>}

          {brand.website && (
            <p>
              Website:{" "}
              {isSafeUrl(brand.website) ? (
                <a
                  href={brand.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {brand.website}
                </a>
              ) : (
                brand.website
              )}
            </p>
          )}

          <button onClick={handleContact} disabled={contacting}>
            {contacting ? "Opening chat..." : "Contact"}
          </button>
        </>
      )}
    </div>
  );
}
