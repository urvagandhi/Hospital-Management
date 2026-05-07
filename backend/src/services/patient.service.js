/**
 * Patient Service
 * Business logic for patient operations
 */

import mongoose from "mongoose";
import Hospital from "../models/Hospital.js";
import Patient from "../models/Patient.js";
import logger from "../utils/logger.js";
import { cloudinary, buildSignedUrl } from "./storage.service.js";

function encodePatientsCursor(doc) {
  if (!doc?.createdAt || !doc?._id) return null;
  return Buffer.from(
    JSON.stringify({
      createdAt: new Date(doc.createdAt).toISOString(),
      id: String(doc._id),
    }),
  ).toString("base64url");
}

function decodePatientsCursor(cursor) {
  if (!cursor || typeof cursor !== "string") return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded?.createdAt || !decoded?.id) return null;

    const createdAt = new Date(decoded.createdAt);
    if (Number.isNaN(createdAt.getTime())) return null;
    if (!mongoose.Types.ObjectId.isValid(decoded.id)) return null;

    return {
      createdAt,
      id: new mongoose.Types.ObjectId(decoded.id),
    };
  } catch {
    return null;
  }
}

/**
 * Internal helper to sign URLs for a list of file documents.
 * Returns a plain array of file objects with fileUrl updated to a signed URL if needed.
 */
async function signFileUrls(files) {
  if (!files || !Array.isArray(files)) return [];
  
  return Promise.all(
    files.map(async (file) => {
      // Handle both Mongoose documents and plain objects
      const fileObj = typeof file.toObject === 'function' ? file.toObject() : file;
      
      // If it's DigitalOcean or signed Cloudinary, generate a temporary access URL
      if (fileObj.storageProvider === "digitalocean" || fileObj.accessMode === "signed") {
        const signedUrl = await buildSignedUrl({
          publicId: fileObj.storageProvider === "digitalocean" ? fileObj.fileUrl : fileObj.storageKey,
          resourceType: fileObj.resourceType || "raw",
          storageProvider: fileObj.storageProvider,
          ttlSeconds: 3600, // 1 hour expiry for viewing
          fileName: fileObj.fileName
        });
        
        if (signedUrl) {
          fileObj.fileUrl = signedUrl;
        }
      }
      return fileObj;
    })
  );
}

/**
 * Create a new patient with auto-generated patientId
 * @param {string} hospitalId
 * @param {Object} patientData - {patientName, remarks}
 * @returns {Promise<Object>}
 */
export const createPatient = async (hospitalId, patientData) => {
  try {
    logger.info({ event: "patient_create_start", hospitalId }, "[Patient Service] Creating patient");

    // Atomically increment the hospital's patient counter and get initials
    const hospital = await Hospital.findByIdAndUpdate(
      hospitalId,
      { $inc: { patientIdCounter: 1 } },
      { new: true },
    );

    if (!hospital) {
      throw new Error("Hospital not found");
    }

    const initials = hospital.getInitials();
    const counter = String(hospital.patientIdCounter).padStart(3, "0");
    const patientId = `${initials}-${counter}`;

    const patient = new Patient({
      hospitalId,
      patientId,
      patientName: patientData.patientName,
      remarks: patientData.remarks || undefined,
    });

    await patient.save();
    logger.info(
      { event: "patient_created", patientMongoId: patient._id, patientId },
      "[Patient Service] Patient created",
    );
    return patient;
  } catch (error) {
    logger.error({ event: "patient_create_failed", err: error }, "[Patient Service] Create error");
    throw error;
  }
};

/**
 * Get all patients for a hospital
 * @param {string} hospitalId
 * @param {Object} options - {limit, skip, search}
 * @returns {Promise<Array>}
 */
