/**
 * Main App Component
 * Entry point for the React application
 */

import React from "react";
import "./globals.css";
import { BrowserRouter as Router } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes";
import { AuthProvider } from "./hooks/useAuth";
import { DownloadProvider } from "./hooks/useDownload";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NetworkStatusProvider } from "./components/NetworkStatus";

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <NetworkStatusProvider>
        <AuthProvider>
          <DownloadProvider>
            <Router>
              <AppRoutes />
            </Router>
          </DownloadProvider>
        </AuthProvider>
      </NetworkStatusProvider>
    </ErrorBoundary>
  );
};

export default App;
