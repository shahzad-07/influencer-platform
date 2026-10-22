import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { statusLabel } from "../lib/format";

type FixedPlan = { mode: "FIXED"; scheduledAt: string };
type FlexiblePlan = { mode: "FLEXIBLE"; startDate: string; endDate: string };
type VisitPlan = FixedPlan | FlexiblePlan | null;
interface ScheduleItem {
  dealId: string;
  title: string;
  status: string;
  otherUser: { id: string; name: string };
  visitPlan: VisitPlan;
  goLiveDeadline: string;
  updatedAt: string;
}

function istInputValue(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function displayDate(value: string) {
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

function visitSummary(plan: VisitPlan) {
  if (!plan) return "No visit planned yet";
  if (plan.mode === "FIXED") {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Kolkata",
    }).format(new Date(plan.scheduledAt)) + " IST";
  }
  return plan.startDate === plan.endDate
    ? displayDate(plan.startDate)
    : `${displayDate(plan.startDate)} – ${displayDate(plan.endDate)}`;
}

function ScheduleCard({ item, isBrand }: { item: ScheduleItem; isBrand: boolean }) {
  const [savedVisitPlan, setSavedVisitPlan] = useState(item.visitPlan);
  const [savedGoLiveDeadline, setSavedGoLiveDeadline] = useState(item.goLiveDeadline);
  const [mode, setMode] = useState<"FIXED" | "FLEXIBLE">(
    item.visitPlan?.mode ?? "FIXED",
  );
  const [fixedAt, setFixedAt] = useState(
    item.visitPlan?.mode === "FIXED" ? istInputValue(item.visitPlan.scheduledAt) : "",
  );
  const [startDate, setStartDate] = useState(
    item.visitPlan?.mode === "FLEXIBLE" ? item.visitPlan.startDate : "",
  );
  const [endDate, setEndDate] = useState(
    item.visitPlan?.mode === "FLEXIBLE" ? item.visitPlan.endDate : "",
  );
  const [goLiveDeadline, setGoLiveDeadline] = useState(item.goLiveDeadline);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  async function save() {
    setSaving(true);
    setError("");
    setSaved(false);
    const visitPlan = mode === "FIXED"
      ? (fixedAt ? { mode, scheduledAt: fixedAt } : null)
      : (startDate && endDate ? { mode, startDate, endDate } : null);
    try {
      await api(`/deals/${item.dealId}/schedule`, {
        method: "PUT",
        body: JSON.stringify({ visitPlan, goLiveDeadline }),
      });
      setSavedVisitPlan(visitPlan);
      setSavedGoLiveDeadline(goLiveDeadline);
      setSaved(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save this schedule");
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="card schedule-card">
      <div className="schedule-card-head">
        <div>
          <h2>{item.title}</h2>
          <p className="muted">{isBrand ? "Creator" : "Brand"}: {item.otherUser.name}</p>
        </div>
        <span className="tag">{statusLabel(item.status)}</span>
      </div>

      <p><strong>Visit:</strong> {visitSummary(savedVisitPlan)}</p>
      {savedGoLiveDeadline && (
        <p><strong>Go-live by:</strong> {displayDate(savedGoLiveDeadline)}</p>
      )}
      <Link to={`/deals/${item.dealId}`}>View deal</Link>

      <div className="schedule-editor">
        <h3>Plan or update dates</h3>
        <fieldset className="schedule-mode">
          <legend>Visit plan type</legend>
          <label>
            <input type="radio" name={`mode-${item.dealId}`} checked={mode === "FIXED"} onChange={() => setMode("FIXED")} />
            Fixed date and time
          </label>
          <label>
            <input type="radio" name={`mode-${item.dealId}`} checked={mode === "FLEXIBLE"} onChange={() => setMode("FLEXIBLE")} />
            Flexible date window
          </label>
        </fieldset>

        {mode === "FIXED" ? (
          <div className="field">
            <label htmlFor={`visit-${item.dealId}`}>Visit date and time (IST)</label>
            <input id={`visit-${item.dealId}`} className="input" type="datetime-local" value={fixedAt} onChange={(event) => setFixedAt(event.target.value)} />
          </div>
        ) : (
          <div className="schedule-date-pair">
            <div className="field">
              <label htmlFor={`start-${item.dealId}`}>Window starts</label>
              <input id={`start-${item.dealId}`} className="input" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor={`end-${item.dealId}`}>Window ends</label>
              <input id={`end-${item.dealId}`} className="input" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor={`golive-${item.dealId}`}>Go-live deadline (optional)</label>
          <input id={`golive-${item.dealId}`} className="input" type="date" value={goLiveDeadline} onChange={(event) => setGoLiveDeadline(event.target.value)} />
        </div>
        <p className="muted small">A flexible window is one shared plan; it does not block calendar days. Changes show here without sending a notification.</p>
        {error && <p className="alert" role="alert">{error}</p>}
        {saved && <p className="success" role="status">Schedule saved. Both sides can see the update here.</p>}
        <button className="btn btn-primary" type="button" disabled={saving} onClick={save}>
          {saving ? "Saving..." : "Save schedule"}
        </button>
      </div>
    </article>
  );
}

export default function Schedule() {
  const { user } = useAuth();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ schedules: ScheduleItem[] }>("/deals/schedule")
      .then((result) => setItems(result.schedules))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load schedules"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <AppLayout>
      <div className="stack form-wide schedule-page">
        <h1>Schedule</h1>
        <p className="muted">Keep a simple shared plan for visits and go-live dates. Either person can update it.</p>
        {loading && <p className="muted">Loading...</p>}
        {error && <p className="alert" role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="muted">No deals yet. When you have a deal, its visit plan and optional go-live date can be recorded here.</p>
        )}
        {items.map((item) => <ScheduleCard key={item.dealId} item={item} isBrand={user?.role === "BRAND"} />)}
      </div>
    </AppLayout>
  );
}
