/**
 * Export Routes
 * PDF generation for hospital-side reports.
 */

import express from "express";
import { verifyAccessToken } from "../middleware/auth.js";
import rateLimit from "express-rate-limit";
import { exportPatientsPdf } from "../controllers/export.controller.js";

const router = express.Router();

// Rate limit: max 3 export requests per user per hour
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: "Too many export requests. Please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.hospital?.id || req.ip,
});

/**
 * GET /api/export/patients/pdf
 * Stream patients list directly as PDF
 */
router.get(
  "/patients/pdf",
  verifyAccessToken,
  exportLimiter,
  exportPatientsPdf,
);

export default router;
