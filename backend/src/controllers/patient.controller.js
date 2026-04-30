/**
 * Patient Controller
 * Handles all patient-related operations
 */

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import config from "../config/env.js";
import AuditLog from "../models/AuditLog.js";
import * as compressionService from "../services/compression.service.js";
import * as patientService from "../services/patient.service.js";
import * as pdfService from "../services/pdf.service.js";
import { setUploadIdempotentResponse } from "../services/redis.service.js";
import {
  buildSignedUrl,
  buildThumbnailUrl,
  deleteFile as cloudinaryDeleteFile,
  generateSignedUploadParams,
  SIGNED_UPLOADS_ENABLED,
} from "../services/storage.service.js";
import * as zipService from "../services/zip.service.js";
import getClientIp from "../utils/clientIp.js";
import logger from "../utils/logger.js";

const USE_COMPRESSION = config.USE_COMPRESSION_SERVICE;

/** Fire-and-forget audit log — never blocks the response */
function logAudit(userId, action, req, details) {
  AuditLog.create({
    userId,
    action,
    status: "SUCCESS",
    ipAddress: getClientIp(req),
    userAgent: req.headers?.["user-agent"],
    details,
  }).catch((e) => logger.error({ event: "audit_log_failed", err: e }, "[Audit] log failed"));
}

/**
 * POST /api/patients
 * Create new patient with auto-generated folders
 */
