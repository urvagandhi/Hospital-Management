/**
 * Authentication Service
 * API calls for login, OTP verification, TOTP 2FA, etc.
 */

import { LoginResponse, OtpVerifyResponse, RecoveryLoginResponse, RefreshTokenResponse, TotpSetupResponse, TotpVerifyResponse } from "../types/auth";
import api from "./api";

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "response" in error) {
    const resp = (error as { response?: { data?: { message?: string } } }).response;
    return resp?.data?.message || fallback;
  }
  return fallback;
}

function toApiError(error: unknown, fallback: string): Error {
  const message = extractErrorMessage(error, fallback);
  const err = new Error(message);
  if (typeof error === "object" && error !== null && "response" in error) {
    (err as any).response = (error as any).response?.data;
  }
  return err;
}

export const authService = {
  login: async (identifier: string, password: string): Promise<LoginResponse> => {
    try {
      // Send both `identifier` (new) and `email` (legacy compat) so backend works either way
      const response = await api.post<LoginResponse>("/auth/login", { identifier, email: identifier, password });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Login failed");
    }
  },

  verifyOtp: async (otp: string): Promise<OtpVerifyResponse> => {
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<OtpVerifyResponse>("/auth/verify-otp", { otp }, config);
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "OTP verification failed");
    }
  },

  resendOtp: async () => {
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post("/auth/resend-otp", {}, config);
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to resend OTP");
    }
  },

  refreshToken: async (): Promise<RefreshTokenResponse> => {
    try {
      const response = await api.post<RefreshTokenResponse>("/auth/refresh-token", {});
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Token refresh failed");
    }
  },

  logout: async () => {
    try {
      const response = await api.post("/auth/logout", {});
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Logout failed");
    }
  },

  isAuthenticated: (): boolean => {
    return !!localStorage.getItem("hospital");
  },

  getTokens: () => ({
    accessToken: null, // Managed via httpOnly cookies
    refreshToken: null,
    tempToken: sessionStorage.getItem("tempToken"),
  }),

  storeTokens: (accessToken: string, _refreshToken: string) => {
    // Store in sessionStorage (cleared on browser close, not accessible to XSS across tabs)
    if (accessToken) sessionStorage.setItem("accessToken", accessToken);
    sessionStorage.removeItem("tempToken");
  },

  storeTempToken: (tempToken: string) => {
    sessionStorage.setItem("tempToken", tempToken);
  },

  clearTokens: () => {
    sessionStorage.removeItem("accessToken");
    sessionStorage.removeItem("tempToken");
    localStorage.removeItem("hospital");
  },

  // ========================================
  // TOTP 2FA Methods
  // ========================================

  setupTotp: async (): Promise<TotpSetupResponse> => {
    try {
      const response = await api.post<TotpSetupResponse>("/auth/2fa/setup", {});
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to setup 2FA");
    }
  },

  verifyTotpSetup: async (token: string): Promise<TotpVerifyResponse> => {
    try {
      const response = await api.post<TotpVerifyResponse>("/auth/2fa/verify", { token });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to verify TOTP");
    }
  },

  verifyTotpLogin: async (token: string): Promise<OtpVerifyResponse> => {
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<OtpVerifyResponse>("/auth/login/totp", { token }, config);
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "TOTP verification failed");
    }
  },

  recoveryLogin: async (code: string): Promise<RecoveryLoginResponse> => {
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<RecoveryLoginResponse>("/auth/login/recovery", { code }, config);
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Recovery login failed");
    }
  },

  disableTotp: async (token: string): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await api.post<{ success: boolean; message: string }>("/auth/2fa/disable", { token });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to disable 2FA");
    }
  },

  resetTotp: async (password: string) => {
    try {
      const response = await api.post("/auth/2fa/reset", { password });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to reset 2FA");
    }
  },

  verifyTotpReset: async (token: string) => {
    try {
      const response = await api.post("/auth/2fa/reset/verify", { token });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Failed to verify rotation");
    }
  },
};

export default authService;
