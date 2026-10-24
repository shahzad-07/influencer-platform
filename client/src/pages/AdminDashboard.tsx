import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";

type TrustMark = "PAYMENT_PENDING" | "DELIVERABLE_PENDING" | "NONE";
type AccountStatus = "ACTIVE" | "SUSPENDED" | "REMOVED";
type AccountAction = "SUSPEND" | "REMOVE" | "RESTORE";

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

interface AdminAccount {
  _id: string;
  name: string;
  email: string;
  role: "BRAND" | "INFLUENCER";
  accountStatus?: AccountStatus;
  createdAt: string;
}

interface AccountAuditEvent {
  _id: string;
  actor?: Person;
  action: AccountAction;
  reason: string;
  previousStatus: AccountStatus;
  nextStatus: AccountStatus;
  createdAt: string;
}

const MARK_LABELS: Record<TrustMark, string> = {
  PAYMENT_PENDING: "Payment pending against the brand",
  DELIVERABLE_PENDING: "Deliverable pending against the creator",
  NONE: "No public mark",
};

const ACCOUNT_STATUS_LABELS: Record<AccountStatus, string> = {
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  REMOVED: "Soft removed",
};

const ACCOUNT_ACTION_LABELS: Record<AccountAction, string> = {
  SUSPEND: "Suspend account",
  REMOVE: "Soft remove account",
  RESTORE: "Restore account",
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
  const [accounts, setAccounts] = useState<AdminAccount[]>([]);
  const [accountsTotal, setAccountsTotal] = useState(0);
  const [accountsPage, setAccountsPage] = useState(1);
  const [accountRole, setAccountRole] = useState<"ALL" | "BRAND" | "INFLUENCER">("ALL");
  const [accountStatusFilter, setAccountStatusFilter] = useState<"ALL" | AccountStatus>("ALL");
  const [accountSearchInput, setAccountSearchInput] = useState("");
  const [accountSearch, setAccountSearch] = useState("");
  const [accountAudit, setAccountAudit] = useState<Record<string, AccountAuditEvent[] | null>>({});
  const [accountReasons, setAccountReasons] = useState<Record<string, string>>({});
  const [pendingAccountAction, setPendingAccountAction] = useState<{
    accountId: string;
    action: AccountAction;
  } | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [marks, setMarks] = useState<Record<string, TrustMark>>({});
  const [audit, setAudit] = useState<Record<string, AuditEvent[] | null>>({});
  const [busyId, setBusyId] = useState("");
  const [accountBusyId, setAccountBusyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [accountsLoading, setAccountsLoading] = useState(true);
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

  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ page: String(accountsPage), limit: "20" });
      if (accountRole !== "ALL") params.set("role", accountRole);
      if (accountStatusFilter !== "ALL") params.set("status", accountStatusFilter);
      if (accountSearch) params.set("search", accountSearch);
      const result = await api<{
        accounts: AdminAccount[];
        total: number;
      }>(`/admin/accounts?${params.toString()}`);
      setAccounts(result.accounts);
      setAccountsTotal(result.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load accounts");
    } finally {
      setAccountsLoading(false);
    }
  }, [accountRole, accountSearch, accountStatusFilter, accountsPage]);

  useEffect(() => {
    void loadAccounts();
  }, [loadAccounts]);

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

  async function changeAccountStatus(account: AdminAccount, action: AccountAction) {
    const reason = accountReasons[account._id]?.trim() ?? "";
    if (reason.length < 10) {
      setError("Add an account action reason with at least 10 characters.");
      return;
    }
    setAccountBusyId(account._id);
    setError("");
    setMessage("");
    try {
      await api(`/admin/accounts/${account._id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ action, reason }),
      });
      setPendingAccountAction(null);
      setAccountReasons((current) => ({ ...current, [account._id]: "" }));
      setMessage(`${ACCOUNT_ACTION_LABELS[action]} recorded in the account audit history.`);
      await loadAccounts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update account status");
    } finally {
      setAccountBusyId("");
    }
  }

  async function toggleAccountAudit(accountId: string) {
    if (accountAudit[accountId]) {
      setAccountAudit((current) => ({ ...current, [accountId]: null }));
      return;
    }
    try {
      const result = await api<{ events: AccountAuditEvent[] }>(
        `/admin/accounts/${accountId}/audit`,
      );
      setAccountAudit((current) => ({ ...current, [accountId]: result.events }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load account audit history");
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

        <section className="stack" aria-labelledby="accounts-heading">
          <div>
            <h2 id="accounts-heading">Brand and creator accounts ({accountsTotal})</h2>
            <p className="muted small">
              Suspended and soft-removed accounts cannot log in or appear in discovery. Their deal, payment, chat and audit history is kept.
            </p>
          </div>
          <form
            className="btn-row"
            onSubmit={(event) => {
              event.preventDefault();
              setAccountsPage(1);
              setAccountSearch(accountSearchInput.trim());
            }}
          >
            <div className="field">
              <label htmlFor="account-search">Search name or email</label>
              <input
                id="account-search"
                value={accountSearchInput}
                onChange={(event) => setAccountSearchInput(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="account-role-filter">Role</label>
              <select
                id="account-role-filter"
                value={accountRole}
                onChange={(event) => {
                  setAccountsPage(1);
                  setAccountRole(event.target.value as typeof accountRole);
                }}
              >
                <option value="ALL">All accounts</option>
                <option value="BRAND">Brands</option>
                <option value="INFLUENCER">Creators</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="account-status-filter">Status</label>
              <select
                id="account-status-filter"
                value={accountStatusFilter}
                onChange={(event) => {
                  setAccountsPage(1);
                  setAccountStatusFilter(event.target.value as typeof accountStatusFilter);
                }}
              >
                <option value="ALL">All statuses</option>
                {Object.entries(ACCOUNT_STATUS_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-outline" type="submit">Search</button>
          </form>

          {accountsLoading && <p className="muted" role="status">Loading accounts…</p>}
          {!accountsLoading && accounts.length === 0 && (
            <p className="muted">No accounts match these filters.</p>
          )}
          {accounts.map((account) => {
            const status = account.accountStatus ?? "ACTIVE";
            const pendingAction = pendingAccountAction?.accountId === account._id
              ? pendingAccountAction.action
              : null;
            return (
              <article key={account._id} className="card stack">
                <div>
                  <h3>{account.name}</h3>
                  <p className="muted small">{account.email}</p>
                  <p className="muted small">
                    {account.role === "INFLUENCER" ? "Creator" : "Brand"} · {ACCOUNT_STATUS_LABELS[status]}
                  </p>
                </div>
                <div className="btn-row">
                  {status === "ACTIVE" && (
                    <>
                      <button
                        className="btn btn-outline"
                        disabled={accountBusyId === account._id}
                        onClick={() => setPendingAccountAction({ accountId: account._id, action: "SUSPEND" })}
                      >
                        Suspend
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={accountBusyId === account._id}
                        onClick={() => setPendingAccountAction({ accountId: account._id, action: "REMOVE" })}
                      >
                        Soft remove
                      </button>
                    </>
                  )}
                  {status === "SUSPENDED" && (
                    <>
                      <button
                        className="btn btn-outline"
                        disabled={accountBusyId === account._id}
                        onClick={() => setPendingAccountAction({ accountId: account._id, action: "REMOVE" })}
                      >
                        Soft remove
                      </button>
                      <button
                        className="btn btn-outline"
                        disabled={accountBusyId === account._id}
                        onClick={() => setPendingAccountAction({ accountId: account._id, action: "RESTORE" })}
                      >
                        Restore
                      </button>
                    </>
                  )}
                  {status === "REMOVED" && (
                    <button
                      className="btn btn-outline"
                      disabled={accountBusyId === account._id}
                      onClick={() => setPendingAccountAction({ accountId: account._id, action: "RESTORE" })}
                    >
                      Restore
                    </button>
                  )}
                  <button className="btn btn-outline" onClick={() => void toggleAccountAudit(account._id)}>
                    {accountAudit[account._id] ? "Hide account history" : "View account history"}
                  </button>
                </div>
                {pendingAction && (
                  <div className="stack">
                    <p className="muted small">
                      {pendingAction === "REMOVE"
                        ? "Soft removal blocks login and discovery. Existing deal, payment, chat and audit records are retained. You can restore the account later."
                        : pendingAction === "SUSPEND"
                          ? "Suspension blocks login and discovery. You can restore the account later."
                          : "Restoring the account allows the person to log in and appear in discovery again."}
                    </p>
                    <div className="field">
                      <label htmlFor={`account-reason-${account._id}`}>Reason (minimum 10 characters)</label>
                      <textarea
                        id={`account-reason-${account._id}`}
                        value={accountReasons[account._id] ?? ""}
                        onChange={(event) => setAccountReasons((current) => ({
                          ...current,
                          [account._id]: event.target.value,
                        }))}
                        maxLength={1000}
                        rows={2}
                      />
                    </div>
                    <div className="btn-row">
                      <button
                        className="btn btn-primary"
                        disabled={accountBusyId === account._id || (accountReasons[account._id]?.trim().length ?? 0) < 10}
                        onClick={() => void changeAccountStatus(account, pendingAction)}
                      >
                        {accountBusyId === account._id ? "Saving…" : `Confirm ${pendingAction.toLowerCase()}`}
                      </button>
                      <button
                        className="btn btn-text"
                        disabled={accountBusyId === account._id}
                        onClick={() => setPendingAccountAction(null)}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
                {accountAudit[account._id] && (
                  <ol className="plain-list">
                    {accountAudit[account._id]!.map((event) => (
                      <li key={event._id} className="muted small">
                        {formatDate(event.createdAt)} · {ACCOUNT_ACTION_LABELS[event.action]} by {event.actor?.name ?? "Admin"}: {event.reason}
                        {` (${ACCOUNT_STATUS_LABELS[event.previousStatus]} → ${ACCOUNT_STATUS_LABELS[event.nextStatus]})`}
                      </li>
                    ))}
                  </ol>
                )}
              </article>
            );
          })}
          {accountsTotal > 20 && (
            <div className="btn-row">
              <button
                className="btn btn-outline"
                disabled={accountsLoading || accountsPage <= 1}
                onClick={() => setAccountsPage((page) => Math.max(1, page - 1))}
              >
                Previous accounts
              </button>
              <span className="muted small">
                Page {accountsPage} of {Math.ceil(accountsTotal / 20)}
              </span>
              <button
                className="btn btn-outline"
                disabled={accountsLoading || accountsPage >= Math.ceil(accountsTotal / 20)}
                onClick={() => setAccountsPage((page) => page + 1)}
              >
                More accounts
              </button>
            </div>
          )}
        </section>

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
