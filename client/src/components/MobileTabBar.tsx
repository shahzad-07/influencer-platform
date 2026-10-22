import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import { useChatUnread } from "../context/ChatUnreadContext";
import { useNotifications } from "../context/NotificationContext";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export default function MobileTabBar() {
  const { user } = useAuth();
  const chatUnread = useChatUnread();
  const { unreadCount } = useNotifications();
  if (!user) return null;

  const isBrand = user.role === "BRAND";
  const homePath = isBrand ? "/brand" : "/influencer";
  const findPath = isBrand ? "/brand/influencers" : "/influencer/brands";
  const profilePath = isBrand ? "/brand/profile" : "/influencer/profile";

  return (
    <nav className="tabbar" aria-label="Main">
      <NavLink to={homePath} end>
        <Icon>
          <path d="M3 11l9-8 9 8" />
          <path d="M5 10v10h14V10" />
        </Icon>
        Home
      </NavLink>
      <NavLink to={findPath}>
        <Icon>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </Icon>
        Find
      </NavLink>
      <NavLink to="/deals">
        <Icon>
          <rect x="4" y="3" width="16" height="18" rx="3" />
          <path d="M8.5 12.5l2.5 2.5 4.5-5" />
        </Icon>
        Deals
      </NavLink>
      <NavLink to="/messages">
        <Icon>
          <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        </Icon>
        <span className="chat-tab-label">
          Chat
          {chatUnread > 0 && (
            <span
              className="chat-nav-count"
              aria-label={`${chatUnread} unread chat messages`}
            >
              {chatUnread > 99 ? "99+" : chatUnread}
            </span>
          )}
        </span>
      </NavLink>
      <NavLink to="/notifications" className="notification-tab">
        <span className="notification-tab-icon">
          <Icon><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></Icon>
          {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? "99+" : unreadCount}</span>}
        </span>
        Alerts
      </NavLink>
      <NavLink to={profilePath}>
        <Icon>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c1.2-4 4.2-6 8-6s6.8 2 8 6" />
        </Icon>
        Profile
      </NavLink>
    </nav>
  );
}
