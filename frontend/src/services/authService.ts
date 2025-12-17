/**
 * Authentication Service
 * API calls for login, OTP verification, TOTP 2FA, etc.
 */

import { LoginResponse, OtpVerifyResponse, RecoveryLoginResponse, RefreshTokenResponse, TotpSetupResponse, TotpVerifyResponse } from "../types/auth";
import { persistentLogger } from "../utils/persistentLogger";
import api from "./api";

export const authService = {
  /**
   * Login with email and password
   * Backend now returns:
   * - requireTotp: false + accessToken (direct login, TOTP not enabled)
   * - requireTotp: true + tempToken (TOTP verification needed)
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    try {
      persistentLogger.log("authService", "login() called with:", { email });
      console.log("[authService] login() called with:", { email });
      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      persistentLogger.log("authService", "Login response received:", response.data);
      console.log("[authService] Login response received:", response.data);

      // Return the full response for the hook to handle requireTotp logic
      return response.data;
    } catch (error: any) {
      persistentLogger.error("authService", "Login error caught:", error);
      console.error("[authService] Login error caught:", error);

      // Extract proper error message from response
      const errorMessage = error.response?.data?.message || error.message || "Login failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Verify OTP
   */
  verifyOtp: async (otp: string): Promise<OtpVerifyResponse> => {
    try {
      // Attach temporary token (from login) for OTP verification
      const tempToken = localStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};

      const response = await api.post<OtpVerifyResponse>("/auth/verify-otp", { otp }, config);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "OTP verification failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Resend OTP
   */
  resendOtp: async () => {
    try {
      // Resend requires the temporary token in Authorization header
      const tempToken = localStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};

      const response = await api.post("/auth/resend-otp", {}, config);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to resend OTP";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Refresh token
   */
  refreshToken: async (): Promise<RefreshTokenResponse> => {
    try {
      const response = await api.post<RefreshTokenResponse>("/auth/refresh-token", {});
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Token refresh failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Logout
   */
  logout: async () => {
    try {
      const response = await api.post("/auth/logout", {});
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Logout failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Check if user is authenticated
   * We can't check cookies directly in JS, so we might need an endpoint or rely on 401s.
   * For now, we can check if we have a user profile or just assume true until 401.
   * Or better, we can keep a simple flag in localStorage or check a "me" endpoint.
   * Let's assume we check a profile endpoint or similar.
   * For this refactor, I'll leave it as is but note that accessToken won't be there.
   * Actually, we should probably check if we have the hospital data in state/localStorage.
   */
  isAuthenticated: (): boolean => {
    // Since we moved to cookies, we can't check accessToken existence.
    // We can check if we have hospital data which implies we are logged in.
    return !!localStorage.getItem("hospital");
  },

  /**
   * Get stored tokens
   */
  getTokens: () => ({
    accessToken: localStorage.getItem("accessToken"),
    refreshToken: localStorage.getItem("refreshToken"),
    tempToken: localStorage.getItem("tempToken"),
  }),

  /**
   * Store tokens
   */
  storeTokens: (accessToken: string, refreshToken: string) => {
    if (accessToken) localStorage.setItem("accessToken", accessToken);
    if (refreshToken) localStorage.setItem("refreshToken", refreshToken);
  },

  /**
   * Store temp token (for OTP verification)
   */
  storeTempToken: (tempToken: string) => {
    localStorage.setItem("tempToken", tempToken);
  },

  /**
   * Clear all tokens
   */
  clearTokens: () => {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("tempToken");
    localStorage.removeItem("hospital");
  },

  // ========================================
  // TOTP 2FA Methods
  // ========================================

  /**
   * Setup TOTP - Get QR code and secret
   * Requires: Access Token (must be logged in)
   */
  setupTotp: async (): Promise<TotpSetupResponse> => {
    try {
      const response = await api.post<TotpSetupResponse>("/auth/2fa/setup", {});
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to setup 2FA";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Verify TOTP setup - Enable 2FA with first code
   * Returns backup codes on success
   */
  verifyTotpSetup: async (token: string): Promise<TotpVerifyResponse> => {
    try {
      const response = await api.post<TotpVerifyResponse>("/auth/2fa/verify", { token });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to verify TOTP";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Verify TOTP for login
   * Requires: Temp Token
   */
  verifyTotpLogin: async (token: string): Promise<OtpVerifyResponse> => {
    try {
      const tempToken = localStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<OtpVerifyResponse>("/auth/login/totp", { token }, config);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "TOTP verification failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Recovery login with backup code
   */
  recoveryLogin: async (code: string): Promise<RecoveryLoginResponse> => {
    try {
      const tempToken = localStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<RecoveryLoginResponse>("/auth/login/recovery", { code }, config);
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Recovery login failed";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Disable TOTP 2FA
   * Requires: Valid TOTP code
   */
  disableTotp: async (token: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await api.post<{ success: boolean; message: string }>("/auth/2fa/disable", { token });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to disable 2FA";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Reset TOTP 2FA with Password (Initiate Rotation)
   * Requires: Password
   * Returns: QR Code for new secret
   */
  resetTotp: async (password: string): Promise<any> => {
    try {
      const response = await api.post("/auth/2fa/reset", { password });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to reset 2FA";
      const errorObj = new Error(errorMessage);
      (errorObj as any).response = error.response?.data;
      throw errorObj;
    }
  },

  /**
   * Verify TOTP Rotation
   * Requires: New TOTP Code
   */
  verifyTotpReset: async (token: string): Promise<any> => {
    try {
      const response = await api.post("/auth/2fa/reset/verify", { token });
      return response.data;
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || "Failed to verify rotation";
      throw new Error(errorMessage);
    }
  },
};

export default authService;
