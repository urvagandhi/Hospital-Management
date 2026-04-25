/**
 * Authentication Service
 * Wraps the /api/auth endpoints used by the login + self-registration flows.
 */

import { LoginResponse, AuthCodeVerifyResponse, RefreshTokenResponse } from "../types/auth";
import api, { clearAccessToken, getAccessToken, setAccessToken } from "./api";

function extractErrorMessage(error: unknown, fallback: string): string {
  // Check the API response body FIRST — axios errors are also Error
  // instances, so we must not short-circuit on error.message (which is the
  // generic "Request failed with status code 4xx").
  if (typeof error === "object" && error !== null && "response" in error) {
    const resp = (error as { response?: { data?: { message?: string } } }).response;
    if (resp?.data?.message) return resp.data.message;
  }
  if (error instanceof Error && error.message && !/^Request failed with status code/i.test(error.message)) {
    return error.message;
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
    accessToken: getAccessToken(), // in-memory only (TD-D3)
    refreshToken: null,            // httpOnly cookie, not readable from JS
    tempToken: sessionStorage.getItem("tempToken"),
  }),

  storeTokens: (accessToken: string, _refreshToken: string) => {
    // TD-D3: access token is held in module-scoped memory inside api.ts.
    // It is intentionally NOT persisted to sessionStorage / localStorage —
    // a tab-reopen bootstraps a fresh token via the httpOnly refresh cookie.
    setAccessToken(accessToken || null);
    sessionStorage.removeItem("tempToken");
  },

  storeTempToken: (tempToken: string) => {
    sessionStorage.setItem("tempToken", tempToken);
  },

  clearTokens: () => {
    clearAccessToken();
    sessionStorage.removeItem("tempToken");
    sessionStorage.removeItem("resetToken");
    localStorage.removeItem("hospital");
  },

  // ── Forgot password (public, pre-auth) ───────────────────────────────────
  forgotPasswordInit: async (identifier: string) => {
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        "/auth/forgot-password/init",
        { identifier },
      );
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Unable to send reset code");
    }
  },

  forgotPasswordVerify: async (identifier: string, otp: string) => {
    try {
      const response = await api.post<{
        success: boolean;
        message: string;
        data?: { tempToken?: string; expiresInSeconds?: number };
      }>("/auth/forgot-password/verify", { identifier, otp });
      const token = response.data.data?.tempToken;
      if (token) sessionStorage.setItem("resetToken", token);
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Invalid or expired code");
    }
  },

  forgotPasswordReset: async (newPassword: string) => {
    const resetToken = sessionStorage.getItem("resetToken");
    if (!resetToken) throw new Error("Session expired. Please start over.");
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        "/auth/forgot-password/reset",
        { newPassword },
        { headers: { Authorization: `Bearer ${resetToken}` } },
      );
      sessionStorage.removeItem("resetToken");
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Password reset failed");
    }
  },

  // ── Settings-based change password (logged in) ───────────────────────────
  changePasswordSettings: async (currentPassword: string, newPassword: string) => {
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        "/auth/password/change",
        { currentPassword, newPassword },
      );
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Password change failed");
    }
  },

  // ── Session management (logged in) ───────────────────────────────────────
  listSessions: async () => {
    try {
      const response = await api.get<{ success: boolean; data: any[] }>(
        "/auth/session/list",
      );
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Unable to load sessions");
    }
  },

  revokeSession: async (id: string) => {
    try {
      const response = await api.post<{ success: boolean; message: string }>(
        `/auth/session/revoke/${id}`,
      );
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Unable to revoke session");
    }
  },

  revokeAllOtherSessions: async () => {
    try {
      const response = await api.post<{
        success: boolean;
        message: string;
        revokedCount?: number;
      }>("/auth/session/revoke-all-others");
      return response.data;
    } catch (error: unknown) {
      throw toApiError(error, "Unable to revoke sessions");
    }
  },
};

export default authService;
