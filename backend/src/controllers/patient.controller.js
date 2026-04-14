/**
 * Patient Controller
 * Handles all patient-related operations
 */

import * as patientService from "../services/patient.service.js";
import * as r2Service from "../services/r2.service.js";
import { deleteFile as cloudinaryDeleteFile } from "../services/storage.service.js";
import * as pdfService from "../services/pdf.service.js";
import * as zipService from "../services/zip.service.js";
import AuditLog from "../models/AuditLog.js";

/** Fire-and-forget audit log — never blocks the response */
function logAudit(userId, action, req, details) {
  AuditLog.create({
    userId,
    action,
    status: "SUCCESS",
    ipAddress: req.ip || req.connection?.remoteAddress,
    userAgent: req.headers?.["user-agent"],
    details,
  }).catch((e) => console.error("[Audit] log failed:", e.message));
}

/**
 * POST /api/patients
 * Create new patient with auto-generated folders
 */
export const createPatient = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { patientName, remarks } = req.body;

    console.log("[Patient Controller] Creating patient:", patientName);

    const patient = await patientService.createPatient(hospitalId, {
      patientName,
      remarks,
    });

    return res.status(201).json({
      success: true,
      data: patient,
      message: "Patient created successfully",
    });
  } catch (error) {
    console.error("[Patient Controller] Create error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create patient",
    });
  }
};

/**
 * GET /api/patients
 * Get all patients for logged-in hospital with pagination and search
 */
export const getPatients = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { limit: rawLimit = 20, skip: rawSkip = 0, search } = req.query;

    // Clamp limit to 1-100 and skip to >= 0, default on NaN
    const parsedLimit = parseInt(rawLimit);
    const parsedSkip = parseInt(rawSkip);
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100);
    const skip = Number.isNaN(parsedSkip) ? 0 : Math.max(parsedSkip, 0);

    const { patients, total } = await patientService.getPatients(hospitalId, {
      limit,
      skip,
      search,
    });

    return res.status(200).json({
      success: true,
      data: {
        patients,
        total,
        limit,
        skip,
      },
    });
  } catch (error) {
    console.error("[Patient Controller] Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch patients",
    });
  }
};

/**
 * GET /api/patients/:patientId
 * Get patient details with folder structure
 */
export const getPatientById = async (req, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.hospital?.id;

    console.log("[Patient Controller] Fetching patient:", patientId);

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_VIEW", req, { patientId });

    return res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    console.error("[Patient Controller] Error:", error);
    return res.status(error.message === "Patient not found" ? 404 : 500).json({
      success: false,
      message: error.message === "Patient not found" ? error.message : "Failed to fetch patient",
    });
  }
};

/**
 * PUT /api/patients/:patientId
 * Update patient details
 */
export const updatePatient = async (req, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.hospital?.id;
    const { patientName, remarks } = req.body;

    console.log("[Patient Controller] Updating patient:", patientId);

    const patient = await patientService.updatePatient(hospitalId, patientId, {
      patientName,
      remarks,
    });

    return res.status(200).json({
      success: true,
      data: patient,
      message: "Patient updated successfully",
    });
  } catch (error) {
    console.error("[Patient Controller] Update error:", error);
    return res.status(error.message === "Patient not found" ? 404 : 500).json({
      success: false,
      message: error.message === "Patient not found" ? error.message : "Failed to update patient",
    });
  }
};

/**
 * POST /api/patients/:patientId/folders
 * Create a new folder for patient
 */
export const createFolder = async (req, res) => {
  try {
    const { patientId } = req.params;
    const { folderName } = req.body;
    const hospitalId = req.hospital?.id;

    if (!folderName || !folderName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Folder name is required",
      });
    }

    console.log("[Patient Controller] Creating folder:", folderName, "for patient:", patientId);

    const patient = await patientService.createFolder(hospitalId, patientId, folderName.trim());

    return res.status(201).json({
      success: true,
      data: patient,
      message: "Folder created successfully",
    });
  } catch (error) {
    console.error("[Patient Controller] Create folder error:", error);
    return res.status(error.message === "Patient not found" ? 404 : 500).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * GET /api/patients/:patientId/files/:folderName
 * Get files in specific folder
 */
export const getFolderFiles = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;

    console.log("[Patient Controller] Fetching files for folder:", folderName);

    const folder = await patientService.getFolderFiles(hospitalId, patientId, folderName);

    return res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    console.error("[Patient Controller] Error:", error);
    const isNotFound = error.message.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to fetch folder files",
    });
  }
};

/**
 * POST /api/patients/:patientId/files/:folderName
 * Upload file to patient folder
 */
export const uploadFile = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded",
      });
    }

    // Sanitize folderName — allow only alphanumeric, hyphens, underscores, spaces, dots
    if (!/^[a-zA-Z0-9_\-\.\s]+$/.test(folderName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid folder name. Use only letters, numbers, hyphens, underscores, and dots.",
      });
    }

    // multer-storage-cloudinary merges Cloudinary's response into req.file.
    // Depending on the library version the URL lives in .secure_url or .path,
    // and the public ID in .public_id or .filename.
    const cloudinaryUrl = file.secure_url || file.path;
    const cloudinaryPublicId = file.public_id || file.filename;

    console.log("[Patient Controller] File uploaded to Cloudinary:", cloudinaryUrl);

    // Update patient record — store the Cloudinary URL directly
    const patient = await patientService.addFileToFolder(hospitalId, patientId, folderName, {
      fileName: file.originalname,
      fileUrl: cloudinaryUrl,
      cloudinaryPublicId: cloudinaryPublicId,
      size: file.size || file.bytes,
      mimeType: file.mimetype,
    });

    return res.status(200).json({
      success: true,
      data: patient,
      message: "File uploaded successfully",
    });
  } catch (error) {
    console.error("[Patient Controller] Upload error:", error);
    return res.status(error.message === "Patient not found" || error.message === "Folder not found" ? 404 : 500).json({
      success: false,
      message: error.message === "Patient not found" || error.message === "Folder not found" ? error.message : "Failed to upload file",
    });
  }
};

