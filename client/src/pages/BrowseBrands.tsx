import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import AppLayout from "../components/AppLayout";

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
    <AppLayout>
      <div className="stack">
        <h1>Find brands</h1>

        <form className="filters filters-2" onSubmit={handleSearch}>
          <div className="field">
            <label htmlFor="industry">Industry</label>
            <input
              id="industry"
              placeholder="e.g. restaurant"
              value={industryInput}
              onChange={(e) => setIndustryInput(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="location">City</label>
            <input
              id="location"
              placeholder="e.g. Bengaluru"
              value={locationInput}
              onChange={(e) => setLocationInput(e.target.value)}
            />
          </div>
          <div className="actions">
            <button className="btn btn-primary" type="submit">
              Search
            </button>
            <button
              className="btn btn-outline"
              type="button"
              onClick={handleClear}
            >
              Clear
            </button>
          </div>
        </form>

        {error && (
          <p className="alert" role="alert">
            {error}
          </p>
        )}
        {loading && <p className="muted">Loading...</p>}

        {!loading && data && data.brands.length === 0 && (
          <p className="muted">No brands found. Try different filters.</p>
        )}

        {data && data.brands.length > 0 && (
          <>
            <p className="muted">{data.total} brand(s) found</p>
            <div className="cards">
              {data.brands.map((b) => (
                <article key={b.id} className="person">
                  <div className="person-head">
                    <span className="avatar" aria-hidden="true">
                      {b.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div>
                      <h3>{b.name}</h3>
                      {b.location && (
                        <div className="muted small">{b.location}</div>
                      )}
                    </div>
                  </div>
                  {b.industry && (
                    <div className="tags">
                      <span className="tag">{b.industry}</span>
                    </div>
                  )}
                  <p>
                    {b.description.length > 100
                      ? `${b.description.slice(0, 100)}...`
                      : b.description}
                  </p>
                  <Link
                    className="btn btn-outline btn-sm"
                    to={`/influencer/brands/${b.id}`}
                  >
                    View brand
                  </Link>
                </article>
              ))}
            </div>

            <div className="pager">
              <button
                className="btn btn-outline btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
