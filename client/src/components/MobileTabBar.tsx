import { NavLink } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import NotificationBell from "./NotificationBell";
import { useChatUnread } from "../context/ChatUnreadContext";

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
      <div className="notification-tab">
        <NotificationBell />
        <span>Alerts</span>
      </div>
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
