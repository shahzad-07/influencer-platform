import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type TrustMark = "PAYMENT_PENDING" | "DELIVERABLE_PENDING" | "NONE";

interface Person {
  name: string;
  email: string;
}

interface PaymentRecord {
  stage: "ADVANCE" | "FINAL";
  amount: number;
  status: "SENT" | "CONFIRMED" | "REJECTED";
  sentAt: string;
  resolvedAt?: string;
  note?: string;
}

interface DisputeDeal {
  title: string;
  brief: string;
  amount: number;
  currency: string;
  status: string;
  collaborationType: string;
  payments: PaymentRecord[];
  draftUrl?: string;
  postUrl?: string;
}

interface Dispute {
  _id: string;
  deal: DisputeDeal | null;
  brand: Person;
  influencer: Person;
  raisedBy: Person;
  reason: string;
  previousStatus: string;
  state: "OPEN" | "RESOLVED";
  resolutionNote: string;
  resolvedBy?: Person;
  resolvedAt?: string;
  trustMark: TrustMark;
  trustMarkActive: boolean;
  trustMarkReason: string;
  createdAt: string;
}

interface AuditEvent {
  _id: string;
  actor: Person;
  action: string;
  reason: string;
  previousMark?: TrustMark;
  nextMark?: TrustMark;
  previousStatus?: string;
  nextStatus?: string;
  createdAt: string;
}

const MARK_LABELS: Record<TrustMark, string> = {
  PAYMENT_PENDING: "Payment pending against the brand",
  DELIVERABLE_PENDING: "Deliverable pending against the creator",
  NONE: "No public mark",
};

const formatRupees = (paise: number) =>
  `₹${(paise / 100).toLocaleString("en-IN")}`;

