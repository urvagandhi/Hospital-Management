/**
 * Auth Context & Hook
 * Manages authentication state globally
 */

import React, { createContext, useContext, useEffect, useState } from "react";
import authService from "../services/authService";
import { AuthState } from "../types/auth";

interface AuthContextType {
  state: AuthState;
  login: (email: string, password: string) => Promise<boolean | "SETUP_NEEDED" | "PASSWORD_CHANGE">;
  verifyOtp: (otp: string) => Promise<void>;
  verifyTotpLogin: (token: string) => Promise<void>;
  verifyRecoveryLogin: (code: string) => Promise<any>;
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

  // Load stored data on mount
  useEffect(() => {
    const checkAuth = async () => {

      try {
        const tempToken = sessionStorage.getItem("tempToken");
        const hospitalData = localStorage.getItem("hospital");

        // 1. If in OTP phase, don't refresh
        if (tempToken) {
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        // 2. If no hospital data, we likely aren't logged in.
        // However, since we use cookies, we *could* be logged in but have cleared localStorage.
        // But to prevent loops on the login page, we can assume if no hospital data, we wait for user to log in.
        // OR: We try refresh ONCE.

        if (!hospitalData) {
          setState((prev) => ({ ...prev, isAuthenticated: false, loading: false }));
          return;
        }

        const response = await authService.refreshToken();
        const hospital = hospitalData ? JSON.parse(hospitalData) : null;


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
        // Clear stale data
        localStorage.removeItem("hospital");
        sessionStorage.removeItem("tempToken");

        setState((prev) => ({
          ...prev,
          isAuthenticated: false,
          loading: false,
        }));
      }
    };

    checkAuth();
  }, []);

  /**
   * Helper to safely store hospital data in localStorage
   * Removes large fields like base64 logo to prevent QuotaExceededError
   */
  const saveHospitalToStorage = (hospital: any) => {
    if (!hospital) return;

    const hospitalCopy = { ...hospital };
    // If logoUrl is a data URI (base64) and very long, remove it from storage
    // It will still be in memory (state.hospital) for the current session
    if (hospitalCopy.logoUrl && hospitalCopy.logoUrl.startsWith("data:") && hospitalCopy.logoUrl.length > 1000) {
      hospitalCopy.logoUrl = null;
    }

    try {
      localStorage.setItem("hospital", JSON.stringify(hospitalCopy));
    } catch (e) {
    }
  };

  /**
   * Login with email and password
   * Returns: true if login completed, false if TOTP verification needed, "SETUP_NEEDED" if mandatory setup
   */
  const login = async (email: string, password: string): Promise<boolean | "SETUP_NEEDED" | "PASSWORD_CHANGE"> => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.login(email, password);

      // Check if TOTP is required
      const requireTotp = response.requireTotp;

      // Check if password change is required first
      if ((response as any).requirePasswordChange) {
        const tempToken = response.data?.tempToken || (response as any).tempToken || "";
        if (tempToken) authService.storeTempToken(tempToken);
        setState((prev) => ({ ...prev, tempToken: tempToken, loading: false }));
        return "PASSWORD_CHANGE";
      }

      if (requireTotp === false) {
        // Check if backend requires TOTP setup
        const requireTotpSetup = response.requireTotpSetup === true;

        const responseData = response.data;
        const accessToken = responseData.accessToken || "";
        const refreshToken = responseData.refreshToken || "";
        const hospital = responseData.hospital || null;

        authService.storeTokens(accessToken, refreshToken);
        if (hospital) {
          saveHospitalToStorage(hospital);
        }

        setState((prev) => ({
          ...prev,
          accessToken: accessToken,
          refreshToken: refreshToken,
          hospital: hospital,
          isAuthenticated: true,
          tempToken: null,
          loading: false,
          error: null,
        }));

        if (requireTotpSetup) {
          return "SETUP_NEEDED";
        }

        return true; // Login complete, go to dashboard
      } else {
        // TOTP required - store temp token and proceed to TOTP verification
        const tempToken = response.data.tempToken || "";
        authService.storeTempToken(tempToken);

        setState((prev) => ({
          ...prev,
          tempToken: tempToken,
          loading: false,
          error: null,
        }));

        return false; // Need TOTP verification
      }
    } catch (error: any) {
      const errorMessage = error.message || error.response?.message || "Login failed";
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


      // Handle potential double nesting from backend (response.data.data)
      const responseData = (response.data as any).data || response.data;

      // Store tokens for Hybrid Auth (Cookies + LocalStorage)
      authService.storeTokens(responseData.accessToken, responseData.refreshToken);
      saveHospitalToStorage(responseData.hospital);

      // CRITICAL: Remove tempToken so it doesn't interfere with cookie-based auth
      sessionStorage.removeItem("tempToken");

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
      const errorMessage = error.message || error.response?.message || "OTP verification failed";
      setState((prev) => ({
        ...prev,
        error: errorMessage,
        loading: false,
      }));
      throw error;
    }
  };

  /**
   * Verify TOTP Token for Login
   */
  const verifyTotpLogin = async (token: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.verifyTotpLogin(token);

      const responseData = response.data;

      // Store tokens
      authService.storeTokens(responseData.accessToken, responseData.refreshToken);
      saveHospitalToStorage(responseData.hospital);
      sessionStorage.removeItem("tempToken");

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
      // Pass through the full error object so the component can read attemptsRemaining
      setState((prev) => ({
        ...prev,
        error: error.message || "TOTP verification failed",
        loading: false,
      }));
      throw error;
    }
  };

  /**
   * Recovery Login with Backup Code
   */
  const verifyRecoveryLogin = async (code: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await authService.recoveryLogin(code);
      const responseData = response.data;

      // Store tokens
      authService.storeTokens(responseData.accessToken, responseData.refreshToken);
      saveHospitalToStorage(responseData.hospital);
      sessionStorage.removeItem("tempToken");

      setState((prev) => ({
        ...prev,
        accessToken: responseData.accessToken,
        refreshToken: responseData.refreshToken,
        hospital: responseData.hospital,
        isAuthenticated: true,
        tempToken: null,
        loading: false,
      }));

      return responseData; // Return data for warning message
    } catch (error: any) {
      setState((prev) => ({
        ...prev,
        error: error.message || "Recovery login failed",
        loading: false,
      }));
      throw error;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } catch (error) {
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

  const refreshUser = async () => {
    try {
      const response = await authService.refreshToken();
      const responseData = (response.data as any).data || response.data;

      const hospital = responseData.hospital;

      if (hospital) {
        saveHospitalToStorage(hospital);
      }

      if (responseData.accessToken) {
        authService.storeTokens(responseData.accessToken, responseData.refreshToken);
      }

      setState((prev) => ({
        ...prev,
        accessToken: responseData.accessToken,
        refreshToken: responseData.refreshToken,
        hospital: hospital,
        isAuthenticated: true,
        loading: false,
      }));
    } catch (error) {
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        state,
        login,
        verifyOtp,
        verifyTotpLogin,
        verifyRecoveryLogin,
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
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};