/**
 * PATCH /api/patients/:patientId/files/:folderName/:fileId/rename
 * Rename a file in a patient folder
 */
export const renameFile = async (req, res) => {
  try {
    const { patientId, folderName, fileId } = req.params;
    const { newFileName } = req.body;
    const hospitalId = req.hospital?.id;

    if (!newFileName || !newFileName.trim()) {
      return res.status(400).json({
        success: false,
        message: "New file name is required",
      });
    }

    const patient = await patientService.renameFile(hospitalId, patientId, folderName, fileId, newFileName.trim());

    return res.status(200).json({
      success: true,
      data: patient,
      message: "File renamed successfully",
    });
  } catch (error) {
    console.error("[Patient Controller] Rename error:", error);
    const isNotFound = error.message.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to rename file",
    });
  }
};

/**
 * GET /api/patients/:patientId/download/zip/size-check
 * Check total file size before downloading ZIP.
 * Returns folder breakdown so frontend can show picker if over 10MB.
 */
export const zipSizeCheck = async (req, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.hospital?.id;
    const patient = await patientService.getPatientById(hospitalId, patientId);
    const result = zipService.checkSize(patient);
    return res.status(200).json({ success: true, ...result });
  } catch (error) {
    console.error("[Patient Controller] Size check error:", error);
    if (!res.headersSent) {
      return res.status(error.message === "Patient not found" ? 404 : 500).json({
        success: false,
        message: error.message === "Patient not found" ? error.message : "Size check failed",
      });
    }
  }
};

/**
 * POST /api/patients/:patientId/download/zip
 * Download all files as ZIP (optionally filtered by selectedFolders).
 * Body: { selectedFolders?: ["Id", "Reports"] }
 */
export const downloadAllZip = async (req, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.hospital?.id;
    const { selectedFolders } = req.body || {};

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_EXPORT_ZIP", req, { patientId, selectedFolders: selectedFolders || "all" });

    req.setTimeout(300000);
    res.setTimeout(300000);

    await zipService.generatePatientZip(patient, res, selectedFolders || null);
  } catch (error) {
    console.error("[Patient Controller] ZIP error:", error);
    if (!res.headersSent) {
      return res.status(error.message === "Patient not found" ? 404 : 500).json({
        success: false,
        message: error.message === "Patient not found" ? error.message : "Failed to generate ZIP",
      });
    }
  }
};

/**
 * POST /api/patients/:patientId/download/pdf
 * Download patient files as PDF.
 * Body: { mode: "merged" | "per-folder" }
 *   merged    → one big PDF with section headers per folder
 *   per-folder → one PDF per folder, bundled in a ZIP
 */
export const downloadAllPdf = async (req, res) => {
  try {
    const { patientId } = req.params;
    const hospitalId = req.hospital?.id;
    const { mode } = req.body || {};

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, { patientId, mode: mode || "merged" });

    req.setTimeout(300000);
    res.setTimeout(300000);

    if (mode === "per-folder") {
      await pdfService.generatePatientPdfPerFolder(patient, res);
    } else {
      await pdfService.generatePatientPdfMerged(patient, res);
    }
  } catch (error) {
    console.error("[Patient Controller] PDF error:", error);
    if (!res.headersSent) {
      return res.status(error.message === "Patient not found" ? 404 : 500).json({
        success: false,
        message: error.message === "Patient not found" ? error.message : "Failed to generate PDF",
      });
    }
  }
};

/**
 * GET /api/patients/:patientId/folders/:folderName/download/pdf
 * Merge all PDFs in a folder into a single PDF with cover page.
 */
export const downloadFolderPdf = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, { patientId, folderName });

    req.setTimeout(300000);
    res.setTimeout(300000);

    await pdfService.generateFolderPdf(patient, folderName, res);
  } catch (error) {
    console.error("[Patient Controller] Folder PDF error:", error);
    if (!res.headersSent) {
      const isNotFound = error.message.includes("not found");
      return res.status(isNotFound ? 404 : 500).json({
        success: false,
        message: isNotFound ? error.message : "Failed to generate folder PDF",
      });
    }
  }
};

/**
 * GET /api/patients/:patientId/folders/:folderName/download/zip
 * Download all files in a folder as a flat ZIP.
 */
export const downloadFolderZip = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_EXPORT_ZIP", req, { patientId, folderName });

    req.setTimeout(300000);
    res.setTimeout(300000);

    await zipService.generateFolderZip(patient, folderName, res);
  } catch (error) {
    console.error("[Patient Controller] Folder ZIP error:", error);
    if (!res.headersSent) {
      const isNotFound = error.message.includes("not found");
      return res.status(isNotFound ? 404 : 500).json({
        success: false,
        message: isNotFound ? error.message : "Failed to generate folder ZIP",
      });
    }
  }
};

/**
 * Helper function to format file size
 */
function formatFileSize(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default {
  createPatient,
  getPatients,
  getPatientById,
  getFolderFiles,
  uploadFile,
  downloadAllPdf,
  downloadFolderPdf,
  downloadAllZip,
  downloadFolderZip,
};
