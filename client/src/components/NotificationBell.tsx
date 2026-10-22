import { useEffect, useRef, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { useNotifications } from "../context/NotificationContext";
import NotificationFeed from "./NotificationFeed";

export default function NotificationBell() {
  const { user } = useAuth();
  const { unreadCount, refresh } = useNotifications();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  if (!user) return null;

  return (
    <div className="notification-menu" ref={menuRef}>
      <button className="icon-btn notification-bell" type="button"
        aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"}
        aria-expanded={open} onClick={() => {
          setOpen((value) => !value);
          if (!open) void refresh();
        }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
      </button>
      {open && <section className="notification-popover" aria-label="Notifications"><NotificationFeed onNavigate={() => setOpen(false)} /></section>}
    </div>
  );
}
