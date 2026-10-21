import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import Logo from "./Logo";
import NotificationBell from "./NotificationBell";
import ThemeToggle from "./ThemeToggle";
import { useChatUnread } from "../context/ChatUnreadContext";

export default function SiteHeader() {
  const { user, loading, logout } = useAuth();
  const chatUnread = useChatUnread();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/");
  }

  const isBrand = user?.role === "BRAND";
  const homePath = isBrand ? "/brand" : "/influencer";
  const browsePath = isBrand ? "/brand/influencers" : "/influencer/brands";
  const profilePath = isBrand ? "/brand/profile" : "/influencer/profile";

  return (
    <header className="header">
      <div className="container header-row">
        <Logo />

        {!loading && !user && (
          <nav className="nav" aria-label="Main">
            <a href="/#how">How it works</a>
            <a href="/#who">Who it's for</a>
            <a href="/#why">Why us</a>
            <a href="/#faq">FAQ</a>
          </nav>
        )}

        {user && (
          <nav className="nav" aria-label="Main">
            <NavLink to={homePath} end>
              Home
            </NavLink>
            <NavLink to={browsePath}>
              {isBrand ? "Find creators" : "Find brands"}
            </NavLink>
            <NavLink to="/deals">Deals</NavLink>
            <NavLink to="/messages">
              Messages
              {chatUnread > 0 && (
                <span
                  className="chat-nav-count"
                  aria-label={`${chatUnread} unread chat messages`}
                >
                  {chatUnread > 99 ? "99+" : chatUnread}
                </span>
              )}
            </NavLink>
            <NavLink to={profilePath}>Profile</NavLink>
          </nav>
        )}

        <div className="header-actions">
          {user && <NotificationBell />}
          <ThemeToggle />
          {!loading && !user && (
            <>
              <Link className="btn btn-text btn-sm" to="/login">
                Log in
              </Link>
              <Link className="btn btn-primary btn-sm" to="/signup">
                Sign up
              </Link>
            </>
          )}
          {user && (
            <button
              className="btn btn-text btn-sm"
              type="button"
              onClick={handleLogout}
            >
              Log out
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