export const createPatient = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { patientName, remarks } = req.body;

    req.log.info({ event: "patient_create_attempt", patientName }, "[Patient Controller] Creating patient");

    const patient = await patientService.createPatient(hospitalId, {
      patientName,
      remarks,
    });

    logAudit(hospitalId, "PATIENT_CREATED", req, {
      patientMongoId: String(patient._id),
      patientId: patient.patientId,
      patientName: patient.patientName,
      hasRemarks: Boolean(patient.remarks),
    });

    return res.status(201).json({
      success: true,
      data: patient,
      message: "Patient created successfully",
    });
  } catch (error) {
    req.log.error({ event: "patient_create_error", err: error }, "[Patient Controller] Create error");
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
    const {
      limit: rawLimit = 20,
      skip: rawSkip = 0,
      cursor: rawCursor,
      search,
      createdFrom: rawCreatedFrom,
      createdTo: rawCreatedTo,
      hasRemarks: rawHasRemarks,
    } = req.query;

    // Clamp limit to 1-100 and skip to >= 0, default on NaN
    const parsedLimit = parseInt(rawLimit);
    const parsedSkip = parseInt(rawSkip);
    const limit = Number.isNaN(parsedLimit) ? 20 : Math.min(Math.max(parsedLimit, 1), 100);
    const skip = Number.isNaN(parsedSkip) ? 0 : Math.max(parsedSkip, 0);

    // Parse date range (ignore unparseable values silently; do not 400)
    const parseDate = (raw) => {
      if (!raw) return undefined;
      const d = new Date(raw);
      return Number.isNaN(d.getTime()) ? undefined : d;
    };
    const createdFrom = parseDate(rawCreatedFrom);
    const createdTo = parseDate(rawCreatedTo);

    // Clamp hasRemarks to a safe enum
    const hasRemarks =
      rawHasRemarks === "yes" || rawHasRemarks === "no" ? rawHasRemarks : undefined;

    const cursor = typeof rawCursor === "string" && rawCursor.trim() ? rawCursor.trim() : undefined;

    const { patients, total, hasMore, nextCursor } = await patientService.getPatients(hospitalId, {
      limit,
      skip,
      cursor,
      search,
      createdFrom,
      createdTo,
      hasRemarks,
    });

    return res.status(200).json({
      success: true,
      data: {
        patients,
        total,
        limit,
        skip,
        hasMore,
        nextCursor,
        cursor: cursor || null,
      },
    });
  } catch (error) {
    req.log.error({ event: "patients_list_error", err: error }, "[Patient Controller] Error");
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

    req.log.info({ event: "patient_fetch", patientId }, "[Patient Controller] Fetching patient");

    const patient = await patientService.getPatientById(hospitalId, patientId);

    logAudit(hospitalId, "PATIENT_VIEW", req, { patientId });

    return res.status(200).json({
      success: true,
      data: patient,
    });
  } catch (error) {
    req.log.error({ event: "patient_fetch_error", err: error }, "[Patient Controller] Error");
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

    req.log.info({ event: "patient_update_attempt", patientId }, "[Patient Controller] Updating patient");

    const patient = await patientService.updatePatient(hospitalId, patientId, {
      patientName,
      remarks,
    });

    const changedFields = [];
    if (patientName !== undefined) changedFields.push("patientName");
    if (remarks !== undefined) changedFields.push("remarks");

    logAudit(hospitalId, "PATIENT_UPDATED", req, {
      patientId,
      patientMongoId: String(patient._id),
      humanPatientId: patient.patientId,
      changedFields,
    });

    return res.status(200).json({
      success: true,
      data: patient,
      message: "Patient updated successfully",
    });
  } catch (error) {
    req.log.error({ event: "patient_update_error", err: error }, "[Patient Controller] Update error");
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

    req.log.info({ event: "folder_create_attempt", folderName, patientId }, "[Patient Controller] Creating folder");

    const patient = await patientService.createFolder(hospitalId, patientId, folderName.trim());

    logAudit(hospitalId, "FOLDER_CREATED", req, {
      patientId,
      patientMongoId: String(patient._id),
      humanPatientId: patient.patientId,
      folderName: folderName.trim(),
    });

    return res.status(201).json({
      success: true,
      data: patient,
      message: "Folder created successfully",
    });
  } catch (error) {
    req.log.error({ event: "folder_create_error", err: error }, "[Patient Controller] Create folder error");
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

    req.log.info({ event: "folder_files_fetch", folderName }, "[Patient Controller] Fetching files for folder");

    const folder = await patientService.getFolderFiles(hospitalId, patientId, folderName);

    return res.status(200).json({
      success: true,
      data: folder,
    });
  } catch (error) {
    req.log.error({ event: "folder_files_fetch_error", err: error }, "[Patient Controller] Error");
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

    // Sanitize folderName — allow alphanumeric, hyphens, underscores, spaces, dots, commas, parentheses
    if (!/^[a-zA-Z0-9_\-\.\s,()\/]+$/.test(folderName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid folder name. Use only letters, numbers, hyphens, underscores, dots, and commas.",
      });
    }

    // multer-storage-cloudinary merges Cloudinary's response into req.file.
    // Depending on the library version the URL lives in .secure_url or .path,
    // and the public ID in .public_id or .filename.
    const cloudinaryUrl = file.secure_url || file.path;
    const cloudinaryPublicId = file.public_id || file.filename;
    const isImage = (file.mimetype || "").startsWith("image/");
    const resourceType = isImage ? "image" : "raw";
    const accessMode = SIGNED_UPLOADS_ENABLED ? "signed" : "public";
    const thumbnailUrl = isImage
      ? buildThumbnailUrl({ publicId: cloudinaryPublicId, resourceType, accessMode })
      : null;

    req.log.info({ event: "file_uploaded_cloudinary", cloudinaryUrl }, "[Patient Controller] File uploaded to Cloudinary");

    // Update patient record — store the Cloudinary URL directly
    const patient = await patientService.addFileToFolder(hospitalId, patientId, folderName, {
      fileName: file.originalname,
      fileUrl: cloudinaryUrl,
      cloudinaryPublicId: cloudinaryPublicId,
      thumbnailUrl,
      resourceType,
      accessMode,
      size: file.size || file.bytes,
      mimeType: file.mimetype,
    });

    const responseBody = {
      success: true,
      data: patient,
      message: "File uploaded successfully",
    };

    logAudit(hospitalId, "FILE_UPLOADED", req, {
      patientId,
      patientMongoId: String(patient._id),
      humanPatientId: patient.patientId,
      folderName,
      fileName: file.originalname,
      size: file.size || file.bytes,
      mimeType: file.mimetype,
      accessMode,
      resourceType,
    });

    // Cache the response against the client's Idempotency-Key so an offline-sync
    // retry for the *same* logical upload returns the original result instead of
    // creating a duplicate file entry on the patient record.
    const idemKey = req.header("Idempotency-Key");
    if (idemKey) {
      setUploadIdempotentResponse(hospitalId, idemKey, { status: 200, body: responseBody })
        .catch((e) => req.log.error({ event: "upload_idem_cache_failed", err: e }, "[Patient Controller] idem cache failed"));
    }

    return res.status(200).json(responseBody);
  } catch (error) {
    req.log.error({ event: "file_upload_error", err: error }, "[Patient Controller] Upload error");
    return res.status(error.message === "Patient not found" || error.message === "Folder not found" ? 404 : 500).json({
      success: false,
      message: error.message === "Patient not found" || error.message === "Folder not found" ? error.message : "Failed to upload file",
    });
  }
};

