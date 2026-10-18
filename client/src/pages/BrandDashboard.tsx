import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

export default function BrandDashboard() {
  const { user } = useAuth();

  return (
    <AppLayout>
      <div className="stack">
        <div>
          <h1>Welcome, {user?.name}</h1>
          <p className="muted">What would you like to do today?</p>
        </div>

        <ul className="link-list">
          <li>
            <Link to="/brand/influencers">
              Find creators
              <small>Search by niche, city and language</small>
            </Link>
          </li>
          <li>
            <Link to="/deals">
              My deals
              <small>Track offers and payments</small>
            </Link>
          </li>
          <li>
            <Link to="/messages">
              Messages
              <small>Chat with creators</small>
            </Link>
          </li>
          <li>
            <Link to="/brand/profile">
              My brand profile
              <small>What creators see about you</small>
            </Link>
          </li>
        </ul>
      </div>
    </AppLayout>
  );
}
