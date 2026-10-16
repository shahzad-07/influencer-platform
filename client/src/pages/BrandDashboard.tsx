import { Link, useNavigate } from "react-router-dom";
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
      <p>
        <Link to="/brand/profile">Edit my brand profile</Link>
      </p>
      <p>
        <Link to="/brand/influencers">Find influencers</Link>
      </p>
      <p>
        <Link to="/deals">My deals</Link>
      </p>
      <p>
        <Link to="/messages">Messages</Link>
      </p>
      <button onClick={handleLogout}>Log out</button>
    </div>
  );
}
