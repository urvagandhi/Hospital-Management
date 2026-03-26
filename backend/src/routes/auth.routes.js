/**
 * Authentication Routes
 * Defines all authentication endpoints including TOTP 2FA
 */

import express from "express";
import { body } from "express-validator";
import {
  changePassword,
  disableTotp,
  login,
  logout,
  recoveryLogin,
  refreshToken,
  registerHospital,
  resetTotp,
  setupTotp,
  verifyTotpLogin,
  verifyTotpReset,
  verifyTotpSetup,
  registerBiometric,
  biometricChallenge,
  verifyBiometric,
  checkSessionConflict,
  validateSession,
  forceLogoutOtherSessions,
  storeFcmToken,
} from "../controllers/auth.controller.js";
import { verifyAccessToken, verifyAdmin, verifyTempToken } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.js";
import { uploadSingle } from "../middleware/upload.js";
import { handleValidationErrors, sanitizeRequest } from "../middleware/validateRequest.js";
import { verifyToken } from "../utils/jwt.js";

const router = express.Router();

// Debug: indicate this routes file was loaded (helps ensure nodemon restarted)
console.log(`[auth.routes] loaded at ${new Date().toISOString()}`);

// Apply sanitization to all auth routes
router.use(sanitizeRequest);

/**
 * POST /api/auth/register-hospital
 * Register a new hospital
 */
router.post(
  "/register-hospital",
  authLimiter,
  verifyAccessToken,
  verifyAdmin,
  (req, res, next) => {
    uploadSingle("logo")(req, res, (err) => {
      if (err) {
        if (err.message.includes("Only image files")) {
          return res.status(400).json({
            success: false,
            message: "Only image files are allowed (JPEG, PNG, GIF, WebP)",
          });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({
            success: false,
            message: "Logo file size must be less than 2MB",
          });
        }
        return res.status(400).json({
          success: false,
          message: err.message || "File upload failed",
        });
      }
      next();
    });
  },
  [
    body("hospitalName").notEmpty().trim().withMessage("Hospital name is required"),
    body("email").isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage("Invalid email format"),
    body("phoneNumber")
      .matches(/^\d{10}$/)
      .withMessage("Phone number must be 10 digits"),
    body("username")
      .optional()
      .trim()
      .isLength({ min: 4, max: 30 })
      .withMessage("Username must be 4-30 characters")
      .matches(/^[a-zA-Z0-9_]+$/)
      .withMessage("Username may only contain letters, numbers, and underscores"),
    body("address").notEmpty().trim().withMessage("Address is required"),
  ],
  handleValidationErrors,
  registerHospital,
);

// Note: registration no longer requires TOTP verification (admin-only registration)

/**
 * POST /api/auth/login
 * Login with email and password
 * Returns: { requireTotp: true/false, tempToken/accessToken }
 */
router.post(
  "/login",
  authLimiter,
  [
    // Accept either "email" (legacy) or "identifier" (new multi-type login)
    body("password").isLength({ min: 1 }).withMessage("Password is required"),
    body().custom((value) => {
      if (!value.email && !value.identifier) {
        throw new Error("Email, phone, or username is required");
      }
      return true;
    }),
  ],
  handleValidationErrors,
  login,
);

/**
 * POST /api/auth/change-password
 * Change password using purpose-scoped temp token (PASSWORD_CHANGE)
 */
router.post(
  "/change-password",
  authLimiter,
  (req, res, next) => {
    console.log("[auth.routes] change-password middleware invoked", { path: req.path });
    try {
      const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.split(" ")[1] : null;
      if (!token) return res.status(401).json({ success: false, message: "No token provided" });
      const decoded = verifyToken(token);
      if (decoded.type !== "temp" || decoded.purpose !== "PASSWORD_CHANGE") {
        return res.status(401).json({ success: false, message: "Invalid token for password change" });
      }
      req.hospital = { id: decoded.id };
      next();
    } catch (e) {
      return res.status(401).json({ success: false, message: e.message });
    }
  },
  [
    body("newPassword")
      .isLength({ min: 8 })
      .withMessage("Password must be at least 8 characters")
      .matches(/[A-Z]/)
      .withMessage("Password must contain at least one uppercase letter")
      .matches(/[a-z]/)
      .withMessage("Password must contain at least one lowercase letter")
      .matches(/[0-9]/)
      .withMessage("Password must contain at least one number")
      .matches(/[\W_]/)
      .withMessage("Password must contain at least one special character"),
  ],
  handleValidationErrors,
  changePassword,
);

