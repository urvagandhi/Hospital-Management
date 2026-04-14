/**
 * Patient Routes
 * All patient-related endpoints
 */

import express from "express";
import { body, param } from "express-validator";
import * as patientController from "../controllers/patient.controller.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { patientLimiter } from "../middleware/rateLimiter.js";
import { handleValidationErrors } from "../middleware/validateRequest.js";
import Hospital from "../models/Hospital.js";
import { getUploadIdempotentResponse } from "../services/redis.service.js";
import { uploadDocument } from "../services/storage.service.js";

const router = express.Router();

// Lightweight middleware to reject deactivated hospitals
const verifyHospitalActive = async (req, res, next) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });
    const hospital = await Hospital.findById(hospitalId).select("isActive").lean();
    if (!hospital || !hospital.isActive) {
      return res.status(403).json({ success: false, message: "Hospital account is inactive" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Authorization check failed" });
  }
};

// Apply auth middleware to all routes
router.use(verifyAccessToken);
router.use(verifyHospitalActive);

/**
 * POST /api/patients
 * Create new patient
 */
router.post(
  "/",
  [
    body("patientName").notEmpty().trim().withMessage("Patient name is required"),
    body("remarks").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Remarks must be 500 characters or less"),
  ],
  handleValidationErrors,
  patientController.createPatient,
);

/**
 * GET /api/patients
 * Get all patients for logged-in hospital
 */
router.get("/", patientController.getPatients);

/**
 * GET /api/patients/:patientId
 * Get patient details with folder structure
 */
router.get(
  "/:patientId",
  [param("patientId").isMongoId().withMessage("Invalid patient ID")],
  handleValidationErrors,
  patientController.getPatientById,
);

/**
 * PUT /api/patients/:patientId
 * Update patient details
 */
router.put(
  "/:patientId",
  [
    param("patientId").isMongoId().withMessage("Invalid patient ID"),
    body("patientName").optional().notEmpty().trim().withMessage("Patient name cannot be empty"),
    body("remarks").optional({ values: "falsy" }).trim().isLength({ max: 500 }).withMessage("Remarks must be 500 characters or less"),
  ],
  handleValidationErrors,
  patientController.updatePatient,
);

/**
 * POST /api/patients/:patientId/folders
 * Create a new folder for patient
 */
router.post("/:patientId/folders", patientController.createFolder);

/**
 * GET /api/patients/:patientId/files/:folderName
 * Get files in specific folder
 */
router.get("/:patientId/files/:folderName", patientController.getFolderFiles);

// Short-circuits duplicate uploads (e.g. offline-sync retry after network drop)
// by returning the cached response before multer re-uploads bytes to Cloudinary.
const uploadIdempotencyGuard = async (req, res, next) => {
  const key = req.header("Idempotency-Key");
  if (!key) return next();
  try {
    const cached = await getUploadIdempotentResponse(req.hospital.id, key);
    if (cached && !cached.pending) {
      return res.status(cached.status || 200).json(cached.body);
    }
  } catch (err) {
    console.error("[uploadIdempotencyGuard]", err.message);
  }
  next();
};

/**
 * POST /api/patients/:patientId/files/:folderName
 * Upload file to folder
 */
router.post(
  "/:patientId/files/:folderName",
  uploadIdempotencyGuard,
  uploadDocument.single("file"),
  patientController.uploadFile,
);

/**
 * PATCH /api/patients/:patientId/files/:folderName/:fileId/rename
 * Rename a file in a folder
 */
router.patch("/:patientId/files/:folderName/:fileId/rename", patientController.renameFile);

/**
 * DELETE /api/patients/:patientId/files/:folderName/:fileId
 * Delete a file from a folder
 */
router.delete("/:patientId/files/:folderName/:fileId", patientController.deleteFile);

// ═══════════════════════════════════════════════════
// DOWNLOAD ENDPOINTS
// ═══════════════════════════════════════════════════

/** Check total size before ZIP download (returns folder breakdown if >10MB) */
router.get("/:patientId/download/zip/size-check", patientLimiter, patientController.zipSizeCheck);

/** Download all files as ZIP (POST — accepts optional selectedFolders in body) */
router.post("/:patientId/download/zip", patientLimiter, patientController.downloadAllZip);

/** Download all files as PDF (POST — accepts { mode: "merged" | "per-folder" }) */
router.post("/:patientId/download/pdf", patientLimiter, patientController.downloadAllPdf);

/** Download single folder as merged PDF */
router.get("/:patientId/folders/:folderName/download/pdf", patientLimiter, patientController.downloadFolderPdf);

/** Download single folder as flat ZIP */
router.get("/:patientId/folders/:folderName/download/zip", patientLimiter, patientController.downloadFolderZip);

// Keep legacy GET routes for backward compatibility
router.get("/:patientId/download/pdf", patientLimiter, patientController.downloadAllPdf);
router.get("/:patientId/download/zip", patientLimiter, patientController.downloadAllZip);
router.get("/:patientId/folders/:folderName/pdf", patientLimiter, patientController.downloadFolderPdf);
router.get("/:patientId/folders/:folderName/zip", patientLimiter, patientController.downloadFolderZip);

// Auto-delete is handled by the internal cron job (jobs/autoDelete.job.js),
// not exposed as an API endpoint to prevent unauthorized mass deletion.

export default router;
