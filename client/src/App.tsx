import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import BrandDashboard from "./pages/BrandDashboard";
import InfluencerDashboard from "./pages/InfluencerDashboard";
import InfluencerProfile from "./pages/InfluencerProfile";
import InfluencerPricing from "./pages/InfluencerPricing";
import BrowseInfluencers from "./pages/BrowseInfluencers";
import InfluencerDetail from "./pages/InfluencerDetail";

// "/" sends people to the right place
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;
  if (!user) return <Navigate to="/login" replace />;
  return (
    <Navigate to={user.role === "BRAND" ? "/brand" : "/influencer"} replace />
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route
        path="/brand"
        element={
          <ProtectedRoute role="BRAND">
            <BrandDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/influencer"
        element={
          <ProtectedRoute role="INFLUENCER">
            <InfluencerDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/influencer/profile"
        element={
          <ProtectedRoute role="INFLUENCER">
            <InfluencerProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/influencer/pricing"
        element={
          <ProtectedRoute role="INFLUENCER">
            <InfluencerPricing />
          </ProtectedRoute>
        }
      />
      <Route
        path="/brand/influencers"
        element={
          <ProtectedRoute role="BRAND">
            <BrowseInfluencers />
          </ProtectedRoute>
        }
      />
      <Route
        path="/brand/influencers/:id"
        element={
          <ProtectedRoute role="BRAND">
            <InfluencerDetail />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
