/**
 * Hospitals Routes
 * Defines all hospital management endpoints
 */

import express from "express";
import { getAllHospitals, getCurrentHospital, getHospitalById, updateHospital } from "../controllers/hospitals.controller.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { uploadSingle } from "../middleware/upload.js";

const router = express.Router();

// Apply auth middleware to all routes
router.use(verifyAccessToken);

/**
 * GET /api/hospitals
 * Get all hospitals
 */
router.get("/", getAllHospitals);

/**
 * GET /api/hospitals/me
 * Get current authenticated hospital
 */
router.get("/me", getCurrentHospital);

/**
 * GET /api/hospitals/:id
 * Get hospital by ID
 */
router.get("/:id", getHospitalById);

/**
 * PUT /api/hospitals/:id
 * Update hospital details (with optional logo upload)
 */
router.put("/:id", uploadSingle("logo"), updateHospital);

export default router;
