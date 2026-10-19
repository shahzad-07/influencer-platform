import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

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
    <AppLayout>
      <p>
        <Link to="/influencer/brands">Back to search</Link>
      </p>

      {loading && <p className="muted">Loading...</p>}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      {brand && (
        <div className="stack form-wide">
          <div className="detail-head">
            <div className="person-head">
              <span className="avatar" aria-hidden="true">
                {brand.name.trim().charAt(0).toUpperCase() || "?"}
              </span>
              <div>
                <h1>{brand.name}</h1>
                {brand.location && (
                  <div className="muted">{brand.location}</div>
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
            </div>
          </div>

          {brand.industry && (
            <div className="tags">
              <span className="tag">{brand.industry}</span>
            </div>
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
        </div>
      )}
    </AppLayout>
  );
}
