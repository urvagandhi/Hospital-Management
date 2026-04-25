/**
 * Hospitals Routes
 * Defines all hospital management endpoints
 */

import express from "express";
import {
  getAllHospitals,
  getCurrentHospital,
  getHospitalById,
  updateHospital,
  resendWelcomeEmail,
  patchMe,
  initContactChange,
  resendContactChangeOtp,
  verifyContactChange,
  getNotificationPreferences,
  updateNotificationPreferences,
  adminForceDelete,
} from "../controllers/hospitals.controller.js";
import { verifyAccessToken, verifyAdmin, verifyAdminOrSelf } from "../middleware/auth.js";
import { uploadSingle } from "../middleware/upload.js";
import { authLimiter, otpLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyAccessToken);

/**
 * GET /api/hospitals/me
 * Get current authenticated hospital (must be before /:id)
 */
router.get("/me", getCurrentHospital);

/**
 * PATCH /api/hospitals/me
 * Update non-sensitive profile fields (hospitalName, address, logo).
 * Email / phone changes must go through /me/change-contact/* (OTP-gated).
 */
router.patch("/me", uploadSingle("logo"), patchMe);

/**
 * POST /api/hospitals/me/change-contact/init
 * Body: { newEmail } or { newPhone }
 */
router.post("/me/change-contact/init", authLimiter, initContactChange);

/**
 * POST /api/hospitals/me/change-contact/resend
 * Resend the OTP for the currently pending contact change.
 */
router.post("/me/change-contact/resend", otpLimiter, resendContactChangeOtp);

/**
 * POST /api/hospitals/me/change-contact/verify
 * Body: { otp }
 */
router.post("/me/change-contact/verify", otpLimiter, verifyContactChange);

// B6 — Notification preferences
router.get("/me/notification-preferences", getNotificationPreferences);
router.put("/me/notification-preferences", updateNotificationPreferences);

/**
 * GET /api/hospitals
 * Get all hospitals (admin only)
 */
router.get("/", verifyAdmin, getAllHospitals);

/**
 * GET /api/hospitals/:id
 * Get hospital by ID (admin or own hospital)
 */
router.get("/:id", verifyAdminOrSelf, getHospitalById);

/**
 * PUT /api/hospitals/:id
 * Update hospital details (admin or own hospital; only admin can change isActive)
 */
router.put("/:id", verifyAdminOrSelf, uploadSingle("logo"), updateHospital);

/**
 * POST /api/hospitals/:id/resend-welcome
 * Resend the welcome email (new temp password) to an admin-created hospital
 * that has not yet changed its password. Admin only.
 */
router.post("/:id/resend-welcome", verifyAdmin, resendWelcomeEmail);

/**
 * DELETE /api/hospitals/:id
 * Admin-initiated forced deletion. Body: { password, reason }.
 */
router.delete("/:id", verifyAdmin, authLimiter, adminForceDelete);

export default router;
