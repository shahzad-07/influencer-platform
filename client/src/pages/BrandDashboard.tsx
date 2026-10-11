import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function BrandDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div style={{ maxWidth: 800, margin: "40px auto", padding: 16 }}>
      <h1>Brand Dashboard</h1>
      <p>Welcome, {user?.name}!</p>
      <p>Soon: browse influencers, chat, and manage your deals.</p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
