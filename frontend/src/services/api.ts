/**
 * Axios API Service
 * Centralized API communication with interceptors
 *
 * Access-token storage strategy (TD-D3, 2026-04-25):
 *   The 24h access token is held in a module-scoped variable, NOT in
 *   sessionStorage. This shrinks the XSS exfiltration window from 24h to
 *   "as long as the tab is alive AND attacker JS is running". A cold start
 *   (page refresh / tab reopen) bootstraps a fresh access token via the
 *   httpOnly refresh cookie + `/auth/refresh-token` (handled in `useAuth`).
 *
 *   The short-lived `tempToken` (10-15m, mid-login only) and `resetToken`
 *   (forgot-password flow) stay in sessionStorage — they're purpose-scoped,
 *   need to survive a tab-close-during-login mid-flow, and have a much
 *   smaller blast radius.
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import { API_URL } from "../config/constants";

const isDev = import.meta.env.DEV;

// ── In-memory access token (TD-D3) ────────────────────────────────────────
// Module-scoped, never serialised to disk/storage. Set by AuthProvider on
// mount (after a successful /auth/refresh-token bootstrap) or after the
// auth-code verify step. Cleared on logout.
let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token || null;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function clearAccessToken(): void {
  _accessToken = null;
}

class ApiService {
  private api: AxiosInstance;
  private isRefreshing = false;
  private refreshSubscribers: Array<(token: string) => void> = [];

  private onRefreshed(token: string) {
    this.refreshSubscribers.forEach((cb) => cb(token));
    this.refreshSubscribers = [];
  }

  private addRefreshSubscriber(cb: (token: string) => void) {
    this.refreshSubscribers.push(cb);
  }

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      timeout: 600000, // 10 minutes to allow for large PDF compression
      withCredentials: true, // Enable cookies
      headers: {
        "Content-Type": "application/json",
      },
    });

    this.setupInterceptors();
  }

  private setupInterceptors() {
    // Request interceptor
    this.api.interceptors.request.use(
      (config) => {
        if (isDev) {
          console.log(`[Axios] ${config.method?.toUpperCase()} ${config.url}`);
        }

        // Attach token if no Authorization header is already set.
        // Access token comes from in-memory `_accessToken` (TD-D3), tempToken
        // from sessionStorage (mid-login flows still need cross-page survival).
        const accessToken = _accessToken;
        const tempToken = sessionStorage.getItem("tempToken");

        if (!config.headers.Authorization) {
          if (accessToken) {
            config.headers.Authorization = `Bearer ${accessToken}`;
          } else if (tempToken) {
            config.headers.Authorization = `Bearer ${tempToken}`;
          }
        }

        return config;
      },
      (error) => {
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        return response;
      },
      async (error: AxiosError) => {
        if (isDev) {
          console.error(`[Axios] ${error.response?.status} from ${error.config?.url}`);
        }

        const originalRequest = error.config;

        if (error.response?.status === 429) {
          const payload = error.response.data as
            | { message?: string; data?: { retryAfterSeconds?: number } }
            | string
            | undefined;

          const retryAfterSeconds =
            typeof payload === "object" && payload?.data?.retryAfterSeconds
              ? payload.data.retryAfterSeconds
              : undefined;

          const serverMessage =
            typeof payload === "string"
              ? payload
              : payload?.message;

          const fallback = retryAfterSeconds
            ? `Too many requests. Please retry in ${retryAfterSeconds} second(s).`
            : "Too many requests. Please retry in a few seconds.";

          error.message = serverMessage || fallback;
        }

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && originalRequest && !originalRequest.url?.includes("/auth/login")) {
          // Account disabled by admin — skip refresh, force logout immediately
          const responseData = error.response?.data as any;
          if (
            responseData?.reason === "ACCOUNT_DISABLED" ||
            String(responseData?.message ?? "").includes("ACCOUNT_DISABLED")
          ) {
            clearAccessToken();
            sessionStorage.removeItem("tempToken");
            localStorage.removeItem("hospital");
            window.location.href = "/login";
            return Promise.reject(error);
          }

          // Avoid infinite loop if refresh itself fails
          if (originalRequest.url?.includes("/auth/refresh-token")) {
            if (window.location.pathname !== "/login") {
              clearAccessToken();
              sessionStorage.removeItem("tempToken");
              localStorage.removeItem("hospital");
              window.location.href = "/login";
            }
            return Promise.reject(error);
          }

          // Use mutex to prevent multiple concurrent refresh requests
          if (this.isRefreshing) {
            return new Promise((resolve) => {
              this.addRefreshSubscriber((newToken: string) => {
                if (originalRequest.headers) {
                  originalRequest.headers.Authorization = `Bearer ${newToken}`;
                }
                resolve(this.api(originalRequest));
              });
            });
          }

          this.isRefreshing = true;
          try {
            const refreshResponse = await this.post<any>("/auth/refresh-token", {});
            const newAccessToken = refreshResponse.data?.data?.accessToken;
            if (newAccessToken) {
              setAccessToken(newAccessToken);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              }
              this.onRefreshed(newAccessToken);
            }
            return this.api(originalRequest);
          } catch (refreshError) {
            this.refreshSubscribers = [];
            clearAccessToken();
            sessionStorage.removeItem("tempToken");
            localStorage.removeItem("hospital");
            window.location.href = "/login";
            return Promise.reject(refreshError);
          } finally {
            this.isRefreshing = false;
          }
        }

        return Promise.reject(error);
      },
    );
  }

  async get<T>(url: string, config = {}) {
    return this.api.get<T>(url, config);
  }

  async getBlob(url: string, config = {}) {
    return this.api.get(url, { ...config, responseType: "blob" });
  }

  async postBlob(url: string, data = {}, config = {}) {
    return this.api.post(url, data, { ...config, responseType: "blob" });
  }

  async post<T>(url: string, data = {}, config = {}) {
    return this.api.post<T>(url, data, config);
  }

  async put<T>(url: string, data = {}, config = {}) {
    return this.api.put<T>(url, data, config);
  }

  async patch<T>(url: string, data = {}, config = {}) {
    return this.api.patch<T>(url, data, config);
  }

  async delete<T>(url: string, config = {}) {
    return this.api.delete<T>(url, config);
  }

  setAuthToken(_token: string) {
    // No-op: auth is handled via httpOnly cookies
  }

  removeAuthToken() {
    delete this.api.defaults.headers.common["Authorization"];
    sessionStorage.removeItem("tempToken");
    localStorage.removeItem("hospital");
  }
}

export default new ApiService();
