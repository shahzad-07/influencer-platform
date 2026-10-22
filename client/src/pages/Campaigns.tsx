import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

interface Campaign {
  id: string;
  title: string;
  brandName: string;
  brief: string;
  niche: string;
  minFollowers: number;
  languages: string[];
  creatorSlots: number;
  filledSlots: number;
  remainingSlots: number;
  collaborationType: string;
  deadline: string | null;
  status: string;
  applicationStatus: string | null;
}

export default function Campaigns() {
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ campaigns: Campaign[] }>("/campaigns")
      .then((result) => { if (!cancelled) setCampaigns(result.campaigns); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load campaigns"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <AppLayout>
      <div className="stack">
        <div className="campaign-page-head">
          <div>
            <h1>{user?.role === "BRAND" ? "My campaigns" : "Campaigns for you"}</h1>
            <p className="muted">{user?.role === "BRAND" ? "Find creators through open campaigns." : "Browse open campaigns that match your profile."}</p>
          </div>
          {user?.role === "BRAND" && <Link className="btn btn-primary" to="/campaigns/new">Post a campaign</Link>}
        </div>

        {error && <p className="alert" role="alert">{error}</p>}
        {loading && <p className="muted">Loading campaigns...</p>}
        {!loading && campaigns.length === 0 && (
          <div className="card">
            <p className="muted">{user?.role === "BRAND" ? "You haven't posted a campaign yet." : "No open campaigns match your profile yet."}</p>
            {user?.role === "INFLUENCER" && <Link to="/influencer/profile">Update your creator profile</Link>}
          </div>
        )}
        <div className="campaign-grid">
          {campaigns.map((campaign) => (
            <article key={campaign.id} className="campaign-card">
              <div className="campaign-card-head">
                <div><h2>{campaign.title}</h2><p className="muted small">{campaign.brandName}</p></div>
                <span className="tag">{campaign.collaborationType.replaceAll("_", " + ")}</span>
              </div>
              <p>{campaign.brief.length > 180 ? `${campaign.brief.slice(0, 180)}…` : campaign.brief}</p>
              <div className="tags"><span className="tag">{campaign.niche}</span><span className="tag">{campaign.minFollowers.toLocaleString("en-IN")}+ followers</span></div>
              <p className="muted small">{campaign.remainingSlots} of {campaign.creatorSlots} creator spots available{campaign.languages.length ? ` · ${campaign.languages.join(", ")}` : " · Any language"}</p>
              {campaign.applicationStatus && <p className="muted small">Your response: {campaign.applicationStatus.toLowerCase()}</p>}
              <Link className="btn btn-outline btn-sm" to={`/campaigns/${campaign.id}`}>View campaign</Link>
            </article>
          ))}
        </div>
      </div>
    </AppLayout>
  );
}