export const getPatients = async (hospitalId, options = {}) => {
  try {
    const {
      limit = 20,
      skip = 0,
      cursor,
      search,
      createdFrom,
      createdTo,
      hasRemarks,
    } = options;
    const cursorPayload = decodePatientsCursor(cursor);
    logger.info(
      {
        event: "patients_fetch_start",
        hospitalId,
        limit,
        skip,
        hasCursor: Boolean(cursor),
        validCursor: Boolean(cursorPayload),
        search,
        createdFrom,
        createdTo,
        hasRemarks,
      },
      "[Patient Service] Fetching patients",
    );

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const clauses = [];

    if (search && search.trim()) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      clauses.push({
        $or: [
          { patientName: { $regex: escapedSearch, $options: "i" } },
          { patientId: { $regex: escapedSearch, $options: "i" } },
        ],
      });
    }

    if (createdFrom || createdTo) {
      const range = {};
      if (createdFrom) range.$gte = createdFrom;
      if (createdTo) range.$lte = createdTo;
      clauses.push({ createdAt: range });
    }

    if (hasRemarks === "yes") {
      clauses.push({ remarks: { $exists: true, $nin: [null, ""] } });
    } else if (hasRemarks === "no") {
      clauses.push({
        $or: [
          { remarks: { $exists: false } },
          { remarks: null },
          { remarks: "" },
        ],
      });
    }

    const buildQuery = (extraClauses = []) => {
      const query = { hospitalId: hospitalObjectId };
      const andClauses = [...clauses, ...extraClauses];
      if (andClauses.length > 0) query.$and = andClauses;
      return query;
    };

    const total = await Patient.countDocuments(buildQuery());

    let patients = [];
    let hasMore = false;
    let nextCursor = null;

    if (cursorPayload) {
      const cursorClause = {
        $or: [
          { createdAt: { $lt: cursorPayload.createdAt } },
          {
            createdAt: cursorPayload.createdAt,
            _id: { $lt: cursorPayload.id },
          },
        ],
      };

      const docs = await Patient.find(buildQuery([cursorClause]))
        .limit(limit + 1)
        .select("-folders.files.fileUrl")
        .sort({ createdAt: -1, _id: -1 });

      hasMore = docs.length > limit;
      patients = hasMore ? docs.slice(0, limit) : docs;
      nextCursor = hasMore ? encodePatientsCursor(patients[patients.length - 1]) : null;
    } else {
      patients = await Patient.find(buildQuery())
        .limit(limit)
        .skip(skip)
        .select("-folders.files.fileUrl")
        .sort({ createdAt: -1, _id: -1 });

      hasMore = skip + patients.length < total;
    }

    logger.info(
      {
        event: "patients_fetch_ok",
        hospitalId,
        count: patients.length,
        total,
        hasMore,
        nextCursorPresent: Boolean(nextCursor),
      },
      `[Patient Service] Found ${patients.length} patients`,
    );
    return { patients, total, hasMore, nextCursor };
  } catch (error) {
    logger.error({ event: "patients_fetch_failed", err: error }, "[Patient Service] Fetch error");
    throw error;
  }
};

/**
 * Get single patient with folder structure
 * @param {string} hospitalId
 * @param {string} patientId - MongoDB _id
 * @returns {Promise<Object>}
 */
export const getPatientById = async (hospitalId, patientId, { signUrls = false } = {}) => {
  try {
    logger.info({ event: "patient_fetch_start", patientId }, "[Patient Service] Fetching patient");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const patientObj = patient.toObject();

    // Only sign URLs when explicitly requested. Eager signing of ALL files
    // in ALL folders is extremely slow for DO Spaces (each presigned URL
    // requires an SDK call). Callers that need signed URLs for a specific
    // folder should use getFolderFiles instead.
    if (signUrls && patientObj.folders) {
      patientObj.folders = await Promise.all(
        patientObj.folders.map(async (folder) => {
          folder.files = await signFileUrls(folder.files);
          return folder;
        })
      );
    }

    logger.info({ event: "patient_fetch_ok", patientMongoId: String(patient._id) }, "[Patient Service] Patient found");
    return patientObj;
  } catch (error) {
    logger.error({ event: "patient_fetch_failed", err: error }, "[Patient Service] Fetch error");
    throw error;
  }
};

/**
 * Update patient details (only patientName and remarks are editable)
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {Object} updateData - {patientName, remarks}
 * @returns {Promise<Object>}
 */