/**
 * POST /api/patients/:patientId/files/:folderName/sign
 * Mint signed Cloudinary upload params so the client can upload directly
 * to Cloudinary, bypassing the Express/Render proxy entirely.
 *
 * Response: { success, params: { uploadUrl, apiKey, signature, timestamp, publicId, ... } }
 */
export const signUpload = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;
    const { fileName } = req.body;

    req.log.info(
      { event: "sign_upload_attempt", patientId, folderName, fileName },
      "[Patient Controller] Generating signed upload params"
    );

    // Validate folder name — same regex as the proxy upload route
    if (!/^[a-zA-Z0-9_\-\.\s,()\/]+$/.test(folderName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid folder name.",
      });
    }

    // Verify patient exists and belongs to this hospital
    const patient = await patientService.getPatientById(hospitalId, patientId);
    if (!patient) {
      return res.status(404).json({ success: false, message: "Patient not found" });
    }

    const params = generateSignedUploadParams(hospitalId, patientId, folderName, fileName);

    req.log.info(
      { event: "sign_upload_success", publicId: params.publicId },
      "[Patient Controller] Signed upload params generated"
    );

    return res.status(200).json({ success: true, params });
  } catch (error) {
    req.log.error({ event: "sign_upload_error", err: error }, "[Patient Controller] Sign error");
    const isNotFound = error.message?.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to generate upload params",
    });
  }
};

/**
 * POST /api/patients/:patientId/files/:folderName/confirm
 * After the client uploads directly to Cloudinary, it calls this endpoint
 * with the Cloudinary response so we can persist the file metadata on the
 * patient record — same DB write as the old proxy uploadFile handler.
 *
 * Body: { publicId, secureUrl, originalFileName, size, mimeType }
 */
