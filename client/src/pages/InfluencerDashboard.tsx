import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

export default function InfluencerDashboard() {
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
            <Link to="/deals">
              My deals
              <small>Offers, drafts and payments</small>
            </Link>
          </li>
          <li>
            <Link to="/messages">
              Messages
              <small>Chat with brands</small>
            </Link>
          </li>
          <li>
            <Link to="/influencer/brands">
              Find brands
              <small>Browse brands and message them first</small>
            </Link>
          </li>
          <li>
            <Link to="/influencer/profile">
              My profile
              <small>Your niches, languages and past work</small>
            </Link>
          </li>
          <li>
            <Link to="/influencer/pricing">
              My rates
              <small>Only brands can see these</small>
            </Link>
          </li>
          <li>
            <Link to="/influencer/payment-details">
              Payment details
              <small>Saved safely; brands can view them when payment is due</small>
            </Link>
          </li>
        </ul>
      </div>
    </AppLayout>
  );
}
