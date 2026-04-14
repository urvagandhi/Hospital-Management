/**
 * Hospitals Routes
 * Defines all hospital management endpoints
 */

import express from "express";
import { getAllHospitals, getCurrentHospital, getHospitalById, updateHospital, resendWelcomeEmail } from "../controllers/hospitals.controller.js";
import { verifyAccessToken, verifyAdmin, verifyAdminOrSelf } from "../middleware/auth.js";
import { uploadSingle } from "../middleware/upload.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyAccessToken);

/**
 * GET /api/hospitals/me
 * Get current authenticated hospital (must be before /:id)
 */
router.get("/me", getCurrentHospital);

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

export default router;
