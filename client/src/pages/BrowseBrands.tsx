import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface BrandCard {
  id: string;
  name: string;
  industry: string;
  location: string;
  description: string;
}

interface ListResponse {
  brands: BrandCard[];
  total: number;
  page: number;
  limit: number;
}

const LIMIT = 12;

export default function BrowseBrands() {
  // What the user is typing
  const [industryInput, setIndustryInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  // What is actually applied to the search
  const [filters, setFilters] = useState({ industry: "", location: "" });
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
    if (filters.industry) params.set("industry", filters.industry);
    if (filters.location) params.set("location", filters.location);

    setLoading(true);
    setError("");
    api<ListResponse>(`/brands?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load brands",
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
    setFilters({
      industry: industryInput.trim(),
      location: locationInput.trim(),
    });
  }

  function handleClear() {
    setIndustryInput("");
    setLocationInput("");
    setPage(1);
    setFilters({ industry: "", location: "" });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/influencer">← Back to dashboard</Link>
      </p>
      <h1>Find Brands</h1>

      <form
        onSubmit={handleSearch}
        style={{ display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          placeholder="Industry (e.g. restaurant)"
          value={industryInput}
          onChange={(e) => setIndustryInput(e.target.value)}
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

      {!loading && data && data.brands.length === 0 && (
        <p>No brands found. Try different filters.</p>
      )}

      {data && data.brands.length > 0 && (
        <>
          <p style={{ color: "gray" }}>{data.total} brand(s) found</p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
              gap: 16,
            }}
          >
            {data.brands.map((b) => (
              <div
                key={b.id}
                style={{
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <h3 style={{ margin: "0 0 4px" }}>{b.name}</h3>
                {b.location && (
                  <div style={{ color: "gray" }}>{b.location}</div>
                )}
                {b.industry && (
                  <span
                    style={{
                      display: "inline-block",
                      background: "#eee",
                      color: "#333",
                      borderRadius: 12,
                      padding: "2px 8px",
                      margin: "8px 0",
                      fontSize: 12,
                    }}
                  >
                    {b.industry}
                  </span>
                )}
                <p>
                  {b.description.length > 100
                    ? `${b.description.slice(0, 100)}...`
                    : b.description}
                </p>
                <Link to={`/influencer/brands/${b.id}`}>View brand →</Link>
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