export const confirmDirectUpload = async (req, res) => {
  try {
    const { patientId, folderName } = req.params;
    const hospitalId = req.hospital?.id;
    const { publicId, secureUrl, originalFileName, size, mimeType } = req.body;

    req.log.info(
      { event: "confirm_direct_upload", patientId, folderName, publicId, originalFileName, size },
      "[Patient Controller] Confirming direct upload"
    );

    if (!publicId || !secureUrl) {
      return res.status(400).json({
        success: false,
        message: "publicId and secureUrl are required",
      });
    }

    // Validate folder name
    if (!/^[a-zA-Z0-9_\-\.\s,()\/]+$/.test(folderName)) {
      return res.status(400).json({
        success: false,
        message: "Invalid folder name.",
      });
    }

    const isImage = (mimeType || "").startsWith("image/");
    const resourceType = isImage ? "image" : "raw";
    const accessMode = SIGNED_UPLOADS_ENABLED ? "signed" : "public";
    const thumbnailUrl = isImage
      ? buildThumbnailUrl({ publicId, resourceType, accessMode })
      : null;

    const patient = await patientService.addFileToFolder(hospitalId, patientId, folderName, {
      fileName: originalFileName || "document.pdf",
      fileUrl: secureUrl,
      cloudinaryPublicId: publicId,
      thumbnailUrl,
      resourceType,
      accessMode,
      size: size || 0,
      mimeType: mimeType || "application/pdf",
    });

    const responseBody = {
      success: true,
      data: patient,
      message: "File uploaded successfully",
    };

    logAudit(hospitalId, "FILE_UPLOADED", req, {
      patientId,
      patientMongoId: String(patient._id),
      humanPatientId: patient.patientId,
      folderName,
      fileName: originalFileName,
      size,
      mimeType,
      accessMode,
      resourceType,
      uploadMethod: "direct-to-cloudinary",
    });

    // Cache idempotent response
    const idemKey = req.header("Idempotency-Key");
    if (idemKey) {
      setUploadIdempotentResponse(hospitalId, idemKey, { status: 200, body: responseBody })
        .catch((e) => req.log.error({ event: "upload_idem_cache_failed", err: e }, "[Patient Controller] idem cache failed"));
    }

    req.log.info(
      { event: "confirm_direct_upload_success", patientId, folderName, publicId },
      "[Patient Controller] Direct upload confirmed and saved"
    );

    return res.status(200).json(responseBody);
  } catch (error) {
    req.log.error({ event: "confirm_direct_upload_error", err: error }, "[Patient Controller] Confirm error");
    const isNotFound = error.message === "Patient not found" || error.message === "Folder not found";
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to confirm upload",
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

    logAudit(hospitalId, "FILE_RENAMED", req, {
      patientId,
      patientMongoId: String(patient._id),
      humanPatientId: patient.patientId,
      folderName,
      fileId,
      newFileName: newFileName.trim(),
    });

    return res.status(200).json({
      success: true,
      data: patient,
      message: "File renamed successfully",
    });
  } catch (error) {
    req.log.error({ event: "file_rename_error", err: error }, "[Patient Controller] Rename error");
    const isNotFound = error.message.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to rename file",
    });
  }
};

/**
 * DELETE /api/patients/:patientId/files/:folderName/:fileId
 * Delete a file in a patient folder
 */
export const deleteFile = async (req, res) => {
  try {
    const { patientId, folderName, fileId } = req.params;
    const hospitalId = req.hospital?.id;

    const { patient, deletedFile } = await patientService.deleteFileFromFolder(hospitalId, patientId, folderName, fileId);

    // Best effort remote cleanup; don't fail the API if Cloudinary cleanup fails.
    if (deletedFile?.cloudinaryPublicId) {
      const resourceType = deletedFile.resourceType || "image";
      const remoteDeleteResult = await cloudinaryDeleteFile(deletedFile.cloudinaryPublicId, resourceType);
      if (!remoteDeleteResult.success) {
        req.log.warn(
          { event: "cloudinary_cleanup_failed", cleanup_error: remoteDeleteResult.error },
          "[Patient Controller] Cloudinary cleanup failed",
        );
      }
    }

    logAudit(hospitalId, "PATIENT_FILE_DELETE", req, {
      patientId,
      folderName,
      fileId,
      fileName: deletedFile?.fileName,
    });

    return res.status(200).json({
      success: true,
      data: patient,
      message: "File deleted successfully",
    });
  } catch (error) {
    req.log.error({ event: "file_delete_error", err: error }, "[Patient Controller] Delete file error");
    const isNotFound = error.message.includes("not found");
    return res.status(isNotFound ? 404 : 500).json({
      success: false,
      message: isNotFound ? error.message : "Failed to delete file",
    });
  }
};

/**
 * GET /api/patients/:patientId/files/:folderName/:fileId/signed-url
 * B5: Returns a short-lived signed URL for secure file access. Falls back to
 *     the stored public URL for legacy files (accessMode = 'public').
 */
