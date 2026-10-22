import { Link } from "react-router-dom";
import { api } from "../lib/api";
import type { NotificationItem } from "../context/NotificationContext";
import { useNotifications } from "../context/NotificationContext";
import { useAuth } from "../context/AuthContext";

const actionText: Record<string, string> = {
  accept: "accepted the offer", decline: "declined the offer", cancel: "cancelled the offer",
  markAdvanceSent: "marked the advance as sent", confirmAdvance: "confirmed the advance",
  rejectAdvance: "reported an advance payment issue", submitDraft: "submitted a draft",
  requestChanges: "requested draft changes", approveDraft: "approved the draft",
  submitLink: "submitted the live post link", rejectLink: "reported an issue with the post link",
  verifyLink: "verified the live post", markFinalSent: "marked the final payment as sent",
  confirmFinal: "confirmed the final payment", rejectFinal: "reported a final payment issue",
  dispute: "raised a dispute", campaignNew: "posted a campaign that may fit your profile",
  campaignInterest: "is interested in your campaign",
};

export default function NotificationFeed({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useAuth();
  const { items, unreadCount, error, markRead, refresh } = useNotifications();

  async function confirmPayment(notification: NotificationItem) {
    if (!notification.dealId) return;
    const advance = notification.action === "markAdvanceSent";
    const paymentName = advance ? "advance" : "final payment";
    if (!window.confirm(`Confirm that you received the ${paymentName}?`)) return;
    try {
      await api(`/deals/${notification.dealId}/actions`, {
        method: "POST", body: JSON.stringify({ action: advance ? "confirmAdvance" : "confirmFinal" }),
      });
      await markRead(notification);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Could not confirm the payment.");
    }
  }

  return (
    <>
      <div className="notification-heading">
        <strong>Notifications</strong><span className="muted small">{unreadCount} unread</span>
      </div>
      {error && <p className="alert" role="alert">{error}</p>}
      {items.length === 0 ? <p className="muted notification-empty">You’re all caught up.</p> : (
        <ul className="notification-list">
          {items.map((notification) => {
            const canConfirm = user?.role === "INFLUENCER" &&
              ["markAdvanceSent", "markFinalSent"].includes(notification.action);
            const to = notification.campaignId ? `/campaigns/${notification.campaignId}` : `/deals/${notification.dealId}`;
            const content = <><strong>{notification.dealTitle || "Deal update"}</strong>
              <span>{actionText[notification.action] ?? "has an update"}</span>
              <time dateTime={notification.createdAt}>{new Date(notification.createdAt).toLocaleString()}</time></>;
            return <li className={notification.readAt ? "notification-item" : "notification-item unread"} key={notification.id}>
              {notification.dealId || notification.campaignId
                ? <Link className="notification-link" to={to} onClick={() => { void markRead(notification); onNavigate?.(); }}>{content}</Link>
                : <div className="notification-link">{content}</div>}
              {canConfirm && <button className="btn btn-primary btn-sm notification-confirm" type="button" onClick={() => void confirmPayment(notification)}>Yes, received</button>}
            </li>;
          })}
        </ul>
      )}
    </>
  );
}
