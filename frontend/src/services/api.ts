/**
 * Axios API Service
 * Centralized API communication with interceptors
 */

import axios, { AxiosError, AxiosInstance } from "axios";
import { API_URL } from "../config/constants";

const isDev = import.meta.env.DEV;

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
        if (isDev) {
          console.log(`[Axios] ${config.method?.toUpperCase()} ${config.url}`);
        }

        // Attach token if no Authorization header is already set
        const accessToken = sessionStorage.getItem("accessToken");
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

        // Handle 401 Unauthorized
        if (error.response?.status === 401 && originalRequest && !originalRequest.url?.includes("/auth/login")) {
          // Avoid infinite loop if refresh itself fails
          if (originalRequest.url?.includes("/auth/refresh-token")) {
            if (window.location.pathname !== "/login") {
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
              sessionStorage.setItem("accessToken", newAccessToken);
              if (originalRequest.headers) {
                originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
              }
              this.onRefreshed(newAccessToken);
            }
            return this.api(originalRequest);
          } catch (refreshError) {
            this.refreshSubscribers = [];
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
