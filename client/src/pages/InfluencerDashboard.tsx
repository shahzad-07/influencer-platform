import { useNavigate } from "react-router-dom";
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
      <p>Soon: your profile, portfolio, pricing, and deals.</p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
