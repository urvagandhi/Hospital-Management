import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import { MainLayout } from "../layouts/MainLayout";
import Dashboard from "../pages/Dashboard";
import HospitalRegistration from "../pages/HospitalRegistration";
import HospitalsList from "../pages/HospitalsList";
import LandingPage from "../pages/LandingPage";
import Login from "../pages/Login";
import SecuritySettings from "../pages/SecuritySettings";
import TotpSetupMandatory from "../pages/TotpSetupMandatory";
import TotpVerification from "../pages/TotpVerification";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<HospitalRegistration />} />

      {/* TOTP Verification (for users with 2FA enabled) */}
      <Route path="/verify-totp" element={<TotpVerification />} />

      {/* Legacy SMS OTP Verification - redirects to TOTP */}
      <Route path="/verify-otp" element={<TotpVerification />} />

      {/* Mandatory TOTP Setup (after registration) */}
      <Route path="/setup-2fa" element={<TotpSetupMandatory />} />

      {/* Admin Only Routes */}
      {/* <Route
        path="/hospitals"
        element={
          <AdminRoute>
            <HospitalsList />
          </AdminRoute>
        }
      /> */}

      {/* Protected Routes */}
      <Route
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/security" element={<SecuritySettings />} />

        {/* Add other protected routes here */}
      </Route>

      {/* Catch all - redirect to dashboard (which will redirect to login if needed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
export default AppRoutes;

