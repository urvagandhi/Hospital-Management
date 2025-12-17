/**
 * Protected Route Component
 * Ensures user is authenticated before accessing protected pages
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { isAuthenticated, state } = useAuth();

  console.log("[ProtectedRoute] Rendering", { isAuthenticated, loading: state.loading });

  const tempToken = localStorage.getItem("tempToken");
  if (tempToken && !isAuthenticated) {
    console.log("[ProtectedRoute] TempToken present, redirecting to OTP");
    return <Navigate to="/verify-otp" replace />;
  }

  if (state.loading) {
    console.log("[ProtectedRoute] Loading state, showing spinner");
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

  if (isAuthenticated) {
    // Security Check: Enforce Mandatory TOTP
    // existing users or new registrations MUST have TOTP enabled
    if (state.hospital && !state.hospital.totpEnabled) {
      console.log("[ProtectedRoute] Authenticated but TOTP not enabled, redirecting to /setup-2fa");
      return <Navigate to={`/setup-2fa?email=${encodeURIComponent(state.hospital.email || "")}`} replace />;
    }

    console.log("[ProtectedRoute] Authenticated, rendering children");
    return <>{children}</>;
  }

  console.log("[ProtectedRoute] Not authenticated, redirecting to login");
  return <Navigate to="/login" replace />;
};

export default ProtectedRoute;
