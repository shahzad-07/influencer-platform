import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { formatRupees, statusLabel } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import PaymentSharePanel from "../components/PaymentSharePanel";

interface PaymentRecord {
  stage: "ADVANCE" | "FINAL";
  amount: number; // paise
  reference: string;
  status: "SENT" | "CONFIRMED" | "REJECTED";
  sentAt: string;
  resolvedAt: string | null;
  note: string;
}

interface HistoryEntry {
  status: string;
  at: string;
  by: string | null; // user id, or null for the system
  note: string;
}

interface Deal {
  id: string;
  title: string;
  brief: string;
  deadline?: string | null;
  amount: number;
  currency: string;
  advancePercent: number;
  payments: { advance: number; final: number };
  paymentRecords: PaymentRecord[];
  paidTotal: number;
  status: string;
  expiresAt?: string | null;
  draftUrl: string;
  postUrl: string;
  brand: { id: string; name: string };
  influencer: { id: string; name: string };
  statusHistory: HistoryEntry[];
  allowedActions: string[];
}

// What each button is called and what it needs from the user
interface ActionConfig {
  label: string;
  note?: "optional" | "required";
  urlLabel?: string; // asks for a link
  reference?: boolean; // asks for the payment reference (UTR)
  help?: string;
}

const ACTIONS: Record<string, ActionConfig> = {
  accept: { label: "Accept offer" },
  decline: { label: "Decline offer", note: "optional" },
  cancel: { label: "Cancel offer", note: "optional" },
  markAdvanceSent: {
    label: "I've sent the advance",
    reference: true,
    help: "Pay directly from your UPI or banking app first, then enter the reference here.",
  },
  confirmAdvance: { label: "I received the advance", note: "optional" },
  rejectAdvance: {
    label: "I didn't receive the advance",
    note: "optional",
    help: "Say what happened, for example: only half arrived.",
  },
  submitDraft: {
    label: "Submit draft",
    urlLabel: "Link to your draft",
    note: "optional",
  },
  requestChanges: {
    label: "Request changes",
    note: "required",
    help: "List what you would like changed.",
  },
  approveDraft: { label: "Approve draft", note: "optional" },
  submitLink: {
    label: "Submit posted link",
    urlLabel: "Link to the live post",
  },
  rejectLink: {
    label: "Reject the link",
    note: "required",
    help: "Say what's wrong, for example: the post is private.",
  },
  verifyLink: { label: "Verify the post is live", note: "optional" },
  markFinalSent: {
    label: "I've sent the final payment",
    reference: true,
    help: "Pay directly from your UPI or banking app first, then enter the reference here.",
  },
  confirmFinal: { label: "I received the final payment", note: "optional" },
  rejectFinal: {
    label: "I didn't receive the final payment",
    note: "optional",
    help: "Say what happened, for example: only half arrived.",
  },
  dispute: {
    label: "Raise a dispute",
    note: "required",
    help: "Explain the problem clearly. A disputed deal is frozen until it is resolved.",
  },
};

// Only turn http(s) URLs into clickable links
const isSafeUrl = (url: string) => /^https?:\/\//i.test(url);

const pill = {
  background: "#eee",
  color: "#333",
  borderRadius: 12,
  padding: "2px 8px",
  fontSize: 12,
} as const;

