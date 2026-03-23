/**
 * Patient Routes
 * All patient-related endpoints
 */

import express from "express";
import { body, param, query } from "express-validator";
import multer from "multer";
import path from "path";
import * as patientController from "../controllers/patient.controller.js";
import { verifyAccessToken } from "../middleware/auth.js";
import { handleValidationErrors } from "../middleware/validateRequest.js";
import Hospital from "../models/Hospital.js";
import { patientLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Allowed file types for patient documents
const patientFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|csv|txt|dicom|dcm/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const allowedMimes = /image\/|application\/pdf|application\/msword|application\/vnd\.|text\/|application\/dicom/;
  const mimetype = allowedMimes.test(file.mimetype);

  if (mimetype || extname) {
    return cb(null, true);
  }
  cb(new Error("File type not allowed. Allowed: images, PDF, DOC, XLSX, CSV, TXT, DICOM"));
};

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB max
  fileFilter: patientFileFilter,
});

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
    body("email").optional({ values: "falsy" }).isEmail().withMessage("Invalid email format"),
    body("phone").optional({ values: "falsy" }).trim(),
    body("medicalRecordNumber").optional({ values: "falsy" }).trim(),
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
    body("email").optional({ values: "falsy" }).isEmail().withMessage("Invalid email format"),
    body("phone").optional({ values: "falsy" }).trim(),
    body("medicalRecordNumber").optional({ values: "falsy" }).trim(),
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

// Auto-delete is handled by the internal cron job (jobs/autoDelete.job.js),
// not exposed as an API endpoint to prevent unauthorized mass deletion.

export default router;
