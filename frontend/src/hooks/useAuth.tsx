/**
 * Auth Context & Hook
 * Manages authentication state globally
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import authService from "../services/authService";
import { AuthState } from "../types/auth";

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<void>;
  verifyOtp: (otp: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({
    hospital: null,
    accessToken: null,
    refreshToken: null,
    tempToken: null,
    isAuthenticated: false,
    loading: true,
    error: null,
  });

  // Load stored data on mount
  useEffect(() => {
    const checkAuth = async () => {
      console.log("[useAuth] ===== checkAuth started =====");

      try {
        const tempToken = localStorage.getItem("tempToken");
        const hospitalData = localStorage.getItem("hospital");

        // 1. If in OTP phase, don't refresh
        if (tempToken) {
          console.log("[useAuth] TempToken found, user in OTP phase");
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        // 2. If no hospital data, we likely aren't logged in.
        // However, since we use cookies, we *could* be logged in but have cleared localStorage.
        // But to prevent loops on the login page, we can assume if no hospital data, we wait for user to log in.
        // OR: We try refresh ONCE.

        if (!hospitalData) {
          console.log("[useAuth] No hospital data found, assuming not authenticated");
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        console.log("[useAuth] Hospital data found, verifying session with refreshToken()...");
        const response = await authService.refreshToken();
        const hospital = hospitalData ? JSON.parse(hospitalData) : null;

        console.log("[useAuth] Session valid");

        // Store tokens if returned (Hybrid Auth)
        if (response.data.accessToken) {
          authService.storeTokens(response.data.accessToken, response.data.refreshToken);
        }

        setState((prev) => ({
          ...prev,
          accessToken: response.data.accessToken,
          hospital: hospital,
          isAuthenticated: true,
          loading: false,
        }));

      } catch (error) {
        console.log("[useAuth] Session check failed / No active session");
        // Clear stale data
        localStorage.removeItem("hospital");
        localStorage.removeItem("tempToken");

        setState((prev) => ({
          ...prev,
          isAuthenticated: false,
          loading: false,
        }));
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.login(email, password);
      authService.storeTempToken(response.data.tempToken);

      setState((prev) => ({
        ...prev,
        tempToken: response.data.tempToken,
        loading: false,
        error: null,
      }));
    } catch (error: any) {
      const errorMessage = error.message || error.response?.message || "Login failed";
      console.error("[useAuth] Login failed:", errorMessage);
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      throw error;
    }
  };

  const verifyOtp = async (otp: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.verifyOtp(otp);

      console.log("[useAuth] verifyOtp response:", response);

      // Handle potential double nesting from backend (response.data.data)
      const responseData = (response.data as any).data || response.data;

      if (!responseData.accessToken) {
        console.warn("[useAuth] Warning: No accessToken in response!", response);
      } else {
        console.log("[useAuth] AccessToken received, length:", responseData.accessToken.length);
      }

      // Store tokens for Hybrid Auth (Cookies + LocalStorage)
      authService.storeTokens(responseData.accessToken, responseData.refreshToken);
      localStorage.setItem("hospital", JSON.stringify(responseData.hospital));

      // CRITICAL: Remove tempToken so it doesn't interfere with cookie-based auth
      localStorage.removeItem("tempToken");

      setState((prev) => ({
        ...prev,
        accessToken: responseData.accessToken,
        refreshToken: responseData.refreshToken,
        hospital: responseData.hospital,
        isAuthenticated: true,
        tempToken: null,
        loading: false,
      }));
    } catch (error: any) {
      console.error("[useAuth] verifyOtp error:", error);
      const errorMessage = error.message || error.response?.message || "OTP verification failed";
      console.error("[useAuth] OTP verification failed:", errorMessage);
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      authService.clearTokens();
      setState({
        hospital: null,
        accessToken: null,
        refreshToken: null,
        tempToken: null,
        isAuthenticated: false,
        loading: false,
        error: null,
      });
    }
  };

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        verifyOtp,
        logout,
        isAuthenticated: state.isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
