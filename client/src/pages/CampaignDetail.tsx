import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
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
  barterDescription: string;
  deadline: string | null;
  status: string;
  applicationStatus: string | null;
  eligible: boolean;
}

interface Applicant { id: string; name: string; niches: string[]; followerCount: number; languages: string[]; status: string; dealId: string | null; }
interface CreatorResult { id: string; name: string; location: string; niches: string[]; }

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [creatorSearch, setCreatorSearch] = useState("");
  const [creators, setCreators] = useState<CreatorResult[]>([]);
  const [selectedCreators, setSelectedCreators] = useState<string[]>([]);
  const [shareMessage, setShareMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const isBrand = user?.role === "BRAND";

  const load = useCallback(async () => {
    if (!id) return;
    const result = await api<{ campaign: Campaign }>(`/campaigns/${id}`);
    setCampaign(result.campaign);
    if (user?.role === "BRAND") setCreatorSearch((current) => current || result.campaign.niche);
    if (user?.role === "BRAND") {
      const applications = await api<{ applicants: Applicant[] }>(`/campaigns/${id}/applicants`);
      setApplicants(applications.applicants);
    }
  }, [id, user?.role]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    load().catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : "Could not load campaign"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [load]);

  async function expressInterest() {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/campaigns/${id}/interest`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not respond to campaign");
    } finally {
      setBusy(false);
    }
  }

  async function declineApplicant(applicantId: string) {
    if (!id) return;
    setBusy(true);
    setError("");
    try {
      await api(`/campaigns/${id}/applicants/${applicantId}/decline`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update applicant");
    } finally {
      setBusy(false);
    }
  }

  async function findCreators(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const query = new URLSearchParams({ niche: creatorSearch.trim(), limit: "20" });
      const result = await api<{ influencers: CreatorResult[] }>(`/influencers?${query}`);
      setCreators(result.influencers);
      setSelectedCreators([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not search creators");
    }
  }

  function toggleCreator(creatorId: string) {
    setSelectedCreators((current) => current.includes(creatorId)
      ? current.filter((id) => id !== creatorId)
      : current.length < 50 ? [...current, creatorId] : current);
  }

  async function shareWithCreators() {
    if (!id || selectedCreators.length === 0) return;
    setBusy(true);
    setError("");
    setShareMessage("");
    try {
      const result = await api<{ sharedCount: number }>(`/campaigns/${id}/share`, {
        method: "POST", body: JSON.stringify({ creatorIds: selectedCreators }),
      });
      setShareMessage(`Campaign shared in ${result.sharedCount} creator conversation(s).`);
      setSelectedCreators([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share campaign");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <AppLayout><p className="muted">Loading campaign...</p></AppLayout>;
  if (!campaign) return <AppLayout><p className="alert" role="alert">{error || "Campaign not found"}</p><Link to="/campaigns">Back to campaigns</Link></AppLayout>;

  return (
    <AppLayout>
      <div className="stack">
        <p><Link to="/campaigns">Back to campaigns</Link></p>
        {error && <p className="alert" role="alert">{error}</p>}
        <section className="card stack campaign-detail">
          <div className="campaign-card-head"><div><h1>{campaign.title}</h1><p className="muted">{isBrand ? "Your campaign" : campaign.brandName}</p></div><span className="tag">{campaign.collaborationType.replaceAll("_", " + ")}</span></div>
          <p>{campaign.brief}</p>
          {campaign.collaborationType !== "PAID" && <p><strong>Creator receives:</strong> {campaign.barterDescription}</p>}
          <div className="tags"><span className="tag">Niche: {campaign.niche}</span><span className="tag">{campaign.minFollowers.toLocaleString("en-IN")}+ self-declared followers</span></div>
          <p><strong>Languages:</strong> {campaign.languages.length ? campaign.languages.join(", ") : "Any"}</p>
          <p><strong>Creator spots:</strong> {campaign.remainingSlots} remaining of {campaign.creatorSlots}</p>
          {campaign.deadline && <p><strong>Apply by:</strong> {new Date(campaign.deadline).toLocaleDateString("en-IN")}</p>}
          {campaign.status !== "OPEN" && <p className="muted">This campaign is closed.</p>}
          {!isBrand && campaign.applicationStatus && <p role="status">Your response: <strong>{campaign.applicationStatus.toLowerCase()}</strong></p>}
          {!isBrand && !campaign.applicationStatus && campaign.eligible && campaign.status === "OPEN" && campaign.remainingSlots > 0 && <button className="btn btn-primary self-start" type="button" disabled={busy} onClick={() => void expressInterest()}>{busy ? "Saving..." : "I’m interested"}</button>}
          {!isBrand && !campaign.eligible && !campaign.applicationStatus && <p className="muted">Your profile does not currently meet this campaign’s niche, language or follower requirements.</p>}
          {isBrand && <p className="muted small">To share this campaign with a specific creator, open their conversation in Messages and use “Share a campaign”.</p>}
        </section>

        {isBrand && <section className="stack">
          <h2>Interested creators ({applicants.length})</h2>
          {applicants.length === 0 ? <p className="muted">No creators have expressed interest yet.</p> : <div className="cards campaign-applicants">{applicants.map((applicant) => <article key={applicant.id} className="person">
            <div className="person-head"><h3>{applicant.name}</h3><span className="tag">{applicant.status.toLowerCase()}</span></div>
            <div className="tags">{applicant.niches.map((niche) => <span className="tag" key={niche}>{niche}</span>)}</div>
            <p className="muted small">{applicant.followerCount.toLocaleString("en-IN")} self-declared followers · {applicant.languages.join(", ") || "No languages listed"}</p>
            <Link className="btn btn-outline btn-sm" to={`/brand/influencers/${applicant.id}`}>View creator profile</Link>
            {applicant.status === "INTERESTED" && <div className="btn-row"><Link className="btn btn-primary btn-sm" to={`/brand/offers/new/${applicant.id}?campaignId=${campaign.id}`}>Make deal offer</Link><button className="btn btn-outline btn-sm" disabled={busy} onClick={() => void declineApplicant(applicant.id)}>Decline</button></div>}
            {applicant.dealId && <Link className="btn btn-outline btn-sm" to={`/deals/${applicant.dealId}`}>{applicant.status === "ACTIVE" ? "View agreed deal" : "View offer"}</Link>}
          </article>)}</div>}
        </section>}

        {isBrand && campaign.status === "OPEN" && campaign.remainingSlots > 0 && <section className="card stack campaign-share-panel">
          <div><h2>Share with creators</h2><p className="muted small">Select creators to send this campaign as a card in their Messages. They can express interest only if their profile meets the campaign requirements.</p></div>
          <form className="row campaign-creator-search" onSubmit={(event) => void findCreators(event)}>
            <div className="field"><label htmlFor="creator-niche-search">Search creator niche</label><input id="creator-niche-search" value={creatorSearch} onChange={(event) => setCreatorSearch(event.target.value)} placeholder="e.g. food" /></div>
            <button className="btn btn-outline" type="submit">Find creators</button>
          </form>
          {creators.length > 0 && <div className="campaign-creator-list">{creators.map((creator) => <label className="campaign-creator-option" key={creator.id}>
            <input type="checkbox" checked={selectedCreators.includes(creator.id)} onChange={() => toggleCreator(creator.id)} />
            <span><strong>{creator.name}</strong><small className="muted">{[creator.niches.join(", "), creator.location].filter(Boolean).join(" · ")}</small></span>
          </label>)}</div>}
          {shareMessage && <p role="status">{shareMessage}</p>}
          <button className="btn btn-primary self-start" type="button" disabled={busy || selectedCreators.length === 0} onClick={() => void shareWithCreators()}>{busy ? "Sharing..." : `Share with ${selectedCreators.length} creator${selectedCreators.length === 1 ? "" : "s"}`}</button>
        </section>}
      </div>
    </AppLayout>
  );
}
