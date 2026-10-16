import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toDataURL } from "qrcode";
import { api } from "../lib/api";
import { formatRupees } from "../lib/format";

type Stage = "ADVANCE" | "FINAL";

interface ShareInfo {
  shares: { stage: Stage; expiresAt: string }[];
  log: {
    stage: Stage;
    event: "SHARED" | "VIEWED" | "REVOKED";
    at: string;
    by: "BRAND" | "INFLUENCER";
  }[];
}

interface ViewResponse {
  stage: Stage;
  expiresAt: string;
  amountDue: number; // paise
  currency: string;
  details: {
    accountHolderName: string;
    bankName: string;
    accountNumber: string;
    ifsc: string;
    upiId: string;
  };
  upiUri: string | null;
}

interface Props {
  dealId: string;
  status: string;
  role: "BRAND" | "INFLUENCER";
  otherName: string;
  payments: { advance: number; final: number };
}

const SHARE_HOURS = 6; // matches the server setting
const STAGE_BY_STATUS: Record<string, Stage> = {
  ACCEPTED: "ADVANCE",
  LINK_VERIFIED: "FINAL",
};
const stageWord = (s: Stage) => (s === "ADVANCE" ? "advance" : "final");

function formatRemaining(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function eventLabel(e: ShareInfo["log"][number]) {
  const w = stageWord(e.stage);
  if (e.event === "SHARED")
    return `Influencer shared payment details for the ${w}`;
  if (e.event === "VIEWED")
    return `Brand viewed the payment details for the ${w}`;
  return `Influencer ended the ${w} share`;
}

// A clock that ticks every second, but only while something is counting down
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Copying isn't available here; the value is still on screen
    }
  }
  return (
    <button type="button" onClick={copy} style={{ marginLeft: 8 }}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

const box = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: 12,
  margin: "8px 0",
} as const;

