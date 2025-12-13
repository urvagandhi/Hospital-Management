/**
 * Authentication Service
 * API calls for login, OTP verification, etc.
 */

import { LoginResponse, OtpVerifyResponse, RefreshTokenResponse } from "../types/auth";
import { persistentLogger } from "../utils/persistentLogger";
import api from "./api";

export const authService = {
  /**
   * Login with email and password
   */
  login: async (email: string, password: string): Promise<LoginResponse> => {
    try {
      persistentLogger.log("authService", "login() called with:", { email });
      persistentLogger.log("authService", "About to POST to /auth/login");
      console.log("[authService] login() called with:", { email });
      console.log("[authService] About to POST to /auth/login");
      const response = await api.post<LoginResponse>("/auth/login", {
        email,
        password,
      });
      persistentLogger.log("authService", "Login response received:", response.data);
      console.log("[authService] Login response received:", response.data);
      return response.data;
    } catch (error: any) {
      persistentLogger.error("authService", "Login error caught:", error);
      console.error("[authService] Login error caught:", error);
      console.error("[authService] Error response:", error.response?.data);
      console.error("[authService] Error message:", error.message);

      // Extract proper error message from response
      const errorMessage = error.response?.data?.message || error.message || "Login failed";
      persistentLogger.error("authService", "Throwing error with message:", errorMessage);

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
};

export default authService;
