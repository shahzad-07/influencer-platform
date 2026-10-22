import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

interface NotificationItem {
  id: string;
  dealId: string | null;
  campaignId?: string | null;
  dealTitle: string;
  action: string;
  createdAt: string;
  readAt: string | null;
}

interface NotificationListResponse {
  unreadCount: number;
  notifications: NotificationItem[];
}

interface NewNotificationEvent extends NotificationItem {
  actorRole: "BRAND" | "INFLUENCER";
}

const actionText: Record<string, string> = {
  accept: "accepted the offer",
  decline: "declined the offer",
  cancel: "cancelled the offer",
  markAdvanceSent: "marked the advance as sent",
  confirmAdvance: "confirmed the advance",
  rejectAdvance: "reported an advance payment issue",
  submitDraft: "submitted a draft",
  requestChanges: "requested draft changes",
  approveDraft: "approved the draft",
  submitLink: "submitted the live post link",
  rejectLink: "reported an issue with the post link",
  verifyLink: "verified the live post",
  markFinalSent: "marked the final payment as sent",
  confirmFinal: "confirmed the final payment",
  rejectFinal: "reported a final payment issue",
  dispute: "raised a dispute",
  campaignNew: "posted a campaign that may fit your profile",
  campaignInterest: "is interested in your campaign",
};

export default function NotificationBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const loadNotifications = useCallback(async () => {
    try {
      const result = await api<NotificationListResponse>("/notifications");
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
      setError("");
    } catch {
      setError("Could not load notifications. Please try again.");
    }
  }, []);

  useEffect(() => {
    if (!user) return;

    void loadNotifications();
    const socket = getSocket();
    const handleNewNotification = (notification: NewNotificationEvent) => {
      setItems((current) => [
        notification,
        ...current.filter((item) => item.id !== notification.id),
      ].slice(0, 50));
      setUnreadCount((count) => count + 1);
    };
    socket.on("notification:new", handleNewNotification);
    return () => {
      socket.off("notification:new", handleNewNotification);
    };
  }, [user, loadNotifications]);

  async function markRead(notification: NotificationItem) {
    if (notification.readAt) return;
    try {
      await api(`/notifications/${notification.id}/read`, { method: "PATCH" });
      setItems((current) =>
        current.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      setError("Could not mark this notification as read.");
    }
  }

  async function confirmPayment(notification: NotificationItem) {
    if (!notification.dealId) return;
    const isAdvance = notification.action === "markAdvanceSent";
    const paymentName = isAdvance ? "advance" : "final payment";
    if (!window.confirm(`Confirm that you received the ${paymentName}?`)) return;

    setBusyId(notification.id);
    setError("");
    try {
      await api(`/deals/${notification.dealId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: isAdvance ? "confirmAdvance" : "confirmFinal" }),
      });
      await markRead(notification);
      await loadNotifications();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not confirm the payment.");
    } finally {
      setBusyId(null);
    }
  }

  if (!user) return null;

  return (
    <div className="notification-menu">
      <button
        className="icon-btn notification-bell"
        type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setError("");
          if (!open) void loadNotifications();
        }}
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount}</span>}
      </button>

      {open && (
        <section className="notification-popover" aria-label="Notifications">
          <div className="notification-heading">
            <strong>Notifications</strong>
            <span className="muted small">{unreadCount} unread</span>
          </div>
          {error && <p className="alert" role="alert">{error}</p>}
          {items.length === 0 ? (
            <p className="muted notification-empty">You’re all caught up.</p>
          ) : (
            <ul className="notification-list">
              {items.map((notification) => {
                const canConfirmPayment =
                  user.role === "INFLUENCER" &&
                  (notification.action === "markAdvanceSent" ||
                    notification.action === "markFinalSent");
                return (
                  <li
                    className={notification.readAt ? "notification-item" : "notification-item unread"}
                    key={notification.id}
                  >
                    {notification.dealId || notification.campaignId ? (
                      <Link
                        className="notification-link"
                        to={notification.campaignId ? `/campaigns/${notification.campaignId}` : `/deals/${notification.dealId}`}
                        onClick={() => void markRead(notification)}
                      >
                        <strong>{notification.dealTitle}</strong>
                        <span>{actionText[notification.action] ?? "has an update"}</span>
                        <time dateTime={notification.createdAt}>
                          {new Date(notification.createdAt).toLocaleString()}
                        </time>
                      </Link>
                    ) : (
                      <div className="notification-link">
                        <strong>{notification.dealTitle || "Deal update"}</strong>
                        <span>{actionText[notification.action] ?? "has an update"}</span>
                        <time dateTime={notification.createdAt}>
                          {new Date(notification.createdAt).toLocaleString()}
                        </time>
                      </div>
                    )}
                    {canConfirmPayment && (
                      <button
                        className="btn btn-primary btn-sm notification-confirm"
                        type="button"
                        disabled={busyId === notification.id}
                        onClick={() => void confirmPayment(notification)}
                      >
                        {busyId === notification.id ? "Working..." : "Yes, received"}
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
