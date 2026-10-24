import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

export interface NotificationItem {
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
  actorRole: "ADMIN" | "BRAND" | "INFLUENCER";
}

interface NotificationContextValue {
  items: NotificationItem[];
  unreadCount: number;
  error: string;
  refresh: () => Promise<void>;
  markRead: (notification: NotificationItem) => Promise<void>;
  markDealRead: (dealId: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const result = await api<NotificationListResponse>("/notifications");
      setItems(result.notifications);
      setUnreadCount(result.unreadCount);
      setError("");
    } catch {
      setError("Could not load notifications. Please try again.");
    }
  }, [user]);

  useEffect(() => {
    if (!user) {
      setItems([]);
      setUnreadCount(0);
      return;
    }
    void refresh();
    const socket = getSocket();
    const handleNewNotification = (notification: NewNotificationEvent) => {
      setItems((current) => [notification, ...current.filter((item) => item.id !== notification.id)].slice(0, 50));
      setUnreadCount((count) => count + 1);
    };
    socket.on("notification:new", handleNewNotification);
    return () => { socket.off("notification:new", handleNewNotification); };
  }, [user, refresh]);

  const markRead = useCallback(async (notification: NotificationItem) => {
    if (notification.readAt) return;
    try {
      await api(`/notifications/${notification.id}/read`, { method: "PATCH" });
      const readAt = new Date().toISOString();
      setItems((current) => current.map((item) =>
        item.id === notification.id ? { ...item, readAt } : item,
      ));
      setUnreadCount((count) => Math.max(0, count - 1));
    } catch {
      setError("Could not mark this notification as read.");
    }
  }, []);

  const markDealRead = useCallback(async (dealId: string) => {
    await api(`/notifications/deal/${dealId}/read`, { method: "PATCH" });
    await refresh();
  }, [refresh]);

  return (
    <NotificationContext.Provider value={{ items, unreadCount, error, refresh, markRead, markDealRead }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw new Error("useNotifications must be used inside <NotificationProvider>");
  return value;
}
