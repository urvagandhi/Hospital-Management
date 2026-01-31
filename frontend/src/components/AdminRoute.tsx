/**
 * Admin Route Component
 * Protects routes that only admins can access
 */

import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

interface AdminRouteProps {
  children: React.ReactNode;
}

export const AdminRoute: React.FC<AdminRouteProps> = ({ children }) => {
  const { state } = useAuth();

  // Check if user is authenticated
  if (!state.isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  // Check if user is admin
  const isAdmin = state.hospital?.email === "admin@citymedical.com";

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

export default AdminRoute;
