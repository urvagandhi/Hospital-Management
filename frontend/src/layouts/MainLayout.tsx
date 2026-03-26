import React from "react";
import { Outlet } from "react-router-dom";
import { Navbar } from "../components/Navbar";
import { NetworkStatusBanner } from "../components/NetworkStatus";

export const MainLayout: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />
      <div className="pt-16">
        <NetworkStatusBanner />
        <main>
          <Outlet />
        </main>
      </div>
    </div>
  );
};
