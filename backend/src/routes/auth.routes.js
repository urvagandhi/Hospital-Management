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
} from "../controllers/auth.controller.js";
import { verifyAccessToken, verifyTempToken } from "../middleware/auth.js";
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
    body("address").notEmpty().trim().withMessage("Address is required"),
  ],
  handleValidationErrors,
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
    body("email").isEmail().normalizeEmail({ gmail_remove_dots: false }).withMessage("Invalid email format"),
    body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
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
    body("newPassword").isLength({ min: 6 }).withMessage("New password must be at least 6 characters"),
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

// ========================================
// LEGACY SMS OTP (DISABLED – replaced by TOTP)
// ========================================
/*
/**
 * POST /api/auth/verify-otp
 * Verify OTP and create session
 */
/*
router.post(
  "/verify-otp",
  otpLimiter,
  verifyTempToken,
  [
    body("otp")
      .matches(/^\d{6}$/)
      .withMessage("OTP must be 6 digits"),
  ],
  handleValidationErrors,
  verifyOtp,
);
*/

/*
/**
 * POST /api/auth/resend-otp
 * Resend OTP to phone
 */
/*
router.post("/resend-otp", otpLimiter, verifyTempToken, resendOtp);
*/
// ========================================
// END LEGACY SMS OTP
// ========================================

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

export default router;