export default function DealDetail() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();

  const [deal, setDeal] = useState<Deal | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  // The action form
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [reference, setReference] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [actionError, setActionError] = useState("");

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    api<{ deal: Deal }>(`/deals/${id}`)
      .then((res) => {
        if (!cancelled) {
          setDeal(res.deal);
          setLoadError("");
        }
      })
      .catch((err) => {
        if (!cancelled)
          setLoadError(
            err instanceof Error ? err.message : "Could not load the deal",
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, refreshKey]);

  function pickAction(action: string) {
    setSelected(action);
    setNote("");
    setUrl("");
    setReference("");
    setActionError("");
  }

  async function handleAction(e: FormEvent) {
    e.preventDefault();
    if (!selected || !id) return;

    setSubmitting(true);
    setActionError("");
    try {
      await api(`/deals/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: selected,
          note: note.trim() || undefined,
          url: url.trim() || undefined,
          reference: reference.trim() || undefined,
        }),
      });
      setSelected(null);
      refresh();
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : "Something went wrong",
      );
      // The deal may have changed under us, so reload it
      refresh();
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;
  if (loadError || !deal) {
    return (
      <div style={{ maxWidth: 700, margin: "40px auto", padding: 16 }}>
        <p>
          <Link to="/deals">← Back to deals</Link>
        </p>
        <p style={{ color: "crimson" }}>{loadError || "Deal not found"}</p>
      </div>
    );
  }

  const isBrand = user?.role === "BRAND";
  const otherName = isBrand ? deal.influencer.name : deal.brand.name;
  const cfg = selected ? (ACTIONS[selected] ?? { label: selected }) : null;
  const amountForAction =
    selected === "markAdvanceSent"
      ? deal.payments.advance
      : selected === "markFinalSent"
        ? deal.payments.final
        : null;

  function who(by: string | null) {
    if (by === null) return "System";
    if (by === deal!.brand.id) return `${deal!.brand.name} (brand)`;
    if (by === deal!.influencer.id)
      return `${deal!.influencer.name} (influencer)`;
    return "Someone";
  }

  return (
    <div style={{ maxWidth: 700, margin: "40px auto", padding: 16 }}>
      <p>
        <Link to="/deals">← Back to deals</Link>
      </p>

      <h1 style={{ marginBottom: 4 }}>{deal.title}</h1>
      <div>
        <span style={pill}>{statusLabel(deal.status)}</span>
        <span style={{ color: "gray", marginLeft: 8 }}>
          {isBrand ? "Influencer" : "Brand"}: {otherName}
        </span>
      </div>

      {/* Money */}
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: 8,
          padding: 12,
          margin: "16px 0",
        }}
      >
        <div>
          <strong>Total {formatRupees(deal.amount)}</strong>
        </div>
        <div>
          Advance ({deal.advancePercent}%):{" "}
          {formatRupees(deal.payments.advance)}
        </div>
        <div>Final: {formatRupees(deal.payments.final)}</div>
        <div style={{ marginTop: 4 }}>
          Confirmed paid so far: <strong>{formatRupees(deal.paidTotal)}</strong>
        </div>
        {deal.deadline && (
          <div style={{ color: "gray" }}>
            Deadline: {new Date(deal.deadline).toLocaleDateString()}
          </div>
        )}
        {deal.status === "OFFERED" && deal.expiresAt && (
          <div style={{ color: "gray" }}>
            This offer expires on{" "}
            {new Date(deal.expiresAt).toLocaleDateString()}.
          </div>
        )}
      </div>

      {/* The brief */}
      <h2>Brief</h2>
      <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
        {deal.brief}
      </p>

      {/* Draft and post links */}
      {(deal.draftUrl || deal.postUrl) && (
        <>
          <h2>Links</h2>
          <ul>
            {deal.draftUrl && (
              <li>
                Draft:{" "}
                {isSafeUrl(deal.draftUrl) ? (
                  <a
                    href={deal.draftUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {deal.draftUrl}
                  </a>
                ) : (
                  deal.draftUrl
                )}
              </li>
            )}
            {deal.postUrl && (
              <li>
                Live post:{" "}
                {isSafeUrl(deal.postUrl) ? (
                  <a
                    href={deal.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {deal.postUrl}
                  </a>
                ) : (
                  deal.postUrl
                )}
              </li>
            )}
          </ul>
        </>
      )}

      {/* What can I do now? */}
      <h2>What's next</h2>
      {deal.allowedActions.length === 0 ? (
        <p style={{ color: "gray" }}>
          Nothing for you to do right now. You'll see buttons here when it's
          your turn.
        </p>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {deal.allowedActions.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => pickAction(a)}
              aria-pressed={selected === a}
              style={{ fontWeight: selected === a ? "bold" : "normal" }}
            >
              {ACTIONS[a]?.label ?? a}
            </button>
          ))}
        </div>
      )}

      {selected && cfg && (
        <form
          onSubmit={handleAction}
          style={{
            display: "grid",
            gap: 8,
            border: "1px solid #ccc",
            borderRadius: 8,
            padding: 12,
            marginTop: 12,
          }}
        >
          <strong>{cfg.label}</strong>
          {cfg.help && <span style={{ color: "gray" }}>{cfg.help}</span>}
          {amountForAction !== null && (
            <span>
              Amount to pay: <strong>{formatRupees(amountForAction)}</strong>
            </span>
          )}

          {cfg.reference && (
            <label>
              Payment reference (UTR or transaction ID)
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                pattern="[A-Za-z0-9\-]{6,30}"
                title="6 to 30 letters, digits or dashes, no spaces"
                maxLength={30}
                required
                autoComplete="off"
                style={{ width: "100%" }}
              />
            </label>
          )}

          {cfg.urlLabel && (
            <label>
              {cfg.urlLabel}
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://..."
                maxLength={300}
                required
                style={{ width: "100%" }}
              />
            </label>
          )}

          {cfg.note && (
            <label>
              {cfg.note === "required"
                ? "Comment (required)"
                : "Comment (optional)"}
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={1000}
                rows={3}
                required={cfg.note === "required"}
                style={{ width: "100%" }}
              />
            </label>
          )}

          {actionError && (
            <span style={{ color: "crimson" }}>{actionError}</span>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <button type="submit" disabled={submitting}>
              {submitting ? "Working..." : "Confirm"}
            </button>
            <button type="button" onClick={() => setSelected(null)}>
              Never mind
            </button>
          </div>
        </form>
      )}

      <PaymentSharePanel
        dealId={deal.id}
        status={deal.status}
        role={isBrand ? "BRAND" : "INFLUENCER"}
        otherName={otherName}
        payments={deal.payments}
      />

      {/* Payment records */}
      <h2>Payments</h2>
      {deal.paymentRecords.length === 0 ? (
        <p style={{ color: "gray" }}>No payments recorded yet.</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {deal.paymentRecords.map((p, i) => (
            <div
              key={i}
              style={{ border: "1px solid #ccc", borderRadius: 8, padding: 8 }}
            >
              <div>
                <strong>{p.stage === "ADVANCE" ? "Advance" : "Final"}</strong>:{" "}
                {formatRupees(p.amount)}{" "}
                <span style={pill}>{p.status.toLowerCase()}</span>
              </div>
              <div style={{ color: "gray", fontSize: 13 }}>
                Reference {p.reference}. Sent{" "}
                {new Date(p.sentAt).toLocaleString()}
                {p.resolvedAt &&
                  `. Settled ${new Date(p.resolvedAt).toLocaleString()}`}
              </div>
              {p.note && <div style={{ fontSize: 13 }}>Note: {p.note}</div>}
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      <h2>Timeline</h2>
      <ol style={{ paddingLeft: 20 }}>
        {deal.statusHistory.map((h, i) => (
          <li key={i} style={{ marginBottom: 8 }}>
            <strong>{statusLabel(h.status)}</strong>
            <div style={{ color: "gray", fontSize: 13 }}>
              {who(h.by)}, {new Date(h.at).toLocaleString()}
            </div>
            {h.note && (
              <div style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                {h.note}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
