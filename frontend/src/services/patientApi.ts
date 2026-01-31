/**
 * Patient API Service
 * All API calls for patient management module
 */

import api from "./api";

export interface Patient {
  _id: string;
  patientName: string;
  email?: string;
  phone?: string;
  medicalRecordNumber?: string;
  createdAt: string;
  folders?: Folder[];
}

export interface Folder {
  _id: string;
  name: string;
  files: File[];
  createdAt: string;
}

export interface File {
  _id: string;
  fileName: string;
  fileUrl: string;
  size: number;
  mimeType: string;
  uploadedAt: string;
}

/**
 * Get all patients for logged-in hospital
 */
export const fetchPatients = async (limit = 20, skip = 0, search = "") => {
  try {
    const response = await api.get("/patients", {
      params: { limit, skip, search },
    });
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to fetch patients" };
  }
};

/**
 * Get single patient with folder structure
 */
export const fetchPatientById = async (patientId: string) => {
  try {
    const response = await api.get(`/patients/${patientId}`);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to fetch patient" };
  }
};

/**
 * Get files in specific folder
 */
export const fetchFolderFiles = async (patientId: string, folderName: string) => {
  try {
    const response = await api.get(`/patients/${patientId}/files/${folderName}`);
    return response.data;
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to fetch folder files" };
  }
};

/**
 * Download all files as PDF
 */
export const downloadAllPdf = async (patientId: string, patientName: string) => {
  try {
    const response = await api.get(`/patients/${patientId}/download/pdf`, {
      responseType: "blob",
    });
    downloadBlob(response.data as Blob, `${patientName}_records.pdf`);
    return { success: true };
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to download PDF" };
  }
};

/**
 * Download folder as PDF
 */
export const downloadFolderPdf = async (patientId: string, folderName: string, patientName: string) => {
  try {
    const response = await api.get(`/patients/${patientId}/folders/${folderName}/pdf`, {
      responseType: "blob",
    });
    downloadBlob(response.data as Blob, `${patientName}_${folderName}.pdf`);
    return { success: true };
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to download folder PDF" };
  }
};

/**
 * Download all files as ZIP
 */
export const downloadAllZip = async (patientId: string, patientName: string) => {
  try {
    const response = await api.get(`/patients/${patientId}/download/zip`, {
      responseType: "blob",
    });
    downloadBlob(response.data as Blob, `${patientName}_records.zip`);
    return { success: true };
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to download ZIP" };
  }
};

/**
 * Download folder as ZIP
 */
export const downloadFolderZip = async (patientId: string, folderName: string, patientName: string) => {
  try {
    const response = await api.get(`/patients/${patientId}/folders/${folderName}/zip`, {
      responseType: "blob",
    });
    downloadBlob(response.data as Blob, `${patientName}_${folderName}.zip`);
    return { success: true };
  } catch (error: any) {
    throw error.response?.data || { message: "Failed to download folder ZIP" };
  }
};

/**
 * Helper function to download blob
 */
function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
  window.URL.revokeObjectURL(url);
}

export default {
  fetchPatients,
  fetchPatientById,
  fetchFolderFiles,
  downloadAllPdf,
  downloadFolderPdf,
  downloadAllZip,
  downloadFolderZip,
};
