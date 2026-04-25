/**
 * Protected Route Component
 * Ensures the user is authenticated before rendering protected pages.
 *
 * If the user is mid-login (has a tempToken in sessionStorage), we route
 * them to the correct next-step screen based on the token's purpose.
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import Spinner from "./Spinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const getTempTokenPurpose = (token: string | null): string | null => {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = JSON.parse(window.atob(b64));
    return json.purpose || null;
  } catch {
    return null;
  }
};

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, state } = useAuth();

  const tempToken = sessionStorage.getItem("tempToken");
  if (tempToken && !isAuthenticated) {
    const purpose = getTempTokenPurpose(tempToken);
    if (purpose === "PASSWORD_CHANGE") {
      return <Navigate to="/change-password" replace />;
    }
    // Default: AUTH_CODE (or unknown) → send to the auth-code screen
    return <Navigate to="/verify-auth-code" replace />;
  }

  if (state.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-surface-bg">
        <Spinner variant="heartbeat" size="lg" className="text-primary-600" />
      </div>
    );
  }

  if (isAuthenticated) return <>{children}</>;

  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