export default function PaymentSharePanel({
  dealId,
  status,
  role,
  otherName,
  payments,
}: Props) {
  const stage = STAGE_BY_STATUS[status] ?? null;

  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [hasDetails, setHasDetails] = useState<boolean | null>(null); // influencer only
  const [view, setView] = useState<ViewResponse | null>(null);
  const [qr, setQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // Anything sensitive on screen is dropped whenever the deal moves on
  useEffect(() => {
    setView(null);
    setQr("");
    setError("");
  }, [dealId, status]);

  // Load the share status (and, for an influencer, whether details are saved)
  useEffect(() => {
    let cancelled = false;

    api<ShareInfo>(`/payment-shares/deal/${dealId}`)
      .then((res) => {
        if (!cancelled) setInfo(res);
      })
      .catch((err) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load sharing status",
          );
      });

    if (role === "INFLUENCER") {
      api<{ details: unknown | null }>("/payment-details/me")
        .then((res) => {
          if (!cancelled) setHasDetails(res.details !== null);
        })
        .catch(() => {
          if (!cancelled) setHasDetails(null);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [dealId, status, role, reloadKey]);

  const openShare = stage
    ? info?.shares.find((s) => s.stage === stage)
    : undefined;
  const expiryMs = view
    ? new Date(view.expiresAt).getTime()
    : openShare
      ? new Date(openShare.expiresAt).getTime()
      : null;
  const now = useNow(expiryMs !== null);
  const expired = expiryMs !== null && now >= expiryMs;

  // When time runs out: wipe the details from the screen and refresh the status
  useEffect(() => {
    if (expired) {
      setView(null);
      setQr("");
      reload();
    }
  }, [expired, reload]);

  async function handleShare() {
    if (!stage) return;
    setBusy(true);
    setError("");
    try {
      await api("/payment-shares", {
        method: "POST",
        body: JSON.stringify({ dealId, stage }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not share");
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function handleEndShare() {
    if (!stage) return;
    setBusy(true);
    setError("");
    try {
      await api(`/payment-shares/deal/${dealId}/${stage}`, {
        method: "DELETE",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not end the share");
    } finally {
      setBusy(false);
      reload();
    }
  }

  async function handleShow() {
    if (!stage) return;
    setBusy(true);
    setError("");
    try {
      const res = await api<ViewResponse>(
        `/payment-shares/deal/${dealId}/${stage}/view`,
      );
      setView(res);
      if (res.upiUri && res.upiUri.startsWith("upi://pay?")) {
        try {
          setQr(await toDataURL(res.upiUri, { width: 220, margin: 1 }));
        } catch {
          setQr("");
        }
      }
      reload(); // so the activity log shows this view
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load the payment details",
      );
      reload();
    } finally {
      setBusy(false);
    }
  }

  function handleHide() {
    setView(null);
    setQr("");
  }

  const log = info?.log ?? [];
  if (!stage && log.length === 0) return null;

  const remaining = expiryMs !== null ? formatRemaining(expiryMs - now) : "";
  const stageAmount = stage
    ? stage === "ADVANCE"
      ? payments.advance
      : payments.final
    : 0;
  const shareIsOpen = Boolean(openShare) && !expired;

  return (
    <section>
      <h2>Payment details</h2>

      {stage && role === "INFLUENCER" && (
        <div style={box}>
          {hasDetails === false ? (
            <p style={{ margin: 0 }}>
              You haven't saved payment details yet.{" "}
              <Link to="/influencer/payment-details">Save them first</Link>,
              then come back to share them.
            </p>
          ) : shareIsOpen ? (
            <>
              <p style={{ margin: "0 0 8px" }}>
                Your details are shared with <strong>{otherName}</strong> for
                the {stageWord(stage)} payment. Access ends in{" "}
                <strong>{remaining}</strong>.
              </p>
              <button type="button" onClick={handleEndShare} disabled={busy}>
                End sharing now
              </button>
            </>
          ) : (
            <>
              <p style={{ margin: "0 0 8px" }}>
                Share your payment details with <strong>{otherName}</strong> so
                they can pay the {stageWord(stage)} ({formatRupees(stageAmount)}
                ). They will see your full account number and UPI ID for{" "}
                {SHARE_HOURS} hours, then access ends automatically. You can end
                it sooner.
              </p>
              <button type="button" onClick={handleShare} disabled={busy}>
                {busy ? "Working..." : "Share payment details"}
              </button>
            </>
          )}
        </div>
      )}

      {stage && role === "BRAND" && (
        <div style={box}>
          {view ? (
            <>
              <p style={{ margin: "0 0 8px" }}>
                Pay the <strong>{stageWord(stage)}</strong>:{" "}
                <strong>{formatRupees(view.amountDue)}</strong>. Visible for{" "}
                <strong>{remaining}</strong>.
              </p>
              <p style={{ color: "crimson", margin: "0 0 8px" }}>
                Before paying, check that the account holder name matches the
                influencer.
              </p>

              <div style={{ display: "grid", gap: 4 }}>
                <div>Name: {view.details.accountHolderName}</div>
                {view.details.bankName && (
                  <div>Bank: {view.details.bankName}</div>
                )}
                {view.details.accountNumber && (
                  <div>
                    Account number: {view.details.accountNumber}
                    <CopyButton value={view.details.accountNumber} />
                  </div>
                )}
                {view.details.ifsc && (
                  <div>
                    IFSC: {view.details.ifsc}
                    <CopyButton value={view.details.ifsc} />
                  </div>
                )}
                {view.details.upiId && (
                  <div>
                    UPI ID: {view.details.upiId}
                    <CopyButton value={view.details.upiId} />
                  </div>
                )}
              </div>

              {qr && (
                <div style={{ margin: "12px 0" }}>
                  <img
                    src={qr}
                    alt="UPI QR code with the amount filled in"
                    width={220}
                    height={220}
                  />
                  <div style={{ color: "gray", fontSize: 13 }}>
                    Scan with any UPI app. The amount is already filled in.
                  </div>
                </div>
              )}

              {view.upiUri && view.upiUri.startsWith("upi://pay?") && (
                <p style={{ margin: "8px 0" }}>
                  <a href={view.upiUri}>Open in my UPI app</a> (on a phone)
                </p>
              )}

              <p style={{ color: "gray", margin: "8px 0" }}>
                After paying, click{" "}
                <strong>I've sent the {stageWord(stage)}</strong> above and
                enter the payment reference (UTR).
              </p>
              <button type="button" onClick={handleHide}>
                Hide details
              </button>
            </>
          ) : shareIsOpen ? (
            <>
              <p style={{ margin: "0 0 8px" }}>
                <strong>{otherName}</strong> has shared payment details for the{" "}
                {stageWord(stage)} ({formatRupees(stageAmount)}). Available for{" "}
                <strong>{remaining}</strong>.
              </p>
              <button type="button" onClick={handleShow} disabled={busy}>
                {busy ? "Loading..." : "Show payment details"}
              </button>
            </>
          ) : (
            <p style={{ margin: 0 }}>
              {otherName} hasn't shared payment details for the{" "}
              {stageWord(stage)}, or the share has ended. Ask them to share
              again, for example in <Link to="/messages">Messages</Link>.
            </p>
          )}
        </div>
      )}

      {error && <p style={{ color: "crimson" }}>{error}</p>}

      {log.length > 0 && (
        <details>
          <summary>Sharing activity ({log.length})</summary>
          <ul>
            {log.slice(0, 10).map((e, i) => (
              <li key={i}>
                {eventLabel(e)}{" "}
                <span style={{ color: "gray", fontSize: 13 }}>
                  {new Date(e.at).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
