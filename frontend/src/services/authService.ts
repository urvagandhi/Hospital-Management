/**
 * Authentication Service
 * Wraps the /api/auth endpoints used by the login + self-registration flows.
 */

import { LoginResponse, AuthCodeVerifyResponse, RefreshTokenResponse } from "../types/auth";
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
  /**
   * Step 1 of login — verify email/phone + password.
   * Returns a temp token for the next step:
   *   • requireAuthCode: true → must POST /login/verify-auth-code
   *   • requirePasswordChange: true → must POST /change-password first
   */
  login: async (identifier: string, password: string): Promise<LoginResponse> => {
    try {
      const response = await api.post<LoginResponse>("/auth/login", {
        identifier,
        email: identifier, // legacy-compat alias
        password,
      });
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Login failed");
    }
  },

  /**
   * Step 2 of login — consume the AUTH_CODE temp token and send the
   * hospital's 6-digit authCode.
   */
  verifyAuthCodeLogin: async (authCode: string): Promise<AuthCodeVerifyResponse> => {
    try {
      const tempToken = sessionStorage.getItem("tempToken");
      const config = tempToken ? { headers: { Authorization: `Bearer ${tempToken}` } } : {};
      const response = await api.post<AuthCodeVerifyResponse>(
        "/auth/login/verify-auth-code",
        { authCode },
        config,
      );
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Auth code verification failed");
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
    // Store access token in sessionStorage (cleared on browser close)
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
};

export default authService;
