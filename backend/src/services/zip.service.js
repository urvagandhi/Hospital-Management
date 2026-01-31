/**
 * ZIP Generation Service
 * Generates ZIP archives for patient records and folders
 */

import archiver from "archiver";
import { getFileStream } from "./r2.service.js";

/**
 * Generate ZIP for a patient record
 * @param {Object} patient - Patient object
 * @param {Object} res - Express response object
 */
export const generatePatientZip = async (patient, res) => {
    const archive = archiver("zip", { zlib: { level: 9 } });
    const filename = `${patient.patientName.replace(/[^a-z0-9]/gi, "_")}_records.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    archive.pipe(res);

    // Add files from all folders
    for (const folder of patient.folders) {
        for (const file of folder.files) {
            try {
                const stream = await getFileStream(file.fileUrl);
                // Add file to zip with folder structure
                archive.append(stream, { name: `${folder.name}/${file.fileName}` });
            } catch (error) {
                console.error(`[ZIP Service] Failed to add file ${file.fileName}:`, error);
                // Continue with other files even if one fails
            }
        }
    }

    await archive.finalize();
};

/**
 * Generate ZIP for a specific folder
 * @param {Object} patient - Patient object
 * @param {string} folderName - Name of the folder
 * @param {Object} res - Express response object
 */
export const generateFolderZip = async (patient, folderName, res) => {
    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
        throw new Error("Folder not found");
    }

    const archive = archiver("zip", { zlib: { level: 9 } });
    const filename = `${patient.patientName.replace(/[^a-z0-9]/gi, "_")}_${folderName.replace(/[^a-z0-9]/gi, "_")}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    archive.pipe(res);

    // Add files from folder
    for (const file of folder.files) {
        try {
            const stream = await getFileStream(file.fileUrl);
            archive.append(stream, { name: file.fileName });
        } catch (error) {
            console.error(`[ZIP Service] Failed to add file ${file.fileName}:`, error);
        }
    }

    await archive.finalize();
};

export default {
    generatePatientZip,
    generateFolderZip,
};
