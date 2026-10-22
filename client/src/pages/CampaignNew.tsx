import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { LANGUAGES, MAX_LANGUAGES } from "../lib/languages";
import AppLayout from "../components/AppLayout";

const TYPES = ["PAID", "BARTER", "PAID_AND_BARTER"] as const;
type CollabType = (typeof TYPES)[number];

export default function CampaignNew() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [niche, setNiche] = useState("");
  const [minFollowers, setMinFollowers] = useState("0");
  const [creatorSlots, setCreatorSlots] = useState("1");
  const [languages, setLanguages] = useState<string[]>([]);
  const [collaborationType, setCollaborationType] = useState<CollabType>("PAID");
  const [barterDescription, setBarterDescription] = useState("");
  const [deadline, setDeadline] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  function toggleLanguage(language: string) {
    setLanguages((current) => current.includes(language)
      ? current.filter((item) => item !== language)
      : current.length < MAX_LANGUAGES ? [...current, language] : current);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await api<{ campaign: { id: string } }>("/campaigns", {
        method: "POST",
        body: JSON.stringify({
          title, brief, niche, minFollowers: Number(minFollowers),
          creatorSlots: Number(creatorSlots), languages, collaborationType,
          barterDescription,
          deadline: deadline ? new Date(`${deadline}T23:59:59`).toISOString() : undefined,
        }),
      });
      navigate(`/campaigns/${result.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not post campaign");
      setSubmitting(false);
    }
  }

  return (
    <AppLayout>
      <p><Link to="/campaigns">Back to campaigns</Link></p>
      <form className="stack form-wide" onSubmit={handleSubmit}>
        <h1>Post a campaign</h1>
        <p className="muted">Tell creators what you need and how many spots are available. A spot is taken when a creator accepts your deal offer.</p>
        <div className="field"><label htmlFor="campaign-title">Campaign title</label><input id="campaign-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={120} required /></div>
        <div className="field"><label htmlFor="campaign-brief">Brief and deal details</label><textarea id="campaign-brief" value={brief} onChange={(event) => setBrief(event.target.value)} minLength={10} maxLength={3000} rows={6} required /><span className="hint">Include the work, deliverables and any details creators should know.</span></div>
        <div className="two">
          <div className="field"><label htmlFor="campaign-niche">Creator niche</label><input id="campaign-niche" value={niche} onChange={(event) => setNiche(event.target.value)} maxLength={30} placeholder="e.g. food" required /></div>
          <div className="field"><label htmlFor="campaign-followers">Minimum self-declared followers</label><input id="campaign-followers" type="number" min={0} max={1_000_000_000} step={1} value={minFollowers} onChange={(event) => setMinFollowers(event.target.value)} required /></div>
        </div>
        <div className="field"><label htmlFor="campaign-slots">Creators needed</label><input id="campaign-slots" type="number" min={1} max={100} step={1} value={creatorSlots} onChange={(event) => setCreatorSlots(event.target.value)} required /></div>
        <fieldset className="group"><legend>Languages needed (optional)</legend><div className="chips">{LANGUAGES.map((language) => <label key={language} className="chip-check"><input type="checkbox" checked={languages.includes(language)} disabled={!languages.includes(language) && languages.length >= MAX_LANGUAGES} onChange={() => toggleLanguage(language)} />{language}</label>)}</div></fieldset>
        <fieldset className="group"><legend>Collaboration type</legend><div className="choices">{TYPES.map((type) => <label key={type} className="choice"><input type="radio" name="campaign-type" checked={collaborationType === type} onChange={() => setCollaborationType(type)} /><span><strong>{type.replaceAll("_", " + ")}</strong></span></label>)}</div></fieldset>
        {collaborationType !== "PAID" && <div className="field"><label htmlFor="campaign-barter">What will the creator receive?</label><textarea id="campaign-barter" value={barterDescription} onChange={(event) => setBarterDescription(event.target.value)} minLength={5} maxLength={500} rows={3} required /></div>}
        <div className="field"><label htmlFor="campaign-deadline">Apply by (optional)</label><input id="campaign-deadline" type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={deadline} onChange={(event) => setDeadline(event.target.value)} /></div>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={submitting}>{submitting ? "Posting..." : "Post campaign"}</button>
      </form>
    </AppLayout>
  );
}
