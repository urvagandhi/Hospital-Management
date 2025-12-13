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
import OtpVerification from "../pages/OtpVerification";

export const AppRoutes: React.FC = () => {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<Login />} />
      <Route path="/verify-otp" element={<OtpVerification />} />

      {/* Admin Only Routes */}
      <Route
        path="/register"
        element={
          <AdminRoute>
            <HospitalRegistration />
          </AdminRoute>
        }
      />
      <Route
        path="/hospitals"
        element={
          <AdminRoute>
            <HospitalsList />
          </AdminRoute>
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

        {/* Add other protected routes here */}
      </Route>

      {/* Catch all - redirect to dashboard (which will redirect to login if needed) */}
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};
export default AppRoutes;
