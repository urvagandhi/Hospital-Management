/**
 * Export Routes
 * PDF generation and ZIP archive for multiple modules
 */

import express from "express";
import { body } from "express-validator";
import { verifyAccessToken, verifyAdmin } from "../middleware/auth.js";
import { handleValidationErrors } from "../middleware/validateRequest.js";
import rateLimit from "express-rate-limit";
import { exportArchive } from "../controllers/export.controller.js";

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
 * POST /api/export/archive
 * Generate PDFs for selected modules, compress into ZIP, stream to client
 * Auth: admin or export role required
 */
router.post(
  "/archive",
  verifyAccessToken,
  exportLimiter,
  [
    body("modules")
      .isArray({ min: 1 })
      .withMessage("modules must be a non-empty array of module identifiers"),
  ],
  handleValidationErrors,
  exportArchive,
);

export default router;
