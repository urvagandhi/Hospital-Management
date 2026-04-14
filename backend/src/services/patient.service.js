/**
 * Patient Service
 * Business logic for patient operations
 */

import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import Hospital from "../models/Hospital.js";
import { deleteFolder } from "./r2.service.js";

/**
 * Create a new patient with auto-generated patientId
 * @param {string} hospitalId
 * @param {Object} patientData - {patientName, remarks}
 * @returns {Promise<Object>}
 */
export const createPatient = async (hospitalId, patientData) => {
  try {
    console.log("[Patient Service] Creating patient for hospital:", hospitalId);

    // Atomically increment the hospital's patient counter and get initials
    const hospital = await Hospital.findByIdAndUpdate(
      hospitalId,
      { $inc: { patientCounter: 1 } },
      { new: true },
    );

    if (!hospital) {
      throw new Error("Hospital not found");
    }

    const initials = hospital.getInitials();
    const counter = String(hospital.patientCounter).padStart(3, "0");
    const patientId = `${initials}-${counter}`;

    const patient = new Patient({
      hospitalId,
      patientId,
      patientName: patientData.patientName,
      remarks: patientData.remarks || undefined,
    });

    await patient.save();
    console.log("[Patient Service] Patient created:", patient._id, "patientId:", patientId);
    return patient;
  } catch (error) {
    console.error("[Patient Service] Create error:", error);
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
    const { limit = 20, skip = 0, search } = options;
    console.log("[Patient Service] Fetching patients for hospital:", hospitalId);
    console.log("[Patient Service] Options - limit:", limit, "skip:", skip, "search:", search);

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const query = { hospitalId: hospitalObjectId };

    if (search && search.trim()) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { patientName: { $regex: escapedSearch, $options: "i" } },
        { patientId: { $regex: escapedSearch, $options: "i" } },
      ];
    }

    const patients = await Patient.find(query)
      .limit(limit)
      .skip(skip)
      .select("-folders.files.fileUrl")
      .sort({ createdAt: -1 });

    const total = await Patient.countDocuments(query);

    console.log("[Patient Service] Found", patients.length, "patients");
    return { patients, total };
  } catch (error) {
    console.error("[Patient Service] Fetch error:", error);
    throw error;
  }
};

/**
 * Get single patient with folder structure
 * @param {string} hospitalId
 * @param {string} patientId - MongoDB _id
 * @returns {Promise<Object>}
 */
export const getPatientById = async (hospitalId, patientId) => {
  try {
    console.log("[Patient Service] Fetching patient:", patientId);

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    console.log("[Patient Service] Patient found:", patient._id);
    return patient;
  } catch (error) {
    console.error("[Patient Service] Fetch error:", error);
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
    console.log("[Patient Service] Updating patient:", patientId);

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

    console.log("[Patient Service] Patient updated successfully");
    return patient;
  } catch (error) {
    console.error("[Patient Service] Update error:", error);
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
    console.log("[Patient Service] Creating folder:", folderName, "for patient:", patientId);

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

    console.log("[Patient Service] Folder created");
    return patient;
  } catch (error) {
    console.error("[Patient Service] Folder creation error:", error);
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
    console.log("[Patient Service] Adding file to folder:", folderName);

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
    console.log("[Patient Service] File added successfully");
    return patient;
  } catch (error) {
    console.error("[Patient Service] Add file error:", error);
    throw error;
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
    console.log("[Patient Service] Fetching files for folder:", folderName);

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

    console.log("[Patient Service] Found", folder.files.length, "files");
    return folder;
  } catch (error) {
    console.error("[Patient Service] Fetch files error:", error);
    throw error;
  }
};

/**
 * Rename a file inside a patient folder
 */
export const renameFile = async (hospitalId, patientId, folderName, fileId, newFileName) => {
  try {
    console.log("[Patient Service] Renaming file:", fileId, "to:", newFileName);

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

    console.log("[Patient Service] File renamed successfully");
    return patient;
  } catch (error) {
    console.error("[Patient Service] Rename file error:", error);
    throw error;
  }
};

/**
 * Delete patient and all associated files from R2
 */
export const deletePatient = async (hospitalId, patientId) => {
  try {
    console.log("[Patient Service] Deleting patient:", patientId);

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    if (!patient) {
      throw new Error("Patient not found");
    }

    const prefix = `${hospitalId}/${patientId}/`;
    await deleteFolder(prefix);

    await Patient.deleteOne({
      _id: patientId,
      hospitalId: hospitalObjectId,
    });

    console.log("[Patient Service] Patient deleted successfully");
  } catch (error) {
    console.error("[Patient Service] Delete error:", error);
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

    console.log("[Patient Service] Finding patients older than", days, "days");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const oldPatients = await Patient.find({
      createdAt: { $lt: cutoffDate },
    }).select("_id hospitalId folders");

    console.log("[Patient Service] Found", oldPatients.length, "old patients");

    if (oldPatients.length === 0) {
      return { deletedCount: 0, filesDeleted: 0 };
    }

    let filesDeleted = 0;
    const patientIds = [];

    for (const patient of oldPatients) {
      try {
        const prefix = `${patient.hospitalId}/${patient._id}/`;
        const deletedFiles = await deleteFolder(prefix);
        filesDeleted += deletedFiles;
        patientIds.push(patient._id);
      } catch (error) {
        console.error("[Patient Service] Error deleting R2 files for patient:", patient._id, error);
        patientIds.push(patient._id);
      }
    }

    const result = await Patient.deleteMany({
      _id: { $in: patientIds },
    });

    console.log("[Patient Service] Deleted", result.deletedCount, "patients and", filesDeleted, "files");
    return { deletedCount: result.deletedCount, filesDeleted };
  } catch (error) {
    console.error("[Patient Service] Delete old patients error:", error);
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
