/**
 * Auth Context & Hook
 * Manages authentication state globally
 */

import React, { createContext, useContext, useState, useEffect } from "react";
import { Hospital, AuthState } from "../types/auth";
import authService from "../services/authService";

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
      console.log("[useAuth] tempToken:", localStorage.getItem("tempToken"));
      console.log("[useAuth] hospital:", localStorage.getItem("hospital"));

      try {
        // If we have a tempToken, user is in OTP verification phase
        // Don't try to refresh - they haven't completed auth yet
        const tempToken = localStorage.getItem("tempToken");
        if (tempToken) {
          console.log("[useAuth] TempToken found, user in OTP phase - setting isAuthenticated=false");
          setState((prev) => ({
            ...prev,
            isAuthenticated: false,
            loading: false,
          }));
          return;
        }

        console.log("[useAuth] No tempToken, calling refreshToken()...");
        // Always try to refresh token to check if session is valid
        // The token is in the cookie, so this will work even if localStorage is cleared
        const response = await authService.refreshToken();
        console.log("[useAuth] refreshToken() succeeded, response:", response.data);

        // Get hospital data from localStorage if available, otherwise from response
        const hospitalData = localStorage.getItem("hospital");
        const hospital = hospitalData ? JSON.parse(hospitalData) : response.data.hospital;

        // If we got hospital from response but not in localStorage, save it
        if (!hospitalData && response.data.hospital) {
          localStorage.setItem("hospital", JSON.stringify(response.data.hospital));
        }

        console.log("[useAuth] Setting isAuthenticated=true");
        setState((prev) => ({
          ...prev,
          accessToken: response.data.accessToken,
          hospital: hospital,
          isAuthenticated: true,
          loading: false,
        }));
      } catch (error) {
        console.log("[useAuth] refreshToken() failed:", error);
        // If refresh fails, we are not authenticated
        // Clear any stale data
        localStorage.removeItem("hospital");
        localStorage.removeItem("tempToken");

        console.log("[useAuth] Setting isAuthenticated=false, clearing localStorage");
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
      // Tokens are in cookies now, so we don't store them in localStorage
      // authService.storeTokens(response.data.accessToken, response.data.refreshToken);
      localStorage.setItem("hospital", JSON.stringify(response.data.hospital));

      // CRITICAL: Remove tempToken so it doesn't interfere with cookie-based auth
      localStorage.removeItem("tempToken");

      setState((prev) => ({
        ...prev,
        // accessToken: response.data.accessToken, // Not returned in body anymore
        // refreshToken: response.data.refreshToken, // Not returned in body anymore
        hospital: response.data.hospital,
        isAuthenticated: true,
        tempToken: null,
        loading: false,
      }));
    } catch (error: any) {
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
