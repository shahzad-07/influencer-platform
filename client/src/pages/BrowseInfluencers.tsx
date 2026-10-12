import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface SocialLink {
  platform: string;
  url: string;
  followers: number;
}

interface InfluencerCard {
  id: string;
  name: string;
  bio: string;
  niches: string[];
  location: string;
  socialLinks: SocialLink[];
}

interface ListResponse {
  influencers: InfluencerCard[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 12;

export default function BrowseInfluencers() {
  // What the user is typing
  const [nicheInput, setNicheInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  // What is actually applied to the search
  const [filters, setFilters] = useState({ niche: "", location: "" });
  const [page, setPage] = useState(1);

  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const params = new URLSearchParams({
      page: String(page),
      limit: String(LIMIT),
    });
    if (filters.niche) params.set("niche", filters.niche);
    if (filters.location) params.set("location", filters.location);

    setLoading(true);
    setError("");
    api<ListResponse>(`/influencers?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load influencers",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    // If filters change before this request finishes, ignore the old response
    return () => {
      cancelled = true;
    };
  }, [filters, page]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setFilters({ niche: nicheInput.trim(), location: locationInput.trim() });
  }

  function handleClear() {
    setNicheInput("");
    setLocationInput("");
    setPage(1);
    setFilters({ niche: "", location: "" });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const totalFollowers = (links: SocialLink[]) =>
    links.reduce((sum, l) => sum + l.followers, 0);

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/brand">← Back to dashboard</Link>
      </p>
      <h1>Find Influencers</h1>

      <form
        onSubmit={handleSearch}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          placeholder="Niche (e.g. tech)"
          value={nicheInput}
          onChange={(e) => setNicheInput(e.target.value)}
        />
        <input
          placeholder="Location (e.g. Bengaluru)"
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
        />
        <button type="submit">Search</button>
        <button type="button" onClick={handleClear}>
          Clear
        </button>
      </form>

      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {loading && <p>Loading...</p>}

      {!loading && data && data.influencers.length === 0 && (
        <p>No influencers found. Try different filters.</p>
      )}

      {data && data.influencers.length > 0 && (
        <>
          <p style={{ color: "gray" }}>{data.total} influencer(s) found</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {data.influencers.map((inf) => (
              <div
                key={inf.id}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <h3 style={{ margin: "0 0 4px" }}>{inf.name}</h3>
                {inf.location && (
                  <div style={{ color: "gray" }}>{inf.location}</div>
                )}
                <p>
                  {inf.bio.length > 100
                    ? `${inf.bio.slice(0, 100)}...`
                    : inf.bio}
                </p>
                <div style={{ marginBottom: 8 }}>
                  {inf.niches.map((n) => (
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
                <div style={{ fontSize: 13, color: "gray" }}>
                  {totalFollowers(inf.socialLinks).toLocaleString("en-IN")}{" "}
                  followers total
                </div>
                <Link to={`/brand/influencers/${inf.id}`}>View profile →</Link>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              alignItems: "center",
              marginTop: 16,
            }}
          >
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <span>
              Page {page} of {totalPages}
            </span>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
}
