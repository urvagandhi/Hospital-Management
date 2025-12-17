/**
 * Type definitions for authentication
 */

export interface Hospital {
  _id: string;
  hospitalName: string;
  email: string;
  phone: string;
  logoUrl: string;
  department?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  isActive: boolean;
  totpEnabled?: boolean;
  totpVerified?: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Login Response
 * Backend returns different data based on TOTP status:
 * - requireTotp: false → accessToken, refreshToken, hospital (direct login)
 * - requireTotp: true → tempToken (needs TOTP verification)
 */
export interface LoginResponse {
  success: boolean;
  message: string;
  requireTotp: boolean;
  requireTotpSetup?: boolean; // New user mandatory setup
  data: {
    // Direct login (requireTotp: false)
    accessToken?: string;
    refreshToken?: string;
    tokenType?: string;
    expiresIn?: string;
    hospital?: Hospital;
    // TOTP required (requireTotp: true)
    tempToken?: string;
    hospitalName?: string;
    logoUrl?: string;
    // Legacy SMS OTP fields (deprecated but kept for compatibility)
    phone?: string;
    expiresAt?: string;
  };
}

export interface OtpVerifyResponse {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: string;
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
  email: string;
  password: string;
}

export interface OtpFormData {
  otp: string;
}

// ========================================
// TOTP 2FA Types
// ========================================

export interface TotpSetupResponse {
  success: boolean;
  message: string;
  data: {
    qrCode: string;      // Base64 encoded QR image
    secret: string;      // Masked secret for manual entry
    otpauthUrl: string;  // otpauth:// URI
  };
}

export interface TotpVerifyResponse {
  success: boolean;
  message: string;
  data: {
    totpEnabled: boolean;
    backupCodes: string[];
    backupCodesWarning: string;
  };
}

export interface RecoveryLoginResponse {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: string;
    hospital: Hospital;
    remainingBackupCodes: number;
    warning?: string;
  };
}

export interface ApiError {
  success: boolean;
  message: string;
  errors?: Array<{
    field: string;
    message: string;
  }>;
}