const formatDate = (value?: string) =>
  value ? new Date(value).toLocaleString("en-IN") : "—";

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [openDisputes, setOpenDisputes] = useState<Dispute[]>([]);
  const [resolvedDisputes, setResolvedDisputes] = useState<Dispute[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, TrustMark>>({});
  const [audit, setAudit] = useState<Record<string, AuditEvent[] | null>>({});
  const [busyId, setBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadDisputes = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [open, resolved] = await Promise.all([
        api<{ disputes: Dispute[] }>("/admin/disputes?state=OPEN"),
        api<{ disputes: Dispute[] }>("/admin/disputes?state=RESOLVED"),
      ]);
      setOpenDisputes(open.disputes);
      setResolvedDisputes(resolved.disputes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load admin reviews");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDisputes();
  }, [loadDisputes]);

  async function resolveDispute(dispute: Dispute) {
    const reason = reasons[dispute._id]?.trim() ?? "";
    if (reason.length < 10) {
      setError("Add a review reason with at least 10 characters.");
      return;
    }
    setBusyId(dispute._id);
    setError("");
    setMessage("");
    try {
      await api(`/admin/disputes/${dispute._id}/resolve`, {
        method: "POST",
        body: JSON.stringify({
          trustMark: marks[dispute._id] ?? "NONE",
          reason,
        }),
      });
      setReasons((current) => ({ ...current, [dispute._id]: "" }));
      setMessage("Dispute reviewed. The deal has been unfrozen.");
      await loadDisputes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resolve dispute");
    } finally {
      setBusyId("");
    }
  }

  async function updateTrustMark(dispute: Dispute) {
    const reason = reasons[dispute._id]?.trim() ?? "";
    if (reason.length < 10) {
      setError("Add a correction reason with at least 10 characters.");
      return;
    }
    setBusyId(dispute._id);
    setError("");
    setMessage("");
    try {
      await api(`/admin/disputes/${dispute._id}/trust-mark`, {
        method: "PATCH",
        body: JSON.stringify({
          trustMark: marks[dispute._id] ?? dispute.trustMark,
          reason,
        }),
      });
      setReasons((current) => ({ ...current, [dispute._id]: "" }));
      setMessage("Trust mark updated and recorded in the audit history.");
      await loadDisputes();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update trust mark");
    } finally {
      setBusyId("");
    }
  }

  async function toggleAudit(disputeId: string) {
    if (audit[disputeId]) {
      setAudit((current) => ({ ...current, [disputeId]: null }));
      return;
    }
    try {
      const result = await api<{ events: AuditEvent[] }>(
        `/admin/disputes/${disputeId}/audit`,
      );
      setAudit((current) => ({ ...current, [disputeId]: result.events }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load audit history");
    }
  }

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  function renderDeal(dispute: Dispute) {
    const deal = dispute.deal;
    if (!deal) return <p className="muted">Deal details are unavailable.</p>;
    return (
      <div className="stack">
        <div>
          <strong>{deal.title}</strong>
          <div className="muted small">
            {deal.status} · {deal.collaborationType} · {formatRupees(deal.amount)}
          </div>
          <p>{deal.brief}</p>
        </div>
        {deal.payments.length > 0 && (
          <div>
            <strong>Payment records</strong>
            <ul className="plain-list">
              {deal.payments.map((payment, index) => (
                <li key={`${payment.stage}-${index}`} className="muted small">
                  {payment.stage}: {payment.status}, {formatRupees(payment.amount)}; sent {formatDate(payment.sentAt)}
                  {payment.note ? ` — ${payment.note}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  function renderAudit(disputeId: string) {
    const events = audit[disputeId];
    if (!events) return null;
    return (
      <ol className="plain-list">
        {events.map((event) => (
          <li key={event._id} className="muted small">
            {formatDate(event.createdAt)} · {event.action} by {event.actor?.name ?? "Admin"}: {event.reason}
            {event.previousMark && event.nextMark
              ? ` (${MARK_LABELS[event.previousMark]} → ${MARK_LABELS[event.nextMark]})`
              : ""}
          </li>
        ))}
      </ol>
    );
  }

  return (
    <>
      <header className="header">
        <div className="container header-row">
          <Logo />
          <div className="header-actions">
            <span className="muted small">Admin · {user?.name}</span>
            <ThemeToggle />
            <button className="btn btn-text btn-sm" onClick={handleLogout}>
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="page stack">
        <div>
          <h1>Dispute review</h1>
          <p className="muted">
            Review evidence, restore the deal stage, and add or clear anonymous trust marks.
          </p>
        </div>
        {error && <p className="alert" role="alert">{error}</p>}
        {message && <p className="success" role="status">{message}</p>}
        {loading && <p className="muted" role="status">Loading reviews…</p>}

        <section className="stack" aria-labelledby="open-disputes-heading">
          <h2 id="open-disputes-heading">Open disputes ({openDisputes.length})</h2>
          {!loading && openDisputes.length === 0 && (
            <p className="muted">No disputes are waiting for review.</p>
          )}
          {openDisputes.map((dispute) => (
            <article key={dispute._id} className="card stack">
              <div>
                <h3>{dispute.deal?.title ?? "Deal dispute"}</h3>
                <p className="muted small">
                  Raised by {dispute.raisedBy?.name} ({dispute.raisedBy?.email}) on {formatDate(dispute.createdAt)}
                </p>
                <p><strong>Brand:</strong> {dispute.brand?.name} ({dispute.brand?.email})</p>
                <p><strong>Creator:</strong> {dispute.influencer?.name} ({dispute.influencer?.email})</p>
                <p><strong>Dispute reason:</strong> {dispute.reason}</p>
                <p className="muted small">Deal stage before dispute: {dispute.previousStatus}</p>
              </div>
              {renderDeal(dispute)}
              <div className="field">
                <label htmlFor={`outcome-${dispute._id}`}>Review outcome</label>
                <select
                  id={`outcome-${dispute._id}`}
                  value={marks[dispute._id] ?? "NONE"}
                  onChange={(event) =>
                    setMarks((current) => ({
                      ...current,
                      [dispute._id]: event.target.value as TrustMark,
                    }))
                  }
                >
                  {Object.entries(MARK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`reason-${dispute._id}`}>Review notes (minimum 10 characters)</label>
                <textarea
                  id={`reason-${dispute._id}`}
                  value={reasons[dispute._id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [dispute._id]: event.target.value }))
                  }
                  maxLength={1000}
                  rows={3}
                />
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  disabled={busyId === dispute._id || (reasons[dispute._id]?.trim().length ?? 0) < 10}
                  onClick={() => void resolveDispute(dispute)}
                >
                  {busyId === dispute._id ? "Saving…" : "Resolve and unfreeze deal"}
                </button>
                <button className="btn btn-outline" onClick={() => void toggleAudit(dispute._id)}>
                  {audit[dispute._id] ? "Hide history" : "View history"}
                </button>
              </div>
              {renderAudit(dispute._id)}
            </article>
          ))}
        </section>

        <section className="stack" aria-labelledby="trust-marks-heading">
          <h2 id="trust-marks-heading">Reviewed disputes and trust marks ({resolvedDisputes.length})</h2>
          {resolvedDisputes.length === 0 && !loading && (
            <p className="muted">No disputes have been reviewed yet.</p>
          )}
          {resolvedDisputes.map((dispute) => (
            <article key={dispute._id} className="card stack">
              <div>
                <h3>{dispute.deal?.title ?? "Reviewed dispute"}</h3>
                <p className="muted small">
                  {dispute.brand?.name} and {dispute.influencer?.name} · reviewed {formatDate(dispute.resolvedAt)}
                </p>
                <p>{dispute.resolutionNote}</p>
                <strong>{dispute.trustMarkActive ? MARK_LABELS[dispute.trustMark] : "No active public trust mark"}</strong>
              </div>
              <div className="field">
                <label htmlFor={`mark-${dispute._id}`}>Correct or clear trust mark</label>
                <select
                  id={`mark-${dispute._id}`}
                  value={marks[dispute._id] ?? (dispute.trustMarkActive ? dispute.trustMark : "NONE")}
                  onChange={(event) =>
                    setMarks((current) => ({
                      ...current,
                      [dispute._id]: event.target.value as TrustMark,
                    }))
                  }
                >
                  {Object.entries(MARK_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={`correction-${dispute._id}`}>Correction reason (minimum 10 characters)</label>
                <textarea
                  id={`correction-${dispute._id}`}
                  value={reasons[dispute._id] ?? ""}
                  onChange={(event) =>
                    setReasons((current) => ({ ...current, [dispute._id]: event.target.value }))
                  }
                  maxLength={1000}
                  rows={2}
                />
              </div>
              <div className="btn-row">
                <button
                  className="btn btn-outline"
                  disabled={busyId === dispute._id || (reasons[dispute._id]?.trim().length ?? 0) < 10}
                  onClick={() => void updateTrustMark(dispute)}
                >
                  {busyId === dispute._id ? "Saving…" : "Save correction"}
                </button>
                <button className="btn btn-outline" onClick={() => void toggleAudit(dispute._id)}>
                  {audit[dispute._id] ? "Hide history" : "View history"}
                </button>
              </div>
              {renderAudit(dispute._id)}
            </article>
          ))}
        </section>
      </main>
    </>
  );
}
