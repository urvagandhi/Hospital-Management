import React, { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import AdminRoute from "../components/AdminRoute";
import ProtectedRoute from "../components/ProtectedRoute";
import Spinner from "../components/Spinner";
import { MainLayout } from "../layouts/MainLayout";
import ActivityLog from "../pages/ActivityLog";
import ChangePassword from "../pages/ChangePassword";
import Dashboard from "../pages/Dashboard";
import FolderView from "../pages/FolderView";
import ForgotPassword from "../pages/ForgotPassword";
import HospitalRegistration from "../pages/HospitalRegistration";
import HospitalsList from "../pages/HospitalsList";
import LandingPage from "../pages/LandingPage";
import Login from "../pages/Login";
import NotFound from "../pages/NotFound";
import NotificationSettings from "../pages/NotificationSettings";
import Password from "../pages/Password";
import PatientDetails from "../pages/PatientDetails";
import Privacy from "../pages/Privacy";
import Profile from "../pages/Profile";
import Sessions from "../pages/Sessions";
import Terms from "../pages/Terms";
import VerifyAuthCode from "../pages/VerifyAuthCode";

// Design-system preview pages are public, rarely visited, and pull in heavy
// deps (recharts + lucide-react via ComponentsPreview). Code-split them so
// they never land in the main bundle.
const ComponentsPreview = lazy(() => import("../pages/ComponentsPreview"));
const LoadingSpinners = lazy(() => import("../pages/LoadingSpinners"));

const PreviewFallback: React.FC = () => (
  <div className="min-h-screen flex items-center justify-center bg-surface-bg">
    <Spinner />
  </div>
);

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

      {/* HMS Design System showcase — public, no auth needed. Lazy. */}
      <Route
        path="/components-preview"
        element={
          <Suspense fallback={<PreviewFallback />}>
            <ComponentsPreview />
          </Suspense>
        }
      />

      {/* Loading spinner gallery — design preview. Lazy. */}
      <Route
        path="/spinners-preview"
        element={
          <Suspense fallback={<PreviewFallback />}>
            <LoadingSpinners />
          </Suspense>
        }
      />

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
