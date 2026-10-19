import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { LANGUAGES } from "../lib/languages";
import AppLayout from "../components/AppLayout";

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
  languages?: string[];
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
  const [languageInput, setLanguageInput] = useState("");
  // What is actually applied to the search
  const [filters, setFilters] = useState({
    niche: "",
    location: "",
    language: "",
  });
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
    if (filters.language) params.set("language", filters.language);

    setLoading(true);
    setError("");
    api<ListResponse>(`/influencers?${params.toString()}`)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error ? err.message : "Could not load creators",
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
      niche: nicheInput.trim(),
      location: locationInput.trim(),
      language: languageInput,
    });
  }

  function handleClear() {
    setNicheInput("");
    setLocationInput("");
    setLanguageInput("");
    setPage(1);
    setFilters({ niche: "", location: "", language: "" });
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / LIMIT)) : 1;
  const totalFollowers = (links: SocialLink[]) =>
    links.reduce((sum, l) => sum + l.followers, 0);

  return (
    <AppLayout>
      <div className="stack">
        <h1>Find creators</h1>

        <form className="filters" onSubmit={handleSearch}>
          <div className="field">
            <label htmlFor="niche">Niche</label>
            <input
              id="niche"
              placeholder="e.g. tech"
              value={nicheInput}
              onChange={(e) => setNicheInput(e.target.value)}
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
          <div className="field">
            <label htmlFor="language">Language</label>
            <select
              id="language"
              value={languageInput}
              onChange={(e) => setLanguageInput(e.target.value)}
            >
              <option value="">Any language</option>
              {LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
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

        {!loading && data && data.influencers.length === 0 && (
          <p className="muted">No creators found. Try different filters.</p>
        )}

        {data && data.influencers.length > 0 && (
          <>
            <p className="muted">{data.total} creator(s) found</p>
            <div className="cards">
              {data.influencers.map((inf) => (
                <article key={inf.id} className="person">
                  <div className="person-head">
                    <span className="avatar" aria-hidden="true">
                      {inf.name.trim().charAt(0).toUpperCase() || "?"}
                    </span>
                    <div>
                      <h3>{inf.name}</h3>
                      {inf.location && (
                        <div className="muted small">{inf.location}</div>
                      )}
                    </div>
                  </div>
                  <p>
                    {inf.bio.length > 100
                      ? `${inf.bio.slice(0, 100)}...`
                      : inf.bio}
                  </p>
                  <div className="tags">
                    {inf.niches.map((n) => (
                      <span key={n} className="tag">
                        {n}
                      </span>
                    ))}
                  </div>
                  {inf.languages && inf.languages.length > 0 && (
                    <div className="small">
                      Languages: {inf.languages.join(", ")}
                    </div>
                  )}
                  <div className="muted small">
                    {totalFollowers(inf.socialLinks).toLocaleString("en-IN")}{" "}
                    followers total
                  </div>
                  <Link
                    className="btn btn-outline btn-sm"
                    to={`/brand/influencers/${inf.id}`}
                  >
                    View profile
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