export const getFileSignedUrl = async (req, res) => {
  try {
    const { patientId, folderName, fileId } = req.params;
    const hospitalId = req.hospital?.id;
    const download = String(req.query.download || "").toLowerCase() === "true";

    const patient = await patientService.getPatientById(hospitalId, patientId);
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    const file = folder.files.id ? folder.files.id(fileId) : folder.files.find((f) => String(f._id) === String(fileId));
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    // Legacy public files — return the stored URL unchanged.
    if (file.accessMode !== "signed") {
      return res.json({
        success: true,
        data: {
          url: file.fileUrl,
          expiresIn: null,
          accessMode: "public",
        },
      });
    }

    const signed = buildSignedUrl({
      publicId: file.cloudinaryPublicId,
      resourceType: file.resourceType || "image",
      ttlSeconds: 300,
      attachment: download,
      fileName: download ? file.fileName : null,
    });

    logAudit(hospitalId, "PATIENT_VIEW", req, { patientId, folderName, fileId, signed: true });

    return res.json({
      success: true,
      data: { url: signed, expiresIn: 300, accessMode: "signed" },
    });
  } catch (err) {
    req.log.error({ event: "signed_url_error", err }, "[Patient Controller] signed-url error");
    return res.status(500).json({ success: false, message: "Failed to build signed URL" });
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
    req.log.error({ event: "zip_size_check_error", err: error }, "[Patient Controller] Size check error");
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
    req.log.error({ event: "patient_zip_error", err: error }, "[Patient Controller] ZIP error");
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

    if (!USE_COMPRESSION) {
      if (mode === "per-folder") {
        await pdfService.generatePatientPdfPerFolder(patient, res);
      } else {
        await pdfService.generatePatientPdfMerged(patient, res);
      }
      return;
    }

    // ── Compression service path ──
    const start = Date.now();
    const foldersWithFiles = patient.folders.filter((f) => f.files.length > 0);

    // Helper: build source_pdfs + files_info for a folder
    const buildFolderPayload = (folder) => ({
      folderId: String(folder._id),
      displayName: folder.name,
      patientName: patient.patientName,
      sourcePdfs: folder.files
        .filter((f) => f.cloudinaryPublicId)
        .map((f) => ({
          public_id: f.cloudinaryPublicId,
          uploaded_at: (f.uploadedAt || f.createdAt || new Date()).toISOString(),
          resource_type: f.resourceType || "image",
          access_mode: f.accessMode || "signed",
        })),
      filesInfo: folder.files.map((f) => ({
        file_name: f.fileName,
        page_count: f.pageCount ?? null,
      })),
    });

    if (mode === "per-folder") {
      // Compress each folder in parallel
      const folderResults = await Promise.all(
        foldersWithFiles.map((folder) => {
          const payload = buildFolderPayload(folder);
          return compressionService.compressFolder({
            ...payload,
            userId: String(hospitalId),
            patientId: String(patient._id),
          });
        }),
      );

      // Fetch all merged PDFs from Cloudinary in parallel
      const fetchResults = await Promise.all(
        folderResults.map(async (result, i) => {
          const upstream = await compressionService.fetchMergedStream(result.merged_url);
          return {
            name: `${foldersWithFiles[i].name}.pdf`,
            buffer: Buffer.from(await upstream.arrayBuffer()),
          };
        }),
      );

      // Zip all folder PDFs in original order
      const { default: archiver } = await import("archiver");
      const safeName = encodeURIComponent(`${patient.patientName}_records_by_folder.zip`);
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);

      const archive = archiver("zip", { zlib: { level: 9 } });
      archive.pipe(res);

      for (const { name, buffer } of fetchResults) {
        archive.append(buffer, { name });
      }

      logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, {
        patientId, mode: "per-folder", compressed: true,
        folder_count: folderResults.length,
        content_hashes: folderResults.map((r) => r.content_hash),
        duration_ms: Date.now() - start,
      });

      await archive.finalize();
    } else {
      // Merged mode — single compressed PDF with cover pages
      const folderMap = foldersWithFiles.map((folder) => {
        const payload = buildFolderPayload(folder);
        return {
          folder_id: payload.folderId,
          display_name: payload.displayName,
          patient_name: payload.patientName,
          source_pdfs: payload.sourcePdfs,
          files_info: payload.filesInfo,
        };
      });

      const result = await compressionService.compressPatient({
        patientId: String(patient._id),
        userId: String(hospitalId),
        patientName: patient.patientName,
        folderMap,
      });

      logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, {
        patientId, mode: "merged", compressed: true,
        content_hash: result.content_hash,
        tier_used: result.tier_used, cache_hit: result.cache_hit,
        final_size_bytes: result.final_size_bytes,
        duration_ms: Date.now() - start,
      });

      const upstream = await compressionService.fetchMergedStream(result.merged_url);
      const safeName = encodeURIComponent(`${patient.patientName}_all_records.pdf`);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      if (result.final_size_bytes > 0) res.setHeader("Content-Length", result.final_size_bytes);

      await pipeline(Readable.fromWeb(upstream.body), res);
    }
  } catch (error) {
    if (!res.headersSent) handleCompressionError(error, res, "Patient PDF");
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

    if (!USE_COMPRESSION) {
      await pdfService.generateFolderPdf(patient, folderName, res);
      return;
    }

    // ── Compression service path ──
    const folder = patient.folders.find(
      (f) => f.name.toLowerCase() === folderName.toLowerCase(),
    );
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    const sourcePdfs = folder.files
      .filter((f) => f.cloudinaryPublicId)
      .map((f) => ({
        public_id: f.cloudinaryPublicId,
        uploaded_at: (f.uploadedAt || f.createdAt || new Date()).toISOString(),
        resource_type: f.resourceType || "image",
        access_mode: f.accessMode || "signed",
      }));

    if (sourcePdfs.length === 0) {
      return res.status(400).json({ success: false, message: "No files in folder" });
    }

    const filesInfo = folder.files.map((f) => ({
      file_name: f.fileName,
      page_count: f.pageCount ?? null,
    }));

    const start = Date.now();
    const result = await compressionService.compressFolder({
      folderId: String(folder._id),
      userId: String(hospitalId),
      patientId: String(patient._id),
      patientName: patient.patientName,
      displayName: folder.name,
      filesInfo,
      sourcePdfs,
    });

    logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, {
      patientId, folderName, compressed: true,
      content_hash: result.content_hash,
      tier_used: result.tier_used, cache_hit: result.cache_hit,
      final_size_bytes: result.final_size_bytes,
      duration_ms: Date.now() - start,
    });

    const upstream = await compressionService.fetchMergedStream(result.merged_url);
    const safeName = encodeURIComponent(`${patient.patientName}_${folderName}.pdf`);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    if (result.final_size_bytes > 0) res.setHeader("Content-Length", result.final_size_bytes);

    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) handleCompressionError(error, res, "Folder PDF");
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
    req.log.error({ event: "folder_zip_error", err: error }, "[Patient Controller] Folder ZIP error");
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

