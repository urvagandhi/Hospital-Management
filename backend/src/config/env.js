/**
 * Environment Configuration
 * Centralized environment variable management
 */

import dotenv from "dotenv";

dotenv.config();

const config = {
  // Server
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",

  // Database
  MONGODB_URI: process.env.MONGODB_URI || "mongodb://localhost:27017/hospital-management",

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || "dev-secret-key-change-in-production",
  JWT_EXPIRY: process.env.JWT_EXPIRY || "24h",
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || "dev-refresh-secret-key",
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || "7d",

  // OTP
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || "5"),
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || "6"),
  MAX_OTP_ATTEMPTS: parseInt(process.env.MAX_OTP_ATTEMPTS || "3"),

  // SMS Gateway
  SMS_GATEWAY_API_KEY: process.env.SMS_GATEWAY_API_KEY,
  SMS_GATEWAY_SENDER: process.env.SMS_GATEWAY_SENDER || "Hospital",

  // CORS
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "15000"),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "10"),

  // Cloudflare R2
  R2_ENDPOINT: process.env.R2_ENDPOINT || "https://your-account.r2.cloudflarestorage.com",
  R2_ACCESS_KEY_ID: process.env.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: process.env.R2_SECRET_ACCESS_KEY,
  R2_BUCKET_NAME: process.env.R2_BUCKET_NAME || "hospital-files",

  // Local File Storage (fallback when R2 not configured)
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE === "true" || (!process.env.R2_ACCESS_KEY_ID && process.env.NODE_ENV === "development"),
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || "./uploads",
};

// Validate required environment variables in production
if (config.NODE_ENV === "production") {
  if (!config.JWT_SECRET || config.JWT_SECRET.includes("dev-")) {
    throw new Error("JWT_SECRET must be set in production");
  }
  if (!config.MONGODB_URI) {
    throw new Error("MONGODB_URI must be set in production");
  }
  if (!config.R2_ACCESS_KEY_ID) {
    throw new Error("R2_ACCESS_KEY_ID must be set in production");
  }
  if (!config.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2_SECRET_ACCESS_KEY must be set in production");
  }
}

export default config;
