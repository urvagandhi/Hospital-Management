import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import { MainLayout } from "../layouts/MainLayout";
import ChangePassword from "../pages/ChangePassword";
import Dashboard from "../pages/Dashboard";
import FolderView from "../pages/FolderView";
import ForgotPassword from "../pages/ForgotPassword";
import HospitalRegistration from "../pages/HospitalRegistration";
import HospitalsList from "../pages/HospitalsList";
import LandingPage from "../pages/LandingPage";
import Login from "../pages/Login";
import PatientDetails from "../pages/PatientDetails";
import Profile from "../pages/Profile";
import SecuritySettings from "../pages/SecuritySettings";
import VerifyAuthCode from "../pages/VerifyAuthCode";
import ActivityLog from "../pages/ActivityLog";

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
          </AdminRoute>
        }
      />

      {/* Auth Code verification (step 2 of login) */}
      <Route path="/verify-auth-code" element={<VerifyAuthCode />} />

      {/* Password change (first-login) — uses tempToken */}
      <Route path="/change-password" element={<ChangePassword />} />

      {/* Forgot password flow (public, 3-step single route) */}
      <Route path="/forgot-password" element={<ForgotPassword />} />

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
        <Route
          path="/activity"
          element={
            <AdminRoute>
              <ActivityLog />
            </AdminRoute>
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="/patients/:patientId" element={<PatientDetails />} />
        <Route path="/patients/:patientId/folders/:folderName" element={<FolderView />} />
      </Route>

      {/* Catch all — redirect to dashboard (which redirects to login if needed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
export default AppRoutes;