/**
 * Shared error handler for compression service errors.
 * Maps custom error classes to HTTP status codes.
 */
function handleCompressionError(error, res, context) {
  // Non-compression errors (Patient not found, etc.) — preserve existing behavior
  if (error.message?.includes("not found")) {
    return res.status(404).json({ success: false, message: error.message });
  }

  if (error instanceof compressionService.SizeFloorError) {
    return res.status(413).json({
      success: false,
      error: "size_floor_breached",
      min_achievable_mb: error.minAchievableMb,
      detail: "Even at maximum compression, file exceeds target. Try per-folder mode or deselect folders.",
    });
  }
  if (error instanceof compressionService.SourceFetchError) {
    return res.status(502).json({
      success: false,
      error: "source_unavailable",
      detail: "Could not fetch source PDF from storage",
    });
  }
  if (error instanceof compressionService.ServiceTimeoutError) {
    return res.status(504).json({
      success: false,
      error: "compression_timeout",
      detail: "Compression took too long. Try per-folder mode.",
    });
  }
  if (error instanceof compressionService.ServiceUnavailableError) {
    return res.status(503).json({
      success: false,
      error: "service_unavailable",
      detail: "Compression service temporarily down. Try again in a moment.",
    });
  }

  // Fallback for unexpected errors
  logger.error({ event: "compression_unexpected_error", context, err: error }, `[Patient Controller] ${context} error`);
  return res.status(500).json({ success: false, message: `Failed to generate ${context}` });
}

