/**
 * Environment Configuration
 * Centralized environment variable management
 */

import dotenv from "dotenv";

import fs from "fs";
import path from "path";

function bootstrapLog(level, message, data = null) {
  if (data) {
    // eslint-disable-next-line no-console
    console[level](message, data);
    return;
  }
  // eslint-disable-next-line no-console
  console[level](message);
}

// Load .env.development for development if it exists
const devEnvPath = path.resolve(process.cwd(), ".env.development");
if (fs.existsSync(devEnvPath)) {
  bootstrapLog("info", "[env] Loading environment from .env.development", { source: ".env.development" });
  dotenv.config({ path: devEnvPath });
} else {
  dotenv.config();
}

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
  // "Always logged in" on mobile: refresh tokens and DB sessions live for a
  // year. Real security gate is the 7-day Auth Code re-verification enforced
  // in middleware/auth.js, not the refresh expiry.
  REFRESH_TOKEN_EXPIRY: process.env.REFRESH_TOKEN_EXPIRY || "365d",

  // OTP (used by self-registration email OTP)
  OTP_EXPIRY_MINUTES: parseInt(process.env.OTP_EXPIRY_MINUTES || "10"),
  OTP_LENGTH: parseInt(process.env.OTP_LENGTH || "6"),
  MAX_OTP_ATTEMPTS: parseInt(process.env.MAX_OTP_ATTEMPTS || "3"),

  // Concurrent mobile sessions allowed per hospital. Production default = 2
  // (1 primary + 1 spare; the 3rd login evicts the oldest). Demo droplets can
  // bump this to 10–15. Clamped >= 1 in case someone sets it to 0/garbage.
  MOBILE_SESSION_LIMIT: Math.max(1, parseInt(process.env.MOBILE_SESSION_LIMIT || "2", 10) || 2),

  // SMTP (email)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT || 587,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  SMTP_SECURE: process.env.SMTP_SECURE || "false",

  // CORS
  FRONTEND_URL: process.env.FRONTEND_URL || "http://localhost:3000",

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "15000"),
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "60"),


  // Local File Storage (fallback when storage providers not configured)
  USE_LOCAL_STORAGE: process.env.USE_LOCAL_STORAGE === "true" || (!process.env.CLOUDINARY_CLOUD_NAME && !process.env.DO_SPACES_ACCESS_KEY_ID && process.env.NODE_ENV === "development"),
  LOCAL_STORAGE_PATH: process.env.LOCAL_STORAGE_PATH || "./uploads",

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME,
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY,
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET,
  SIGNED_UPLOADS_ENABLED: String(process.env.SIGNED_UPLOADS_ENABLED || 'false').toLowerCase() === 'true',

  // DigitalOcean Spaces (S3)
  DO_SPACES_ENDPOINT: process.env.DO_SPACES_ENDPOINT,
  DO_SPACES_REGION: process.env.DO_SPACES_REGION || 'us-east-1',
  DO_SPACES_ACCESS_KEY_ID: process.env.DO_SPACES_ACCESS_KEY_ID,
  DO_SPACES_SECRET_ACCESS_KEY: process.env.DO_SPACES_SECRET_ACCESS_KEY,
  DO_SPACES_BUCKET: process.env.DO_SPACES_BUCKET || 'spacesmymedivault',
  USE_DIGITALOCEAN_AS_PRIMARY: String(process.env.USE_DIGITALOCEAN_AS_PRIMARY || 'false').toLowerCase() === 'true',

  // Upstash Redis
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,

  // Brevo (production email)
  BREVO_API_KEY: process.env.BREVO_API_KEY,
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || "noreply@hospitalhms.com",
  BREVO_SENDER_NAME: process.env.BREVO_SENDER_NAME || "MyMediVault",

  // Mailtrap (development email)
  MAILTRAP_HOST: process.env.MAILTRAP_HOST || "sandbox.smtp.mailtrap.io",
  MAILTRAP_PORT: parseInt(process.env.MAILTRAP_PORT || "2525"),
  MAILTRAP_USER: process.env.MAILTRAP_USER,
  MAILTRAP_PASS: process.env.MAILTRAP_PASS,

  // Firebase
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
  FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
  FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,

  // Compression Service (Phase 3B)
  USE_COMPRESSION_SERVICE: process.env.USE_COMPRESSION_SERVICE === "true",
  COMPRESSION_SERVICE_URL: process.env.COMPRESSION_SERVICE_URL || "",
  COMPRESSION_SERVICE_SECRET: process.env.COMPRESSION_SERVICE_SECRET || "",
};

// Validate required environment variables in production
if (config.NODE_ENV === "production") {
  if (!config.JWT_SECRET || config.JWT_SECRET.includes("dev-")) {
    throw new Error("SECURITY ALERT: JWT_SECRET must be set to a secure value in production (cannot contain 'dev-')");
  }
  if (!config.REFRESH_TOKEN_SECRET || config.REFRESH_TOKEN_SECRET.includes("dev-")) {
    throw new Error("SECURITY ALERT: REFRESH_TOKEN_SECRET must be set to a secure value in production");
  }
  if (!config.MONGODB_URI) {
    throw new Error("MONGODB_URI must be set in production");
  }

  // Check storage configuration
  const hasCloudinary = config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET;
  const hasDO = config.DO_SPACES_ENDPOINT && config.DO_SPACES_ACCESS_KEY_ID && config.DO_SPACES_SECRET_ACCESS_KEY;

  if (!hasCloudinary && !hasDO) {
    throw new Error("STORAGE ALERT: Neither Cloudinary nor DigitalOcean Spaces configured. At least one storage provider is required in production.");
  }

  if (config.USE_DIGITALOCEAN_AS_PRIMARY && !hasDO) {
    throw new Error("USE_DIGITALOCEAN_AS_PRIMARY=true but DO Spaces credentials are missing (DO_SPACES_ENDPOINT, DO_SPACES_ACCESS_KEY_ID, DO_SPACES_SECRET_ACCESS_KEY)");
  }
  // TD-D4 (2026-04-25): the compression sidecar is mandatory in prod. Without
  // it, big-patient PDF/ZIP exports fall back to in-process pdf-lib merge,
  // which OOMs the Node process on patients with many large files. Render
  // currently has USE_COMPRESSION_SERVICE=true; this guard prevents a future
  // deploy from silently regressing to the OOM path. Set to "false" in prod
  // only when a follow-up ticket builds the merge path natively into Node.
  if (!config.USE_COMPRESSION_SERVICE) {
    throw new Error(
      "OPS ALERT: USE_COMPRESSION_SERVICE must be 'true' in production. The in-process pdf-lib fallback OOMs at scale; the sidecar is mandatory.",
    );
  }
}

if (config.USE_COMPRESSION_SERVICE) {
  if (!config.COMPRESSION_SERVICE_URL) {
    throw new Error("COMPRESSION_SERVICE_URL is required when USE_COMPRESSION_SERVICE=true");
  }
  if (!config.COMPRESSION_SERVICE_SECRET) {
    throw new Error("COMPRESSION_SERVICE_SECRET is required when USE_COMPRESSION_SERVICE=true");
  }
}

export default config;
