/**
 * Patient Service
 * Business logic for patient operations
 */

import mongoose from "mongoose";
import Patient from "../models/Patient.js";
import { deleteFolder } from "./r2.service.js";

/**
 * Create a new patient
 * @param {string} hospitalId
 * @param {Object} patientData - {patientName, email, phone, dateOfBirth, medicalRecordNumber, notes}
 * @returns {Promise<Object>}
 */
export const createPatient = async (hospitalId, patientData) => {
  try {
    console.log("[Patient Service] Creating patient for hospital:", hospitalId);

    const patient = new Patient({
      hospitalId,
      ...patientData,
      // folders will be auto-populated by default in schema
    });

    await patient.save();
    console.log("[Patient Service] Patient created:", patient._id);
    return patient;
  } catch (error) {
    console.error("[Patient Service] Create error:", error);
    throw error;
  }
};

/**
 * Get all patients for a hospital
 * @param {string} hospitalId
 * @param {Object} options - {limit, skip, status}
 * @returns {Promise<Array>}
 */
export const getPatients = async (hospitalId, options = {}) => {
  try {
    const { limit = 20, skip = 0, status = "active", search } = options;
    console.log("[Patient Service] Fetching patients for hospital:", hospitalId);
    console.log("[Patient Service] Options - limit:", limit, "skip:", skip, "search:", search);

    // Convert hospitalId string to ObjectId for proper MongoDB comparison
    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    console.log("[Patient Service] Converted hospitalId to ObjectId:", hospitalObjectId);

    const query = { hospitalId: hospitalObjectId };
    if (status) query.status = status;

    if (search && search.trim()) {
      console.log("[Patient Service] Applying search filter for:", search);
      query.$or = [{ patientName: { $regex: search, $options: "i" } }, { medicalRecordNumber: { $regex: search, $options: "i" } }, { phone: { $regex: search, $options: "i" } }];
    }

    const patients = await Patient.find(query)
      .limit(limit)
      .skip(skip)
      .select("-folders.files.fileUrl") // Don't send R2 URLs in list
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
 * @param {string} patientId
 * @returns {Promise<Object>}
 */
export const getPatientById = async (hospitalId, patientId) => {
  try {
    console.log("[Patient Service] Fetching patient:", patientId);

    // Convert hospitalId string to ObjectId for proper MongoDB comparison
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
 * Update patient details
 * @param {string} hospitalId
 * @param {string} patientId
 * @param {Object} updateData - Fields to update
 * @returns {Promise<Object>}
 */
export const updatePatient = async (hospitalId, patientId, updateData) => {
  try {
    console.log("[Patient Service] Updating patient:", patientId);

    const hospitalObjectId = mongoose.Types.ObjectId.isValid(hospitalId) ? new mongoose.Types.ObjectId(hospitalId) : hospitalId;

    const patient = await Patient.findOneAndUpdate(
      {
        _id: patientId,
        hospitalId: hospitalObjectId,
      },
      { $set: updateData },
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
 * Delete patient and all associated files from R2
 * @param {string} hospitalId
 * @param {string} patientId
 * @returns {Promise<void>}
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

    // Delete all files from R2
    const prefix = `${hospitalId}/${patientId}/`;
    await deleteFolder(prefix);

    // Delete from database
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
 * Delete patients older than X days
 * @param {number} days - Days threshold
 * @returns {Promise<{deletedCount: number, filesDeleted: number}>}
 */
export const deleteOldPatients = async (days = 90) => {
  try {
    console.log("[Patient Service] Finding patients older than", days, "days");

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const oldPatients = await Patient.find({
      createdAt: { $lt: cutoffDate },
    });

    console.log("[Patient Service] Found", oldPatients.length, "old patients");

    let filesDeleted = 0;
    for (const patient of oldPatients) {
      try {
        const prefix = `${patient.hospitalId}/${patient._id}/`;
        const deletedFiles = await deleteFolder(prefix);
        filesDeleted += deletedFiles;
      } catch (error) {
        console.error("[Patient Service] Error deleting R2 files for patient:", patient._id, error);
      }
    }

    // Delete from database
    const result = await Patient.deleteMany({
      createdAt: { $lt: cutoffDate },
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