/**
 * GET /api/patients/:patientId/files/:folderName/:fileId/compressed
 * Compress a single file via the compression service and stream it back.
 * Falls back to the existing /stream endpoint behavior when flag is off.
 */
export const downloadFileCompressed = async (req, res) => {
  try {
    const { patientId, folderName, fileId } = req.params;
    const hospitalId = req.hospital?.id;

    const patient = await patientService.getPatientById(hospitalId, patientId);
    if (!patient) return res.status(404).json({ success: false, message: "Patient not found" });

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) return res.status(404).json({ success: false, message: "Folder not found" });

    const file = folder.files.id
      ? folder.files.id(fileId)
      : folder.files.find((f) => String(f._id) === String(fileId));
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    if (!file.cloudinaryPublicId) {
      return res.status(400).json({ success: false, message: "File has no cloud storage ID" });
    }

    if (!USE_COMPRESSION) {
      // Fallback: proxy the raw file from Cloudinary (same as /stream)
      let fetchUrl = file.fileUrl;
      if (file.accessMode === "signed" && file.cloudinaryPublicId) {
        fetchUrl = buildSignedUrl({
          publicId: file.cloudinaryPublicId,
          resourceType: file.resourceType || "raw",
          ttlSeconds: 120,
        });
      }
      const upstream = await fetch(fetchUrl);
      if (!upstream.ok) return res.status(502).json({ success: false, message: "Failed to fetch file" });

      const safeName = encodeURIComponent(file.fileName);
      res.setHeader("Content-Type", file.mimeType || "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
      const contentLength = upstream.headers.get("content-length");
      if (contentLength) res.setHeader("Content-Length", contentLength);
      await pipeline(Readable.fromWeb(upstream.body), res);
      return;
    }

    // ── Compression service path ──
    logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, { patientId, folderName, fileId, compressed: true });

    req.setTimeout(300000);
    res.setTimeout(300000);

    const start = Date.now();
    const result = await compressionService.compressFolder({
      folderId: String(folder._id),
      userId: String(hospitalId),
      patientId: String(patient._id),
      patientName: patient.patientName,
      displayName: "",  // No cover page for single file
      filesInfo: [],
      sourcePdfs: [{
        public_id: file.cloudinaryPublicId,
        uploaded_at: (file.uploadedAt || file.createdAt || new Date()).toISOString(),
        resource_type: file.resourceType || "image",
        access_mode: file.accessMode || "signed",
      }],
    });

    logAudit(hospitalId, "PATIENT_EXPORT_PDF", req, {
      patientId, folderName, fileId, compressed: true,
      content_hash: result.content_hash,
      tier_used: result.tier_used, cache_hit: result.cache_hit,
      final_size_bytes: result.final_size_bytes,
      duration_ms: Date.now() - start,
    });

    const upstream = await compressionService.fetchMergedStream(result.merged_url);
    const safeName = encodeURIComponent(file.fileName);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}"`);
    if (result.final_size_bytes > 0) res.setHeader("Content-Length", result.final_size_bytes);

    await pipeline(Readable.fromWeb(upstream.body), res);
  } catch (error) {
    if (!res.headersSent) handleCompressionError(error, res, "File compressed download");
  }
};

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
  downloadFileCompressed,
};
