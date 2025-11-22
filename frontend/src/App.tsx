/**
 * Main App Component
 * Entry point for the React application
 */

import React from "react";
import "./globals.css";
import { BrowserRouter as Router } from "react-router-dom";
import { AppRoutes } from "./routes/AppRoutes";
import { AuthProvider } from "./hooks/useAuth";

const App: React.FC = () => {
  return (
    <AuthProvider>
      <Router>
        <AppRoutes />
      </Router>
    </AuthProvider>
  );
};

export default App;
