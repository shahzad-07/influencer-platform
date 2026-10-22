import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

interface ScheduleItem {
  dealId: string;
  title: string;
  otherUser: { name: string };
  visitPlan:
    | { mode: "FIXED"; scheduledAt: string }
    | { mode: "FLEXIBLE"; startDate: string; endDate: string }
    | null;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function visitLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value)) + " IST";
}

export default function ScheduleHomeSection({ isBrand }: { isBrand: boolean }) {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    api<{ schedules: ScheduleItem[] }>("/deals/schedule")
      .then((result) => setItems(result.schedules))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const upcoming = items
    .filter((item) => item.visitPlan?.mode === "FIXED" && new Date(item.visitPlan.scheduledAt).getTime() >= Date.now())
    .sort((a, b) => {
      if (a.visitPlan?.mode !== "FIXED" || b.visitPlan?.mode !== "FIXED") return 0;
      return new Date(a.visitPlan.scheduledAt).getTime() - new Date(b.visitPlan.scheduledAt).getTime();
    })
    .slice(0, 3);
  const flexible = items.filter((item) => item.visitPlan?.mode === "FLEXIBLE").slice(0, 2);

  return (
    <section className="card dashboard-schedule">
      <div className="dashboard-schedule-head">
        <div>
          <h2>Schedule</h2>
          <p className="muted">Upcoming visits with your {isBrand ? "creators" : "brands"}</p>
        </div>
        <Link className="btn btn-text btn-sm" to="/schedule">Open calendar</Link>
      </div>
      {loading && <p className="muted">Loading schedule...</p>}
      {error && <p className="muted">Your calendar could not load right now.</p>}
      {!loading && !error && upcoming.length === 0 && flexible.length === 0 && (
        <p className="muted">No visit plans yet. Accepted deals will appear here.</p>
      )}
      {!loading && !error && (upcoming.length > 0 || flexible.length > 0) && (
        <ul className="dashboard-schedule-list">
          {upcoming.map((item) => item.visitPlan?.mode === "FIXED" && (
            <li key={item.dealId}>
              <span className="calendar-dot visit" />
              <div>
                <strong>{isBrand ? "Creator" : "Brand"}: {item.otherUser.name}</strong>
                <small>{visitLabel(item.visitPlan.scheduledAt)} · {item.title}</small>
              </div>
            </li>
          ))}
          {flexible.map((item) => item.visitPlan?.mode === "FLEXIBLE" && (
            <li key={item.dealId}>
              <span className="calendar-dot flexible" />
              <div>
                <strong>Flexible visit · {isBrand ? "Creator" : "Brand"}: {item.otherUser.name}</strong>
                <small>{dateLabel(`${item.visitPlan.startDate}T00:00:00+05:30`)} to {dateLabel(`${item.visitPlan.endDate}T00:00:00+05:30`)} · {item.title}</small>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
