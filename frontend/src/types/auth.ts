/**
 * Type definitions for authentication
 */

export interface Hospital {
  _id: string;
  hospitalName: string;
  email: string;
  phone: string;
  authCode?: string;
  logoUrl: string;
  role?: "admin" | "hospital";
  department?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Step 1 login response.
 * The backend always returns a tempToken; the consumer picks the next page
 * based on which boolean flag is set.
 */
export interface LoginResponse {
  success: boolean;
  message: string;
  requireAuthCode?: boolean;       // Password OK → show Auth Code screen
  requirePasswordChange?: boolean; // First login → show Change Password screen
  data: {
    tempToken?: string;
    hospitalName?: string;
    logoUrl?: string;
  };
}

/**
 * Step 2 login response — after /login/verify-auth-code succeeds.
 */
export interface AuthCodeVerifyResponse {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType?: string;
    expiresIn?: string;
    hospital: Hospital;
  };
}

export interface RefreshTokenResponse {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: string;
    hospital?: Hospital;
  };
}

export interface AuthState {
  hospital: Hospital | null;
  accessToken: string | null;
  refreshToken: string | null;
  tempToken: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
}

export interface LoginFormData {
  identifier: string;
  password: string;
}

export interface ApiError {
  success: boolean;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
