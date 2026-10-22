import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import {
  collabLabel,
  formatRupees,
  isPaidType,
  statusLabel,
} from "../lib/format";
import { useAuth } from "../context/AuthContext";
import PaymentSharePanel from "../components/PaymentSharePanel";
import PaymentTerms from "../components/PaymentTerms";
import AppLayout from "../components/AppLayout";

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
  collaborationType?: string | null;
  barterDescription?: string;
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
  draftVersions: {
    version: number;
    submittedAt: string;
    link: string;
    contentType: string;
    sizeBytes: number;
    videoUrl: string | null;
  }[];
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
  optionalUrl?: boolean;
  uploadDraft?: boolean;
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
    help: "Pay directly from your UPI or banking app first. The payment reference is optional, but it helps the creator find the payment.",
  },
  confirmAdvance: { label: "I received the advance", note: "optional" },
  rejectAdvance: {
    label: "I didn't receive the advance",
    note: "optional",
    help: "Say what happened, for example: only half arrived.",
  },
  submitDraft: {
    label: "Submit draft",
    urlLabel: "Draft link (optional if you upload a video)",
    optionalUrl: true,
    uploadDraft: true,
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
    help: "Pay directly from your UPI or banking app first. The payment reference is optional, but it helps the creator find the payment.",
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

// Buttons that are always possible and don't mean "it's your turn"
const SIDE_ACTIONS = ["cancel", "dispute"];

// Deals with no way forward (same list as TERMINAL_STATUSES on the server)
const closedText: Record<string, string> = {
  COMPLETED: "This deal is complete. Nothing more to do.",
  DECLINED: "This offer was declined.",
  CANCELLED: "This offer was cancelled.",
  EXPIRED: "This offer expired.",
  DISPUTED: "This deal is disputed and frozen until it is resolved.",
};

// For each open status: what you do when it is your turn, and what the
// other side is doing when it is theirs ("Waiting for X to ...")
const STEP_TEXT: Record<string, { mine: string; theirs: string }> = {
  OFFERED: {
    mine: "Accept or decline this offer.",
    theirs: "respond to the offer",
  },
  ACCEPTED: {
    mine: "Pay the advance outside the app, then mark it as sent. Adding the payment reference is optional.",
    theirs: "send the advance",
  },
  ADVANCE_SENT: {
    mine: "Check your account, then confirm whether the advance arrived.",
    theirs: "confirm the advance",
  },
  IN_PROGRESS: {
    mine: "Make the content and submit a draft video or link.",
    theirs: "submit a draft",
  },
  DRAFT_SUBMITTED: {
    mine: "Review the draft. Approve it or ask for changes.",
    theirs: "review your draft",
  },
  CHANGES_REQUESTED: {
    mine: "Make the changes asked for and submit the updated video or link.",
    theirs: "submit the updated draft",
  },
  DRAFT_APPROVED: {
    mine: "Post the content and submit the link to the live post.",
    theirs: "post the content and share the link",
  },
  LINK_SUBMITTED: {
    mine: "Check that the post is live. Verify it or reject the link.",
    theirs: "check the post link",
  },
  LINK_VERIFIED: {
    mine: "Pay the final amount outside the app, then mark it as sent. Adding the payment reference is optional.",
    theirs: "send the final payment",
  },
  FINAL_SENT: {
    mine: "Check your account, then confirm whether the final payment arrived.",
    theirs: "confirm the final payment",
  },
};

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
  const [draftFile, setDraftFile] = useState<File | null>(null);
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
    setDraftFile(null);
    setReference("");
    setActionError("");
  }

  async function handleAction(e: FormEvent) {
    e.preventDefault();
    if (!selected || !id) return;

    setSubmitting(true);
    setActionError("");
    try {
      let draftObjectPath: string | undefined;
      if (selected === "submitDraft" && draftFile) {
        const { getSupabaseClient } = await import("../lib/supabase");
        if (draftFile.size > 1024 * 1024) {
          throw new Error("The video must be no larger than 1 MB");
        }
        if (
          !["video/mp4", "video/webm", "video/quicktime"].includes(
            draftFile.type,
          )
        ) {
          throw new Error("Choose an MP4, WebM or MOV video");
        }
        const signed = await api<{
          path: string;
          token: string;
          bucket: string;
        }>(`/deals/${id}/draft-uploads`, {
          method: "POST",
          body: JSON.stringify({
            fileName: draftFile.name,
            contentType: draftFile.type,
            sizeBytes: draftFile.size,
          }),
        });
        const { error } = await getSupabaseClient()
          .storage.from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, draftFile, {
            contentType: draftFile.type,
          });
        if (error) throw new Error("The video upload failed. Please try again.");
        draftObjectPath = signed.path;
      }
      await api(`/deals/${id}/actions`, {
        method: "POST",
        body: JSON.stringify({
          action: selected,
          note: note.trim() || undefined,
          url: url.trim() || undefined,
          draftObjectPath,
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

  if (loading) {
    return (
      <AppLayout>
        <p className="muted">Loading...</p>
      </AppLayout>
    );
  }
  if (loadError || !deal) {
    return (
      <AppLayout>
        <p>
          <Link to="/deals">Back to deals</Link>
        </p>
        <p className="alert" role="alert">
          {loadError || "Deal not found"}
        </p>
      </AppLayout>
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

  // Money is involved for everything except barter-only
  const paid = isPaidType(deal.collaborationType);

  // Whose turn is it? It is mine when the server allows me an action that
  // moves the deal on (cancel and dispute alone don't count).
  const closed = deal.status in closedText;
  const myTurn =
    !closed && deal.allowedActions.some((a) => !SIDE_ACTIONS.includes(a));
  const stepText = STEP_TEXT[deal.status];

  function who(by: string | null) {
    if (by === null) return "System";
    if (by === deal!.brand.id) return `${deal!.brand.name} (brand)`;
    if (by === deal!.influencer.id) return `${deal!.influencer.name} (creator)`;
    return "Someone";
  }

  return (
    <AppLayout>
      <p>
        <Link to="/deals">Back to deals</Link>
      </p>

      <div className="stack form-wide">
        <div>
          <h1>{deal.title}</h1>
          <div className="deal-meta">
            <span className="tag">{statusLabel(deal.status)}</span>
            <span className="tag">{collabLabel(deal.collaborationType)}</span>
            <span className="muted">
              {isBrand ? "Creator" : "Brand"}: {otherName}
            </span>
          </div>
        </div>

        {/* Next step: who must act, with their buttons */}
        <section className="card stack next-step">
          <h2>Next step</h2>
          {closed ? (
            <p>{closedText[deal.status]}</p>
          ) : myTurn ? (
            <p>
              <strong>Your turn.</strong> {stepText?.mine}
            </p>
          ) : (
            <p>
              <strong>Waiting for {otherName}</strong>
              {stepText ? ` to ${stepText.theirs}.` : "."}
            </p>
          )}

          {deal.allowedActions.length > 0 && (
            <>
              {!myTurn && <span className="muted small">Other options</span>}
              <div className="btn-row">
                {deal.allowedActions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    className={
                      selected === a
                        ? "btn btn-primary btn-sm"
                        : "btn btn-outline btn-sm"
                    }
                    onClick={() => pickAction(a)}
                    aria-pressed={selected === a}
                  >
                    {ACTIONS[a]?.label ?? a}
                  </button>
                ))}
              </div>
            </>
          )}

          {selected && cfg && (
            <form className="card stack" onSubmit={handleAction}>
              <strong>{cfg.label}</strong>
              {cfg.help && <span className="muted">{cfg.help}</span>}
              {amountForAction !== null && (
                <span>
                  Amount to pay:{" "}
                  <strong>{formatRupees(amountForAction)}</strong>
                </span>
              )}

              {cfg.reference && (
                <div className="field">
                  <label htmlFor="reference">
                    Payment reference (UTR or transaction ID), optional
                  </label>
                  <input
                    id="reference"
                    value={reference}
                    onChange={(e) => setReference(e.target.value)}
                    pattern="[A-Za-z0-9\-]{6,30}"
                    title="Optional. If you add one: 6 to 30 letters, digits or dashes, no spaces"
                    maxLength={30}
                    autoComplete="off"
                  />
                </div>
              )}

              {cfg.urlLabel && (
                <div className="field">
                  <label htmlFor="url">{cfg.urlLabel}</label>
                  <input
                    id="url"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    maxLength={300}
                    required={!cfg.optionalUrl}
                  />
                </div>
              )}

              {cfg.uploadDraft && (
                <div className="field">
                  <label htmlFor="draft-video">
                    Draft video (optional, MP4/WebM/MOV, up to 1 MB)
                  </label>
                  <input
                    id="draft-video"
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime"
                    onChange={(e) => setDraftFile(e.target.files?.[0] ?? null)}
                  />
                  <span className="muted small">
                    Upload a video, add a link, or do both.
                  </span>
                </div>
              )}

              {cfg.note && (
                <div className="field">
                  <label htmlFor="note">
                    {cfg.note === "required"
                      ? "Comment (required)"
                      : "Comment (optional)"}
                  </label>
                  <textarea
                    id="note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    required={cfg.note === "required"}
                  />
                </div>
              )}

              {actionError && (
                <p className="alert" role="alert">
                  {actionError}
                </p>
              )}

              <div className="btn-row">
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={submitting}
                >
                  {submitting ? "Working..." : "Confirm"}
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setSelected(null)}
                >
                  Never mind
                </button>
              </div>
            </form>
          )}
        </section>

        {/* Summary: total and progress (money), dates */}
        <section className="card">
          {paid ? (
            <>
              <div>
                <strong>Total {formatRupees(deal.amount)}</strong>
              </div>
              <div>
                Confirmed paid so far:{" "}
                <strong>{formatRupees(deal.paidTotal)}</strong>
              </div>
            </>
          ) : (
            <div>
              <strong>Barter only</strong>{" "}
              <span className="muted">(no money in this deal)</span>
            </div>
          )}
          {deal.deadline && (
            <div className="muted">
              Deadline: {new Date(deal.deadline).toLocaleDateString()}
            </div>
          )}
          {deal.status === "OFFERED" && deal.expiresAt && (
            <div className="muted">
              This offer expires on{" "}
              {new Date(deal.expiresAt).toLocaleDateString()}.
            </div>
          )}
        </section>

        {/* Payment terms and/or what the creator gets, always visible */}
        <PaymentTerms
          collaborationType={deal.collaborationType}
          barterDescription={deal.barterDescription}
          amounts={
            paid
              ? {
                  advance: deal.payments.advance,
                  final: deal.payments.final,
                  advancePercent: deal.advancePercent,
                }
              : undefined
          }
        />

        {/* The brief */}
        <section className="stack">
          <h2>Brief</h2>
          <p className="terms-text">{deal.brief}</p>
        </section>

        {/* Draft and post links */}
        {(deal.postUrl || (deal.draftUrl && deal.draftVersions.length === 0)) && (
          <section className="stack">
            <h2>Links</h2>
            <ul className="plain-list">
              {deal.draftUrl && deal.draftVersions.length === 0 && (
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
          </section>
        )}

        {deal.draftVersions.length > 0 && (
          <section className="stack">
            <h2>Draft submissions</h2>
            {deal.draftVersions.map((draft) => (
              <article className="card stack" key={draft.version}>
                <strong>Version {draft.version}</strong>
                <span className="muted small">
                  Submitted {new Date(draft.submittedAt).toLocaleString()}
                </span>
                {draft.videoUrl && (
                  <video controls preload="metadata" style={{ width: "100%" }}>
                    <source src={draft.videoUrl} type={draft.contentType} />
                    Your browser cannot play this video.
                  </video>
                )}
                {draft.link && (
                  <p>
                    Draft link: {isSafeUrl(draft.link) ? (
                      <a href={draft.link} target="_blank" rel="noopener noreferrer">
                        Open draft link
                      </a>
                    ) : draft.link}
                  </p>
                )}
                {!draft.videoUrl && draft.contentType && (
                  <p className="muted">Video is temporarily unavailable.</p>
                )}
              </article>
            ))}
          </section>
        )}

        {/* Payment sharing and records only exist when money is involved */}
        {paid && (
          <>
            <PaymentSharePanel
              dealId={deal.id}
              status={deal.status}
              role={isBrand ? "BRAND" : "INFLUENCER"}
              otherName={otherName}
              payments={deal.payments}
            />

            {/* Payment records */}
            <section className="stack">
              <h2>Payments</h2>
              {deal.paymentRecords.length === 0 ? (
                <p className="muted">No payments recorded yet.</p>
              ) : (
                deal.paymentRecords.map((p, i) => (
                  <div key={i} className="card">
                    <div>
                      <strong>
                        {p.stage === "ADVANCE" ? "Advance" : "Final"}
                      </strong>
                      : {formatRupees(p.amount)}{" "}
                      <span className="tag">{p.status.toLowerCase()}</span>
                    </div>
                    <div className="muted small">
                      {p.reference
                        ? `Reference ${p.reference}.`
                        : "No reference given."}{" "}
                      Sent {new Date(p.sentAt).toLocaleString()}
                      {p.resolvedAt &&
                        `. Settled ${new Date(p.resolvedAt).toLocaleString()}`}
                    </div>
                    {p.note && <div className="small">Note: {p.note}</div>}
                  </div>
                ))
              )}
            </section>
          </>
        )}

        {/* Timeline */}
        <section className="stack">
          <h2>Timeline</h2>
          <ol className="timeline">
            {[...deal.statusHistory].reverse().map((h, i) => (
              <li key={i}>
                <strong>{statusLabel(h.status)}</strong>
                <div className="muted small">
                  {who(h.by)}, {new Date(h.at).toLocaleString()}
                </div>
                {h.note && <div className="terms-text">{h.note}</div>}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </AppLayout>
  );
}
