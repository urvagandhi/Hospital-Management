/**
 * Auth Context & Hook
 * Manages authentication state globally.
 *
 * The login flow is two steps:
 *   Step 1: login(identifier, password)
 *              → returns "AUTH_CODE" (show /verify-auth-code)
 *              → returns "PASSWORD_CHANGE" (show /change-password)
 *   Step 2: verifyAuthCode(code)
 *              → session issued; isAuthenticated = true
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import authService from "../services/authService";
import { AuthState } from "../types/auth";
import { useInactivityTimeout } from "./useInactivityTimeout";

type LoginNextStep = "AUTH_CODE" | "PASSWORD_CHANGE";

interface AuthContextType {
  state: AuthState;
  login: (identifier: string, password: string) => Promise<LoginNextStep>;
  verifyAuthCode: (authCode: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
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

  // ── Restore session on mount ──────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const tempToken = sessionStorage.getItem("tempToken");
        const hospitalData = localStorage.getItem("hospital");

        // Mid-flow (tempToken present) — page guards will route to the right screen.
        if (tempToken) {
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        // No saved hospital → definitely logged out.
        if (!hospitalData) {
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        // Try to refresh via httpOnly cookie.
        const response = await authService.refreshToken();
        const hospital = JSON.parse(hospitalData);

        if (response.data.accessToken) {
          authService.storeTokens(response.data.accessToken, response.data.refreshToken);
        }

        setState((prev) => ({
          ...prev,
          accessToken: response.data.accessToken,
          hospital,
          isAuthenticated: true,
          loading: false,
        }));
      } catch (_error) {
        localStorage.removeItem("hospital");
        sessionStorage.removeItem("tempToken");
        setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
      }
    };

    checkAuth();
  }, []);

  /**
   * Strip oversized base64 logos before writing to localStorage to avoid
   * QuotaExceededError; logo remains in state.hospital for the session.
   */
  const saveHospitalToStorage = (hospital: any) => {
    if (!hospital) return;
    const copy = { ...hospital };
    if (copy.logoUrl && copy.logoUrl.startsWith("data:") && copy.logoUrl.length > 1000) {
      copy.logoUrl = null;
    }
    try {
      localStorage.setItem("hospital", JSON.stringify(copy));
    } catch { /* best-effort */ }
  };

  // ── Step 1: password login ────────────────────────────────────────────────
  const login = async (identifier: string, password: string): Promise<LoginNextStep> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.login(identifier, password);

      // First-login password change path
      if (response.requirePasswordChange) {
        const tempToken = response.data.tempToken || "";
        if (tempToken) authService.storeTempToken(tempToken);
        setState((prev) => ({ ...prev, tempToken, loading: false }));
        return "PASSWORD_CHANGE";
      }

      // Normal path → auth-code screen
      const tempToken = response.data.tempToken || "";
      if (!tempToken) throw new Error("Login response missing tempToken");
      authService.storeTempToken(tempToken);
      setState((prev) => ({ ...prev, tempToken, loading: false, error: null }));
      return "AUTH_CODE";
    } catch (error: any) {
      const errorMessage = error.message || error.response?.message || "Login failed";
      setState((prev) => ({ ...prev, error: errorMessage, loading: false }));
      throw error;
    }
  };

  // ── Step 2: auth-code verification ───────────────────────────────────────
  const verifyAuthCode = async (authCode: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.verifyAuthCodeLogin(authCode);
      const data = response.data;

      authService.storeTokens(data.accessToken, data.refreshToken);
      saveHospitalToStorage(data.hospital);
      sessionStorage.removeItem("tempToken");

      setState((prev) => ({
        ...prev,
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        hospital: data.hospital,
        isAuthenticated: true,
        tempToken: null,
        loading: false,
      }));
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message || "Auth code verification failed",
        loading: false,
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch { /* ignore */ } finally {
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

  const refreshUser = async () => {
    const response = await authService.refreshToken();
    const data = (response.data as any).data || response.data;
    if (data.hospital) saveHospitalToStorage(data.hospital);
    if (data.accessToken) authService.storeTokens(data.accessToken, data.refreshToken);
    setState((prev) => ({
      ...prev,
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      hospital: data.hospital || prev.hospital,
      isAuthenticated: true,
      loading: false,
    }));
  };

  // 15-minute inactivity auto-logout
  const handleInactivityTimeout = useCallback(() => {
    if (state.isAuthenticated) logout();
  }, [state.isAuthenticated]);

  useInactivityTimeout(handleInactivityTimeout, state.isAuthenticated);

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        verifyAuthCode,
        logout,
        refreshUser,
        isAuthenticated: state.isAuthenticated,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
};
