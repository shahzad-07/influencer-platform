import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function InfluencerDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Influencer Dashboard</h1>
      <p>Welcome, {user?.name}!</p>
      <p>
        <Link to="/influencer/profile">Edit my profile</Link>
      </p>
      <p>
        <Link to="/influencer/pricing">Manage my pricing</Link>
      </p>
      <p>
        <Link to="/influencer/payment-details">Payment details</Link>
      </p>
      <p>
        <Link to="/deals">My deals</Link>
      </p>
      <p>
        <Link to="/influencer/brands">Find brands</Link>
      </p>
      <p>
        <Link to="/messages">Messages</Link>
      </p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
