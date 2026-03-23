import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import { MainLayout } from "../layouts/MainLayout";
import ChangePassword from "../pages/ChangePassword";
import Dashboard from "../pages/Dashboard";
import FolderView from "../pages/FolderView";
import HospitalRegistration from "../pages/HospitalRegistration";
import HospitalsList from "../pages/HospitalsList";
import LandingPage from "../pages/LandingPage";
import Login from "../pages/Login";
import PatientDetails from "../pages/PatientDetails";
import SecuritySettings from "../pages/SecuritySettings";
import TotpSetupMandatory from "../pages/TotpSetupMandatory";
import TotpVerification from "../pages/TotpVerification";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route 
        path="/register" 
        element={
          <AdminRoute>
            <HospitalRegistration />
          </AdminRoute>}
      />

      {/* TOTP Verification (for users with 2FA enabled) */}
      <Route path="/verify-totp" element={<TotpVerification />} />

      {/* Legacy SMS OTP Verification - redirects to TOTP */}
      <Route path="/verify-otp" element={<TotpVerification />} />

      {/* Mandatory TOTP Setup (after registration) */}
      <Route path="/setup-2fa" element={<TotpSetupMandatory />} />

      {/* Password change page (first-login) - public route that uses tempToken */}
      <Route path="/change-password" element={<ChangePassword />} />

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
        <Route
          path="/hospitals"
          element={
            <AdminRoute>
              <HospitalsList />
            </AdminRoute>
          }
        />
        <Route path="/security" element={<SecuritySettings />} />
        <Route path="/patients/:patientId" element={<PatientDetails />} />
        <Route path="/patients/:patientId/folders/:folderName" element={<FolderView />} />
      </Route>

      {/* Catch all - redirect to dashboard (which will redirect to login if needed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
export default AppRoutes;

