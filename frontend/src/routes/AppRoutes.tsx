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
import Password from "../pages/Password";
import Sessions from "../pages/Sessions";
import VerifyAuthCode from "../pages/VerifyAuthCode";
import ActivityLog from "../pages/ActivityLog";
import NotificationSettings from "../pages/NotificationSettings";
import Terms from "../pages/Terms";
import Privacy from "../pages/Privacy";
import ComponentsPreview from "../pages/ComponentsPreview";
import NotFound from "../pages/NotFound";
import LoadingSpinners from "../pages/LoadingSpinners";

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

      {/* Public legal pages — linked from registration + footers */}
      <Route path="/terms" element={<Terms />} />
      <Route path="/privacy" element={<Privacy />} />

      {/* HMS Design System showcase — public, no auth needed */}
      <Route path="/components-preview" element={<ComponentsPreview />} />

      {/* Loading spinner gallery — design preview */}
      <Route path="/spinners-preview" element={<LoadingSpinners />} />

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
        <Route path="/password" element={<Password />} />
        <Route path="/sessions" element={<Sessions />} />
        {/* Back-compat: old /security link now lands on sessions */}
        <Route path="/security" element={<Navigate to="/sessions" replace />} />
        <Route
          path="/activity"
          element={
            <AdminRoute>
              <ActivityLog />
            </AdminRoute>
          }
        />
        <Route path="/profile" element={<Profile />} />
        <Route path="/notifications" element={<NotificationSettings />} />
        <Route path="/patients/:patientId" element={<PatientDetails />} />
        <Route path="/patients/:patientId/folders/:folderName" element={<FolderView />} />
      </Route>

      {/* Catch all — render the 404 page */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
};
export default AppRoutes;