export const updatePatient = async (hospitalId, patientId, updateData) => {
  try {
    logger.info({ event: "patient_update_start", patientId }, "[Patient Service] Updating patient");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    // Only allow updating name and remarks
    const allowedUpdates = {};
    if (updateData.patientName !== undefined) allowedUpdates.patientName = updateData.patientName;
    if (updateData.remarks !== undefined) allowedUpdates.remarks = updateData.remarks;

    const patient = await Patient.findOneAndUpdate(
      {
        _id: patientId,
        hospitalId: hospitalObjectId,
      },
      { $set: allowedUpdates },
      { new: true, runValidators: true },
    );

    if (!patient) {
      throw new Error("Patient not found");
    }

    logger.info({ event: "patient_updated", patientId }, "[Patient Service] Patient updated successfully");
    return patient;
  } catch (error) {
    logger.error({ event: "patient_update_failed", err: error }, "[Patient Service] Update error");
    throw error;
  }
};

/**
 * Create a new folder for a patient
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {string} folderName
 * @returns {Promise<Object>}
 */
export const createFolder = async (hospitalId, patientId, folderName) => {
  try {
    logger.info(
      { event: "folder_create_start", folderName, patientId },
      "[Patient Service] Creating folder",
    );

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOneAndUpdate(
      { _id: patientId, hospitalId: hospitalObjectId },
      {
        $push: {
          folders: {
            name: folderName,
            files: [],
          },
        },
      },
      { new: true },
    );

    if (!patient) {
      throw new Error("Patient not found");
    }

    logger.info({ event: "folder_created", folderName, patientId }, "[Patient Service] Folder created");
    return patient;
  } catch (error) {
    logger.error({ event: "folder_create_failed", err: error }, "[Patient Service] Folder creation error");
    throw error;
  }
};

/**
 * Add file to patient folder
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {string} folderName
 * @param {Object} fileData - {fileName, fileUrl, size, mimeType}
 * @returns {Promise<Object>}
 */
export const addFileToFolder = async (hospitalId, patientId, folderName, fileData) => {
  try {
    logger.info({ event: "file_add_start", folderName, patientId }, "[Patient Service] Adding file to folder");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
      throw new Error("Folder not found");
    }

    folder.files.push({
      ...fileData,
      uploadedAt: new Date(),
    });

    await patient.save();
    logger.info({ event: "file_added", folderName, patientId }, "[Patient Service] File added successfully");
    return patient;
  } catch (error) {
    logger.error({ event: "file_add_failed", err: error }, "[Patient Service] Add file error");
    throw error;
  }
};

/**
 * Update file thumbnail
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {string} folderName
 * @param {string} fileId
 * @param {string} thumbnailUrl
 * @returns {Promise<Object>}
 */
export const updateFileThumbnail = async (hospitalId, patientId, folderName, fileId, thumbnailUrl) => {
  try {
    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;
    const patient = await Patient.findOne({ _id: patientId, hospitalId: hospitalObjectId });
    if (!patient) return null;
    
    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) return null;
    
    const file = folder.files.id(fileId);
    if (!file) return null;
    
    file.thumbnailUrl = thumbnailUrl;
    await patient.save();
    return patient;
  } catch (error) {
    logger.error({ event: "update_thumbnail_failed", err: error }, "[Patient Service] Update thumbnail error");
    return null;
  }
};

/**
 * Get files in folder
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {string} folderName
 * @returns {Promise<Object>}
 */
export const getFolderFiles = async (hospitalId, patientId, folderName) => {
  try {
    logger.info({ event: "folder_files_fetch_start", folderName, patientId }, "[Patient Service] Fetching folder files");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
      throw new Error("Folder not found");
    }

    const result = folder.toObject();
    result.files = await signFileUrls(folder.files);

    logger.info(
      { event: "folder_files_fetch_ok", folderName, count: result.files.length, patientId: String(patient._id) },
      `[Patient Service] Found ${result.files.length} files`,
    );
    return result;
  } catch (error) {
    logger.error({ event: "folder_files_fetch_failed", err: error }, "[Patient Service] Fetch files error");
    throw error;
  }
};

/**
 * Rename a file inside a patient folder
 */
