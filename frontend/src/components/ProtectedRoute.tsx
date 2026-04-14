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
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin">
          <svg className="w-12 h-12 text-blue-600" fill="none" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25" />
            <path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
        </div>
      </div>
    );
  }

  if (isAuthenticated) return <>{children}</>;

  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
