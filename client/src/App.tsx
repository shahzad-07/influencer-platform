import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Terms from "./pages/Terms";
import BrandDashboard from "./pages/BrandDashboard";
import InfluencerDashboard from "./pages/InfluencerDashboard";
import InfluencerProfile from "./pages/InfluencerProfile";
import InfluencerPricing from "./pages/InfluencerPricing";
import BrowseInfluencers from "./pages/BrowseInfluencers";
import InfluencerDetail from "./pages/InfluencerDetail";
import Messages from "./pages/Messages";
import BrandProfile from "./pages/BrandProfile";
import BrowseBrands from "./pages/BrowseBrands";
import BrandDetail from "./pages/BrandDetail";
import PaymentDetails from "./pages/PaymentDetails";
import CreateOffer from "./pages/CreateOffer";
import Deals from "./pages/Deals";
import DealDetail from "./pages/DealDetail";
import Schedule from "./pages/Schedule";

// "/" shows the public home page to visitors and sends logged-in people to their dashboard
function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p className="page muted">Loading...</p>;
  if (!user) return <Landing />;
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
      {/* Public: anyone can read the terms, no login needed */}
      <Route path="/terms" element={<Terms />} />
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
        path="/influencer/payment-details"
        element={
          <ProtectedRoute role="INFLUENCER">
            <PaymentDetails />
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
      <Route
        path="/messages"
        element={
          <ProtectedRoute role={["BRAND", "INFLUENCER"]}>
            <Messages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/messages/:conversationId"
        element={
          <ProtectedRoute role={["BRAND", "INFLUENCER"]}>
            <Messages />
          </ProtectedRoute>
        }
      />
      <Route
        path="/brand/profile"
        element={
          <ProtectedRoute role="BRAND">
            <BrandProfile />
          </ProtectedRoute>
        }
      />
      <Route
        path="/influencer/brands"
        element={
          <ProtectedRoute role="INFLUENCER">
            <BrowseBrands />
          </ProtectedRoute>
        }
      />
      <Route
        path="/influencer/brands/:id"
        element={
          <ProtectedRoute role="INFLUENCER">
            <BrandDetail />
          </ProtectedRoute>
        }
      />
      <Route
        path="/brand/offers/new/:influencerId"
        element={
          <ProtectedRoute role="BRAND">
            <CreateOffer />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deals"
        element={
          <ProtectedRoute role={["BRAND", "INFLUENCER"]}>
            <Deals />
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute role={["BRAND", "INFLUENCER"]}>
            <Schedule />
          </ProtectedRoute>
        }
      />
      <Route
        path="/deals/:id"
        element={
          <ProtectedRoute role={["BRAND", "INFLUENCER"]}>
            <DealDetail />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
