import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "../context/AuthContext";
import type { Role } from "../context/AuthContext";

export default function ProtectedRoute({
  role,
  children,
}: {
  role: Role;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();

  // Still checking the saved token with the server
  if (loading) return <p style={{ padding: 16 }}>Loading...</p>;

  // Not logged in
  if (!user) return <Navigate to="/login" replace />;

  // Logged in, but wrong role: send them to their own dashboard
  if (user.role !== role) {
    return (
      <Navigate to={user.role === "BRAND" ? "/brand" : "/influencer"} replace />
    );
  }

  return <>{children}</>;
}
