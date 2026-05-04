/**
 * ZIP Generation Service
 * Generates ZIP archives for patient records and folders
 * Fetches files from Cloudinary URLs using native fetch()
 */

import archiver from "archiver";
import { buildSignedUrl } from "./storage.service.js";
import logger from "../utils/logger.js";

/**
 * Fetch a file buffer from a Cloudinary (or any HTTPS) URL.
 * Returns null on failure instead of throwing.
 */
async function fetchFileBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    logger.error(
      { event: "zip_fetch_failed", url, err: error },
      `[ZIP Service] Failed to fetch ${url}`,
    );
    return null;
  }
}

/**
 * Safe filename: replace non-alphanumeric (except dot, dash) with underscores
 */
function safeName(name) {
  return name.replace(/[^a-z0-9.\-]/gi, "_");
}

/**
 * Generate ZIP for a patient — all folders or selected folders only.
 * @param {Object} patient - Patient document
 * @param {Object} res - Express response
 * @param {string[]} [selectedFolders] - If provided, only include these folders (case-insensitive)
 */
export const generatePatientZip = async (patient, res, selectedFolders = null) => {
  const archive = archiver("zip", { zlib: { level: 9 } });
  const filename = `${safeName(patient.patientName)}_records.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  archive.pipe(res);

  const foldersToInclude = selectedFolders
    ? patient.folders.filter((f) =>
        selectedFolders.some((s) => s.toLowerCase() === f.name.toLowerCase()),
      )
    : patient.folders;

  for (const folder of foldersToInclude) {
    const folderPrefix = safeName(folder.name);
    for (const file of folder.files) {
      // Use signed URL for fetching to handle private assets on Cloudinary or DigitalOcean
      const signedUrl = await buildSignedUrl({
        publicId: file.cloudinaryPublicId,
        resourceType: file.resourceType || "raw",
        storageProvider: file.storageProvider || 'cloudinary',
        accessMode: file.accessMode || 'signed'
      });
      
      const buffer = await fetchFileBuffer(signedUrl || file.fileUrl);
      if (buffer) {
        archive.append(buffer, { name: `${folderPrefix}/${safeName(file.fileName)}` });
      }
    }
  }

  await archive.finalize();
};

/**
 * Generate ZIP for a single folder (flat — no subfolder structure).
 * @param {Object} patient - Patient document
 * @param {string} folderName - Folder name (case-insensitive match)
 * @param {Object} res - Express response
 */
export const generateFolderZip = async (patient, folderName, res) => {
  const folder = patient.folders.find(
    (f) => f.name.toLowerCase() === folderName.toLowerCase(),
  );
  if (!folder) throw new Error("Folder not found");

  const archive = archiver("zip", { zlib: { level: 9 } });
  const filename = `${safeName(patient.patientName)}_${safeName(folderName)}.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  archive.pipe(res);

  for (const file of folder.files) {
    const signedUrl = await buildSignedUrl({
      publicId: file.cloudinaryPublicId,
      resourceType: file.resourceType || "raw",
      storageProvider: file.storageProvider || 'cloudinary',
      accessMode: file.accessMode || 'signed'
    });

    const buffer = await fetchFileBuffer(signedUrl || file.fileUrl);
    if (buffer) {
      archive.append(buffer, { name: safeName(file.fileName) });
    }
  }

  await archive.finalize();
};

/**
 * Calculate total size and per-folder breakdown from DB records (no network calls).
 * @param {Object} patient - Patient document
 * @param {number} limit - Size limit in bytes (default 10MB)
 * @returns {{ overLimit: boolean, totalSize: number, folders: Array }}
 */
export const checkSize = (patient, limit = 10 * 1024 * 1024) => {
  const folders = patient.folders
    .filter((f) => f.files.length > 0)
    .map((f) => ({
      name: f.name,
      size: f.files.reduce((sum, file) => sum + (file.size || 0), 0),
      fileCount: f.files.length,
    }));

  const totalSize = folders.reduce((sum, f) => sum + f.size, 0);

  return {
    overLimit: totalSize > limit,
    totalSize,
    folders,
  };
};

export default { generatePatientZip, generateFolderZip, checkSize };
