/**
 * Axios API Service
 * Centralized API communication with interceptors
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import { API_URL } from "../config/constants";
import { persistentLogger } from "../utils/persistentLogger";

class ApiService {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: API_URL,
      timeout: 30000,
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
        persistentLogger.log("Axios", "REQUEST START", `${config.baseURL || ""}${config.url || ""}`);
        console.log("[Axios] ===== REQUEST START =====");
        console.log("[Axios] URL:", `${config.baseURL || ""}${config.url || ""}`);
        console.log("[Axios] Method:", config.method);
        console.log("[Axios] Payload:", config.data);

        // For OTP verification/resend, we might still need the tempToken if the backend expects it in header
        // But my backend implementation for verifyOtp/resendOtp checks for tempToken in header?
        // Let's check auth.routes.js/middleware.
        // verifyTempToken middleware likely checks header.
        // So we should keep this logic ONLY for tempToken if it exists.

        // Check for access token first (Logged in state)
        // Then temp token (OTP state)
        const accessToken = localStorage.getItem("accessToken");
        const tempToken = localStorage.getItem("tempToken");

        let token = accessToken;
        if (!token && tempToken) {
          token = tempToken;
          console.log("[Axios] Using Temp Token for request");
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
          // console.log("[Axios] Added Authorization header:", token.substring(0, 10) + "...");
        } else {
          console.warn("[Axios] No token found in localStorage (accessToken or tempToken)");
        }

        return config;
      },
      (error) => {
        persistentLogger.error("Axios", "Request interceptor error:", error);
        console.error("[Axios] Request interceptor error:", error);
        return Promise.reject(error);
      },
    );

    // Response interceptor
    this.api.interceptors.response.use(
      (response) => {
        persistentLogger.log("Axios", "RESPONSE SUCCESS", `${response.status} from ${response.config.url}`);
        console.log("[Axios] ===== RESPONSE SUCCESS =====");
        console.log("[Axios] Status:", response.status);
        console.log("[Axios] URL:", response.config.url);
        console.log("[Axios] Response data:", response.data);
        return response;
      },
      async (error: AxiosError) => {
        persistentLogger.error("Axios", "RESPONSE ERROR", `${error.response?.status} from ${error.config?.url}`);
        console.error("[Axios] ===== RESPONSE ERROR =====");
        console.error("[Axios] Status:", error.response?.status);
        console.error("[Axios] URL:", error.config?.url);
        console.error("[Axios] Error message:", error.message);
        console.error("[Axios] Response data:", error.response?.data);
        const originalRequest = error.config;

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && originalRequest && !originalRequest.url?.includes("/auth/login")) {
          // If we get 401, it means cookie is invalid/expired. Try refresh.
          // We don't need to read refreshToken from localStorage, it's in cookie.

          // Avoid infinite loop if refresh itself fails
          if (originalRequest.url?.includes("/auth/refresh-token")) {
            if (window.location.pathname !== "/login") {
              window.location.href = "/login";
            }
            return Promise.reject(error);
          }

          try {
            persistentLogger.log("Axios", "Attempting token refresh");
            // The refresh endpoint will read the refreshToken cookie and set new cookies
            await this.post("/auth/refresh-token", {});

            persistentLogger.log("Axios", "Retrying original request after token refresh");
            return this.api(originalRequest);
          } catch (refreshError) {
            persistentLogger.error("Axios", "Token refresh failed:", refreshError);
            localStorage.removeItem("tempToken");
            localStorage.removeItem("hospital");
            window.location.href = "/login";
            return Promise.reject(refreshError);
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

  setAuthToken(token: string) {
    // No-op for cookies
    // this.api.defaults.headers.common["Authorization"] = `Bearer ${token}`;
    // localStorage.setItem("accessToken", token);
  }

  removeAuthToken() {
    delete this.api.defaults.headers.common["Authorization"];
    // localStorage.removeItem("accessToken");
    // localStorage.removeItem("refreshToken");
    localStorage.removeItem("tempToken");
    localStorage.removeItem("hospital");
  }
}

export default new ApiService();
