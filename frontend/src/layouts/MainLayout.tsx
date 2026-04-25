import React from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { NetworkStatusBanner } from "../components/NetworkStatus";
import ErrorBoundary from "../components/ErrorBoundary";

export const MainLayout: React.FC = () => {
  const location = useLocation();
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-16">
        <NetworkStatusBanner />
        <main>
          <ErrorBoundary key={location.pathname} fullScreen={false}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
