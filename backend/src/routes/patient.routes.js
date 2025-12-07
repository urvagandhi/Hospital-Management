/**
 * Patient Routes
 * All patient-related endpoints
 */

import express from "express";
import multer from "multer";
import * as patientController from "../controllers/patient.controller.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { patientLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Apply auth middleware to all routes
router.use(verifyAccessToken);

/**
 * POST /api/patients
 * Create new patient
 */
router.post("/", patientController.createPatient);

/**
 * GET /api/patients
 * Get all patients for logged-in hospital
 */
router.get("/", patientController.getPatients);

/**
 * GET /api/patients/:patientId
 * Get patient details with folder structure
 */
router.get("/:patientId", patientController.getPatientById);

/**
 * PUT /api/patients/:patientId
 * Update patient details
 */
router.put("/:patientId", patientController.updatePatient);

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

/**
 * POST /api/patients/:patientId/files/:folderName
 * Upload file to folder
 */
router.post("/:patientId/files/:folderName", upload.single("file"), patientController.uploadFile);

/**
 * GET /api/patients/:patientId/download/pdf
 * Download all files as PDF
 */
router.get("/:patientId/download/pdf", patientLimiter, patientController.downloadAllPdf);

/**
 * GET /api/patients/:patientId/folders/:folderName/pdf
 * Download folder-wise PDF
 */
router.get("/:patientId/folders/:folderName/pdf", patientLimiter, patientController.downloadFolderPdf);

/**
 * GET /api/patients/:patientId/download/zip
 * Download all files as ZIP
 */
router.get("/:patientId/download/zip", patientLimiter, patientController.downloadAllZip);

/**
 * GET /api/patients/:patientId/folders/:folderName/zip
 * Download folder-wise ZIP
 */
router.get("/:patientId/folders/:folderName/zip", patientLimiter, patientController.downloadFolderZip);

/**
 * DELETE /api/patients/autodelete
 * Auto-delete patients older than 90 days (cron job)
 * Note: This should only be called by cron job, not exposed to API
 */
router.delete("/autodelete", patientController.autoDelete);

export default router;
