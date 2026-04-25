/**
 * Authentication Routes
 * Login (email/phone + password → auth code), self-registration, biometric,
 * session management, change password, FCM token.
 */

import express from "express";
import { body } from "express-validator";
import {
  changePassword,
  login,
  verifyAuthCodeLogin,
  logout,
  refreshToken,
  registerHospital,
  registerSelfService,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  registerBiometric,
  biometricChallenge,
  verifyBiometric,
  checkSessionConflict,
  validateSession,
  forceLogoutOtherSessions,
  listActiveSessions,
  revokeSessionById,
  revokeAllOtherSessions,
  reverifyAuthCode,
  storeFcmToken,
  forgotPasswordInit,
  forgotPasswordVerify,
  forgotPasswordReset,
  changePasswordSettings,
} from "../controllers/auth.controller.js";
import { verifyAccessToken, verifyAdmin, verifyTempToken } from "../middleware/auth.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.js";
import { uploadSingle } from "../middleware/upload.js";
import { handleValidationErrors, sanitizeRequest } from "../middleware/validateRequest.js";
import { verifyToken } from "../utils/jwt.js";
import logger from "../utils/logger.js";

const router = express.Router();

// Debug: indicate this routes file was loaded (helps ensure nodemon restarted)
logger.info({ event: "auth_routes_loaded", at: new Date().toISOString() }, "[auth.routes] loaded");

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
    body("address").optional({ values: "falsy" }).trim(),
  ],
  handleValidationErrors,
  registerHospital,
);

// ═══════════════════════════════════════════════════════════════════════════
// SELF-REGISTRATION FLOW (Android self-service)
// No auth middleware — these endpoints are public. Rate-limited instead.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/register
 * Initiate self-service registration: validate + stash in Redis + send OTP.
 * Accepts multipart form (for optional logo) or JSON.
 */
router.post(
  "/register",
  authLimiter,
  (req, res, next) => {
    // Logo is optional; if not multipart, skip the parser entirely
    const ct = req.headers["content-type"] || "";
    if (!ct.includes("multipart/form-data")) return next();
    uploadSingle("logo")(req, res, (err) => {
      if (err) {
        if (err.message && err.message.includes("Only image files")) {
          return res.status(400).json({ success: false, message: "Only image files are allowed (JPEG, PNG, GIF, WebP)" });
        }
        if (err.code === "LIMIT_FILE_SIZE") {
          return res.status(400).json({ success: false, message: "Logo file size must be less than 2MB" });
        }
        return res.status(400).json({ success: false, message: err.message || "File upload failed" });
      }
      next();
    });
  },
  [
    body("hospitalName").notEmpty().trim().withMessage("Hospital name is required"),
    body("email").isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage("Invalid email format"),
    body().custom((v) => {
      if (!v.phone && !v.phoneNumber) throw new Error("Phone number is required");
      return true;
    }),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
    body("address").optional({ values: "falsy" }).trim(),
  ],
  handleValidationErrors,
  registerSelfService,
);

/**
 * POST /api/auth/register/verify-otp
 * Verify OTP (3-attempt max) and create the Hospital account.
 */
router.post(
  "/register/verify-otp",
  otpLimiter,
  [
    body("email").isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage("Invalid email format"),
    body("otp").matches(/^\d{6}$/).withMessage("OTP must be 6 digits"),
  ],
  handleValidationErrors,
  verifyRegistrationOtp,
);

/**
 * POST /api/auth/register/resend-otp
 * Resend registration OTP. Rate-limited to once per 60 seconds.
 */
router.post(
  "/register/resend-otp",
  otpLimiter,
  [
    body("email").isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage("Invalid email format"),
  ],
  handleValidationErrors,
  resendRegistrationOtp,
);

/**
 * POST /api/auth/login
 * Login with email or phone + password (step 1 of 2).
 * Returns a temp token for the next step:
 *   • requireAuthCode: true  (normal path — user must complete /login/verify-auth-code)
 *   • requirePasswordChange: true  (first login — user must POST /change-password first)
 */
router.post(
  "/login",
  authLimiter,
  [
    // Accept either "email" (legacy) or "identifier" (new multi-type login)
    body("password").isLength({ min: 1 }).withMessage("Password is required"),
    body().custom((value) => {
      if (!value.email && !value.identifier) {
        throw new Error("Email or phone is required");
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
    req.log.debug({ event: "change_password_middleware_invoked", path: req.path }, "[auth.routes] change-password middleware invoked");
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

/**
 * POST /api/auth/login/verify-auth-code
 * Step 2 of password login: validate the hospital's 6-digit authCode.
 * Requires: Temp Token (purpose=AUTH_CODE) in Authorization header.
 */
router.post(
  "/login/verify-auth-code",
  otpLimiter,
  verifyTempToken,
  [
    body("authCode")
      .matches(/^\d{6}$/)
      .withMessage("Auth code must be 6 digits"),
  ],
  handleValidationErrors,
  verifyAuthCodeLogin,
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

/** List every active session for the caller (mobile + web, with isCurrent flag) */
router.get("/session/list", verifyAccessToken, listActiveSessions);

/** Revoke a specific session by id (cannot revoke your own current session) */
router.post("/session/revoke/:id", verifyAccessToken, revokeSessionById);

/** Revoke all sessions except the caller's current one */
router.post("/session/revoke-all-others", verifyAccessToken, revokeAllOtherSessions);

/**
 * Re-verify the 6-digit hospital Auth Code for the current session.
 * The verifyAccessToken middleware lets this route through even when the
 * session's authCodeVerifiedAt is stale — otherwise the user could never
 * satisfy the check they're being asked to satisfy.
 */
router.post(
  "/session/reverify-auth-code",
  otpLimiter,
  verifyAccessToken,
  [
    body("authCode")
      .matches(/^\d{6}$/)
      .withMessage("Auth code must be 6 digits"),
  ],
  handleValidationErrors,
  reverifyAuthCode,
);

// ═══════════════════════════════════════════════════
// FORGOT-PASSWORD FLOW (public, 3 endpoints)
// ═══════════════════════════════════════════════════

/**
 * POST /api/auth/forgot-password/init
 * Body: { identifier }  (email or phone)
 * Always responds 200 with a generic message unless rate-limited.
 */
router.post(
  "/forgot-password/init",
  authLimiter,
  [body("identifier").isString().trim().notEmpty().withMessage("Identifier is required")],
  handleValidationErrors,
  forgotPasswordInit,
);

/**
 * POST /api/auth/forgot-password/verify
 * Body: { identifier, otp }
 * Returns a PASSWORD_RESET temp token on success.
 */
router.post(
  "/forgot-password/verify",
  otpLimiter,
  [
    body("identifier").isString().trim().notEmpty().withMessage("Identifier is required"),
    body("otp").matches(/^\d{6}$/).withMessage("OTP must be 6 digits"),
  ],
  handleValidationErrors,
  forgotPasswordVerify,
);

/**
 * POST /api/auth/forgot-password/reset
 * Headers: Authorization: Bearer <PASSWORD_RESET temp token>
 * Body: { newPassword }
 */
router.post(
  "/forgot-password/reset",
  authLimiter,
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
  forgotPasswordReset,
);

/**
 * POST /api/auth/password/change
 * Authenticated in-session change password (settings flow).
 * Body: { currentPassword, newPassword }
 */
router.post(
  "/password/change",
  authLimiter,
  verifyAccessToken,
  [
    body("currentPassword").isLength({ min: 1 }).withMessage("Current password is required"),
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
  changePasswordSettings,
);

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
