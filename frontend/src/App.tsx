/**
 * Main App Component
 * Entry point for the React application
 */

import React from "react";
import "./globals.css";
import { BrowserRouter as Router } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes";
import { AuthProvider } from "./hooks/useAuth";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NetworkStatusProvider } from "./components/NetworkStatus";

const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <NetworkStatusProvider>
        <AuthProvider>
          <Router>
            <AppRoutes />
          </Router>
        </AuthProvider>
      </NetworkStatusProvider>
    </ErrorBoundary>
  );
};

export default App;