// ========================================
// TOTP 2FA ENDPOINTS
// ========================================

/**
 * POST /api/auth/2fa/setup
 * Generate TOTP secret and QR code
 * Requires: Access Token (must be logged in)
 */
router.post("/2fa/setup", verifyAccessToken, setupTotp);

/**
 * POST /api/auth/2fa/verify
 * Verify TOTP setup with first code and enable 2FA
 * Returns backup codes on success
 * Requires: Access Token
 */
router.post(
  "/2fa/verify",
  verifyAccessToken,
  otpLimiter,
  [
    body("token")
      .matches(/^\d{6}$/)
      .withMessage("TOTP token must be 6 digits"),
  ],
  handleValidationErrors,
  verifyTotpSetup,
);

/**
 * POST /api/auth/login/totp
 * Complete login with TOTP verification
 * Requires: Temp Token (purpose=TOTP_LOGIN)
 */
router.post(
  "/login/totp",
  otpLimiter,
  verifyTempToken,
  [
    body("token")
      .matches(/^\d{6}$/)
      .withMessage("TOTP token must be 6 digits"),
  ],
  handleValidationErrors,
  verifyTotpLogin,
);

/**
 * POST /api/auth/2fa/disable
 * Disable 2FA (requires valid TOTP)
 * Requires: Access Token
 */
router.post(
  "/2fa/disable",
  verifyAccessToken,
  otpLimiter,
  [
    body("token")
      .matches(/^\d{6}$/)
      .withMessage("TOTP token must be 6 digits"),
  ],
  handleValidationErrors,
  disableTotp,
);

/**
 * POST /api/auth/2fa/reset
 * Reset 2FA with Password (for lost devices)
 * Requires: Access Token
 */
router.post(
  "/2fa/reset",
  verifyAccessToken,
  authLimiter,
  [
    body("password").notEmpty().withMessage("Password is required"),
  ],
  handleValidationErrors,
  resetTotp,
);

/**
 * POST /api/auth/2fa/reset/verify
 * Verify Rotation TOTP
 * Requires: Access Token
 */
router.post(
  "/2fa/reset/verify",
  verifyAccessToken,
  authLimiter,
  [
    body("token").matches(/^\d{6}$/).withMessage("TOTP token must be 6 digits"),
  ],
  handleValidationErrors,
  verifyTotpReset,
);

/**
 * POST /api/auth/login/recovery
 * Login using backup code when TOTP unavailable
 * Requires: Temp Token (purpose=TOTP_LOGIN)
 */
router.post(
  "/login/recovery",
  otpLimiter,
  verifyTempToken,
  [
    body("code")
      .matches(/^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i)
      .withMessage("Invalid backup code format"),
  ],
  handleValidationErrors,
  recoveryLogin,
);

/**
 * POST /api/auth/refresh-token
 * Refresh access token using refresh token (from cookie)
 */
router.post("/refresh-token", refreshToken);

/**
 * POST /api/auth/logout
 * Invalidate session (uses refresh token from cookie)
 */
router.post("/logout", logout);

// ═══════════════════════════════════════════════════
// BIOMETRIC ENDPOINTS (Feature 4)
// ═══════════════════════════════════════════════════

/** Register biometric public key (requires auth) */
router.post("/biometric/register", verifyAccessToken, registerBiometric);

/** Generate biometric challenge (no auth — pre-login) */
router.post("/biometric/challenge", authLimiter, biometricChallenge);

/** Verify biometric signature (no auth — creates session) */
router.post("/biometric/verify", authLimiter, verifyBiometric);

// ═══════════════════════════════════════════════════
// SESSION MANAGEMENT ENDPOINTS (Feature 5)
// ═══════════════════════════════════════════════════

/** Check if there's an active session conflict */
router.post("/session/check-conflict", authLimiter, checkSessionConflict);

/** Validate current session is still active */
router.get("/session/validate", verifyAccessToken, validateSession);

/** Force logout other sessions (requires auth) */
router.post("/session/force-logout", verifyAccessToken, forceLogoutOtherSessions);

// ═══════════════════════════════════════════════════
// FCM TOKEN ENDPOINT
// ═══════════════════════════════════════════════════

/** Store FCM push notification token from mobile client */
router.post(
  "/fcm-token",
  verifyAccessToken,
  body("fcmToken").notEmpty().withMessage("fcmToken is required"),
  storeFcmToken,
);

export default router;