export const renameFile = async (hospitalId, patientId, folderName, fileId, newFileName) => {
  try {
    logger.info(
      { event: "file_rename_start", fileId, newFileName },
      "[Patient Service] Renaming file",
    );

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
      throw new Error("Folder not found");
    }

    const file = folder.files.id(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    file.fileName = newFileName;
    await patient.save();

    logger.info({ event: "file_renamed", fileId, newFileName }, "[Patient Service] File renamed successfully");
    return patient;
  } catch (error) {
    logger.error({ event: "file_rename_failed", err: error }, "[Patient Service] Rename file error");
    throw error;
  }
};

/**
 * Delete a file inside a patient folder
 */
export const deleteFileFromFolder = async (hospitalId, patientId, folderName, fileId) => {
  try {
    logger.info({ event: "file_delete_start", fileId }, "[Patient Service] Deleting file");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
      throw new Error("Folder not found");
    }

    const file = folder.files.id(fileId);
    if (!file) {
      throw new Error("File not found");
    }

    const deletedFile = {
      _id: file._id?.toString(),
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      storageKey: file.storageKey,
      storageProvider: file.storageProvider,
    };

    folder.files.pull(fileId);
    await patient.save();

    logger.info({ event: "file_deleted", fileId }, "[Patient Service] File deleted successfully");
    return { patient, deletedFile };
  } catch (error) {
    logger.error({ event: "file_delete_failed", err: error }, "[Patient Service] Delete file error");
    throw error;
  }
};

/**
 * Delete patient and all associated records
 */
export const deletePatient = async (hospitalId, patientId) => {
  try {
    logger.info({ event: "patient_delete_start", patientId }, "[Patient Service] Deleting patient");

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    // TODO: Implement batch storage cleanup if needed. 
    // Individual files are currently handled via their own lifecycle.

    await Patient.deleteOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    logger.info({ event: "patient_deleted", patientId }, "[Patient Service] Patient deleted successfully");
  } catch (error) {
    logger.error({ event: "patient_delete_failed", err: error }, "[Patient Service] Delete error");
    throw error;
  }
};

/**
 * Delete patients older than X days.
 */
export const deleteOldPatients = async (days = 90) => {
  try {
    if (days < 30) {
      throw new Error("Safety: days threshold must be >= 30");
    }

    logger.info(
      { event: "auto_delete_scan_start", days },
      `[Patient Service] Finding patients older than ${days} days`,
    );

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const oldPatients = await Patient.find({
      createdAt: { $lt: cutoffDate },
    }).select("_id hospitalId folders");

    logger.info(
      { event: "auto_delete_scan_ok", count: oldPatients.length },
      `[Patient Service] Found ${oldPatients.length} old patients`,
    );

    if (oldPatients.length === 0) {
      return { deletedCount: 0, filesDeleted: 0 };
    }

    let filesDeleted = 0;
    const patientIds = [];

    for (const patient of oldPatients) {
      let patientFilesDeleted = 0;
      for (const folder of patient.folders || []) {
        for (const file of folder.files || []) {
          if (!file.storageKey) continue;
          // NOTE: this only cleans up Cloudinary-hosted files. DO Spaces
          // files leak after 90-day auto-delete — separate cleanup needed.
          if (file.storageProvider && file.storageProvider !== "cloudinary") continue;
          try {
            const resourceType = file.resourceType || "image";
            await cloudinary.uploader.destroy(file.storageKey, { resource_type: resourceType });
            patientFilesDeleted++;
          } catch (err) {
            logger.warn(
              { event: "cloudinary_delete_failed", storageKey: file.storageKey, err },
              "[Patient Service] Cloudinary delete failed",
            );
          }
        }
      }
      filesDeleted += patientFilesDeleted;
      patientIds.push(patient._id);
    }

    const result = await Patient.deleteMany({
      _id: { $in: patientIds },
    });

    logger.info(
      { event: "auto_delete_ok", patients: result.deletedCount, filesDeleted },
      `[Patient Service] Deleted ${result.deletedCount} patients and ${filesDeleted} files`,
    );
    return { deletedCount: result.deletedCount, filesDeleted };
  } catch (error) {
    logger.error({ event: "auto_delete_failed", err: error }, "[Patient Service] Delete old patients error");
    throw error;
  }
};

export default {
  createPatient,
  getPatients,
  getPatientById,
  updatePatient,
  createFolder,
  addFileToFolder,
  getFolderFiles,
  deletePatient,
  deleteOldPatients,
};
