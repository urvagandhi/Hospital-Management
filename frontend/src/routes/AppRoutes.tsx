import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Login from "../pages/Login";
import OtpVerification from "../pages/OtpVerification";
import Dashboard from "../pages/Dashboard";
import ProtectedRoute from "../components/ProtectedRoute";
import { MainLayout } from "../layouts/MainLayout";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<OtpVerification />} />

      {/* Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {/* Add other protected routes here */}
      </Route>

      {/* Catch all - redirect to dashboard (which will redirect to login if needed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
export default AppRoutes;
