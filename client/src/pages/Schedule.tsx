import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AppLayout from "../components/AppLayout";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { statusLabel } from "../lib/format";

type FixedPlan = { mode: "FIXED"; scheduledAt: string };
type FlexiblePlan = { mode: "FLEXIBLE"; startDate: string; endDate: string };
type VisitPlan = FixedPlan | FlexiblePlan | null;
type CalendarEvent = {
  date: string;
  dealId: string;
  title: string;
  otherName: string;
  kind: "VISIT" | "GO_LIVE";
  time?: string;
};
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

function istDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function istTodayKey() {
  return istDateKey(new Date().toISOString());
}

function currentIstMonth() {
  const [year, month] = istTodayKey().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function calendarDate(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function visitTime(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value)) + " IST";
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

function ScheduleCard({
  item,
  isBrand,
  onSaved,
}: {
  item: ScheduleItem;
  isBrand: boolean;
  onSaved: (dealId: string, visitPlan: VisitPlan, goLiveDeadline: string) => void;
}) {
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
      onSaved(item.dealId, visitPlan, goLiveDeadline);
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
  const isBrand = user?.role === "BRAND";
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [month, setMonth] = useState(currentIstMonth);
  const [selectedDate, setSelectedDate] = useState(istTodayKey);

  useEffect(() => {
    api<{ schedules: ScheduleItem[] }>("/deals/schedule")
      .then((result) => setItems(result.schedules))
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load schedules"))
      .finally(() => setLoading(false));
  }, []);

  const events: CalendarEvent[] = items.flatMap((item) => {
    const current: CalendarEvent[] = [];
    if (item.visitPlan?.mode === "FIXED") {
      current.push({
        date: istDateKey(item.visitPlan.scheduledAt),
        dealId: item.dealId,
        title: item.title,
        otherName: item.otherUser.name,
        kind: "VISIT",
        time: visitTime(item.visitPlan.scheduledAt),
      });
    }
    if (item.goLiveDeadline) {
      current.push({
        date: item.goLiveDeadline,
        dealId: item.dealId,
        title: item.title,
        otherName: item.otherUser.name,
        kind: "GO_LIVE",
      });
    }
    return current;
  });

  const year = month.getUTCFullYear();
  const monthIndex = month.getUTCMonth();
  const firstWeekday = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const days = [
    ...Array.from({ length: firstWeekday }, () => ""),
    ...Array.from({ length: daysInMonth }, (_, index) => calendarDate(year, monthIndex, index + 1)),
  ];
  while (days.length % 7) days.push("");
  const selectedEvents = events.filter((event) => event.date === selectedDate);
  const flexibleItems = items.filter((item) => item.visitPlan?.mode === "FLEXIBLE");

  function changeMonth(offset: number) {
    const nextMonth = new Date(Date.UTC(year, monthIndex + offset, 1));
    setMonth(nextMonth);
    setSelectedDate(calendarDate(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth(), 1));
  }

  function handleSaved(dealId: string, visitPlan: VisitPlan, goLiveDeadline: string) {
    setItems((current) => current.map((item) => item.dealId === dealId
      ? { ...item, visitPlan, goLiveDeadline }
      : item));
  }

  return (
    <AppLayout>
      <div className="stack form-wide schedule-page">
        <h1>Schedule</h1>
        <p className="muted">See the date and time to visit a brand or creator. Both people on an accepted deal can update the shared plan.</p>
        {loading && <p className="muted">Loading...</p>}
        {error && <p className="alert" role="alert">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className="muted">No accepted active deals yet. A visit can be scheduled here after a deal is accepted.</p>
        )}
        {items.length > 0 && (
          <>
            <section className="calendar" aria-label="Visit and go-live calendar">
              <div className="calendar-heading">
                <button className="btn btn-text btn-sm calendar-arrow" type="button" onClick={() => changeMonth(-1)} aria-label="Previous month">‹</button>
                <h2>{month.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" })}</h2>
                <button className="btn btn-text btn-sm calendar-arrow" type="button" onClick={() => changeMonth(1)} aria-label="Next month">›</button>
              </div>
              <div className="calendar-grid" role="grid" aria-label="Calendar month">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((weekday) => (
                  <div className="calendar-weekday" role="columnheader" key={weekday}>{weekday}</div>
                ))}
                {days.map((date, index) => {
                  const dayEvents = date ? events.filter((event) => event.date === date) : [];
                  return date ? (
                    <button
                      type="button"
                      role="gridcell"
                      key={date}
                      className={`calendar-day${date === selectedDate ? " selected" : ""}${date === istTodayKey() ? " today" : ""}`}
                      aria-label={`${displayDate(date)}, ${dayEvents.length} scheduled ${dayEvents.length === 1 ? "item" : "items"}`}
                      aria-pressed={date === selectedDate}
                      onClick={() => setSelectedDate(date)}
                    >
                      <span className="calendar-day-number">{index - firstWeekday + 1}</span>
                      <span className="calendar-dots" aria-hidden="true">
                        {dayEvents.slice(0, 4).map((event, eventIndex) => (
                          <i className={`calendar-dot ${event.kind.toLowerCase()}`} key={`${event.kind}-${event.dealId}-${eventIndex}`} />
                        ))}
                      </span>
                    </button>
                  ) : <span className="calendar-day empty" key={`empty-${index}`} aria-hidden="true" />;
                })}
              </div>
              <div className="calendar-legend">
                <span><i className="calendar-dot visit" /> Visit</span>
                <span><i className="calendar-dot go_live" /> Go-live</span>
              </div>
              <section className="calendar-selected" aria-live="polite">
                <h3>{displayDate(selectedDate)}</h3>
                {selectedEvents.length === 0 ? <p className="muted">Nothing scheduled for this date.</p> : (
                  <ul className="calendar-event-list">
                    {selectedEvents.map((event, index) => (
                      <li key={`${event.kind}-${event.dealId}-${index}`}>
                        <span className={`calendar-dot ${event.kind.toLowerCase()}`} />
                        <div>
                          <strong>{event.kind === "VISIT" ? `${isBrand ? "Creator" : "Brand"}: ${event.otherName}` : "Go-live deadline"}</strong>
                          <p>{event.kind === "VISIT" ? event.time : "Due today"} · {event.title}</p>
                          <Link to={`/deals/${event.dealId}`}>View deal</Link>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </section>

            {flexibleItems.length > 0 && (
              <section className="stack">
                <h2>Flexible visit windows</h2>
                <p className="muted">These date ranges are shown here as one plan and do not reserve every day in the calendar.</p>
                {flexibleItems.map((item) => (
                  <article className="card flexible-window" key={item.dealId}>
                    <div>
                      <strong>{isBrand ? "Creator" : "Brand"}: {item.otherUser.name}</strong>
                      <p>{item.title} · {visitSummary(item.visitPlan)}</p>
                    </div>
                    <Link to={`/deals/${item.dealId}`}>View deal</Link>
                  </article>
                ))}
              </section>
            )}

            <section className="stack">
              <h2>Plan a visit or go-live date</h2>
              {items.map((item) => <ScheduleCard key={item.dealId} item={item} isBrand={user?.role === "BRAND"} onSaved={handleSaved} />)}
            </section>
          </>
        )}
      </div>
    </AppLayout>
  );
}
