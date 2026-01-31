/**
 * PDF Generation Service
 * Generates PDFs for patient records and folders
 */

import PDFDocument from "pdfkit";
import { getFileStream } from "./r2.service.js";

/**
 * Generate PDF for a patient record
 * @param {Object} patient - Patient object
 * @param {Object} res - Express response object
 */
export const generatePatientPdf = async (patient, res) => {
    const doc = new PDFDocument();
    const filename = `${patient.patientName.replace(/[^a-z0-9]/gi, "_")}_records.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Title
    doc.fontSize(20).text(`Patient Records: ${patient.patientName}`, { align: "center" });
    doc.moveDown();

    // Patient Info
    doc.fontSize(12).text(`Name: ${patient.patientName}`);
    if (patient.email) doc.text(`Email: ${patient.email}`);
    if (patient.phone) doc.text(`Phone: ${patient.phone}`);
    if (patient.medicalRecordNumber) doc.text(`MRN: ${patient.medicalRecordNumber}`);
    doc.text(`Generated: ${new Date().toLocaleDateString()}`);
    doc.moveDown();

    // Folders
    for (const folder of patient.folders) {
        doc.fontSize(16).text(folder.name, { underline: true });
        doc.moveDown(0.5);

        if (folder.files.length === 0) {
            doc.fontSize(12).text("No files", { italic: true });
        } else {
            for (const file of folder.files) {
                doc.fontSize(12).text(`• ${file.fileName}`);
                doc.fontSize(10).text(`  Size: ${formatFileSize(file.size)} | Uploaded: ${new Date(file.uploadedAt).toLocaleDateString()}`, { color: "grey" });
                doc.moveDown(0.2);
            }
        }
        doc.moveDown();
    }

    doc.end();
};

/**
 * Generate PDF for a specific folder
 * @param {Object} patient - Patient object
 * @param {string} folderName - Name of the folder
 * @param {Object} res - Express response object
 */
export const generateFolderPdf = async (patient, folderName, res) => {
    const folder = patient.folders.find((f) => f.name === folderName);
    if (!folder) {
        throw new Error("Folder not found");
    }

    const doc = new PDFDocument();
    const filename = `${patient.patientName.replace(/[^a-z0-9]/gi, "_")}_${folderName.replace(/[^a-z0-9]/gi, "_")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    doc.pipe(res);

    // Title
    doc.fontSize(20).text(`${folderName} - ${patient.patientName}`, { align: "center" });
    doc.moveDown();

    // Files
    if (folder.files.length === 0) {
        doc.fontSize(12).text("No files in this folder", { italic: true });
    } else {
        for (const file of folder.files) {
            doc.fontSize(12).text(`• ${file.fileName}`);
            doc.fontSize(10).text(`  Size: ${formatFileSize(file.size)} | Uploaded: ${new Date(file.uploadedAt).toLocaleDateString()}`, { color: "grey" });
            doc.moveDown(0.5);
        }
    }

    doc.end();
};

function formatFileSize(bytes) {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export default {
    generatePatientPdf,
    generateFolderPdf,
};
