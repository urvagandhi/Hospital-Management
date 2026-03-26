/**
 * PDF Generation Service
 * Merges actual PDF files from Cloudinary into single documents using pdf-lib.
 * Uses pdfkit only for cover pages.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import PDFDocumentKit from "pdfkit";

/**
 * Fetch a file buffer from a Cloudinary (or any HTTPS) URL.
 * Returns null on failure.
 */
async function fetchFileBuffer(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error(`[PDF Service] Failed to fetch ${url}:`, error.message);
    return null;
  }
}

function safeName(name) {
  return name.replace(/[^a-z0-9.\-]/gi, "_");
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Create a cover/section page using pdf-lib (no pdfkit dependency for this).
 * Returns a PDFDocument with one page containing title info.
 */
async function createSectionPage(title, subtitle, details = []) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);

  // Blue header bar
  page.drawRectangle({ x: 0, y: 742, width: 612, height: 50, color: rgb(0.12, 0.25, 0.47) });

  // Title
  page.drawText(title, { x: 50, y: 755, size: 18, font, color: rgb(1, 1, 1) });

  // Subtitle
  if (subtitle) {
    page.drawText(subtitle, { x: 50, y: 710, size: 14, font: fontRegular, color: rgb(0.3, 0.3, 0.3) });
  }

  // Details
  let y = 680;
  for (const line of details) {
    page.drawText(line, { x: 50, y, size: 11, font: fontRegular, color: rgb(0.4, 0.4, 0.4) });
    y -= 18;
  }

  return doc;
}

/**
 * Merge multiple PDF buffers into one PDFDocument.
 * Skips any buffer that fails to load.
 * @param {Buffer[]} buffers - Array of PDF file buffers
 * @returns {Promise<PDFDocument>} Merged document
 */
async function mergePdfBuffers(buffers) {
  const merged = await PDFDocument.create();

  for (const buffer of buffers) {
    if (!buffer) continue;
    try {
      const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) {
        merged.addPage(page);
      }
    } catch (error) {
      console.error("[PDF Service] Failed to merge a PDF:", error.message);
    }
  }

  return merged;
}

// ─── Public API ──────────────────────────────────────────────────

/**
 * Merge all PDFs in a single folder into one PDF with a cover page.
 * Streams result to res.
 */
export const generateFolderPdf = async (patient, folderName, res) => {
  const folder = patient.folders.find(
    (f) => f.name.toLowerCase() === folderName.toLowerCase(),
  );
  if (!folder) throw new Error("Folder not found");

  const filename = `${safeName(patient.patientName)}_${safeName(folderName)}.pdf`;

  // Fetch all file buffers
  const buffers = [];
  for (const file of folder.files) {
    const buf = await fetchFileBuffer(file.fileUrl);
    if (buf) buffers.push(buf);
  }

  // Create cover page
  const cover = await createSectionPage(
    `${folder.name}`,
    `Patient: ${patient.patientName}`,
    [
      `Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
      `Files: ${folder.files.length}`,
      `Total size: ${formatFileSize(folder.files.reduce((s, f) => s + (f.size || 0), 0))}`,
      patient.medicalRecordNumber ? `MRN: ${patient.medicalRecordNumber}` : "",
    ].filter(Boolean),
  );

  // Merge cover + all PDFs
  const merged = await PDFDocument.create();

  // Copy cover page
  const coverPages = await merged.copyPages(cover, cover.getPageIndices());
  for (const p of coverPages) merged.addPage(p);

  // Copy file pages
  for (const buffer of buffers) {
    try {
      const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch (e) {
      console.error("[PDF Service] Skipping corrupted PDF:", e.message);
    }
  }

  const pdfBytes = await merged.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBytes.length);
  res.end(Buffer.from(pdfBytes));
};

/**
 * MODE "merged": All folders' files into a single PDF with section headers.
 * Streams result to res.
 */
export const generatePatientPdfMerged = async (patient, res) => {
  const filename = `${safeName(patient.patientName)}_all_records.pdf`;
  const merged = await PDFDocument.create();

  for (const folder of patient.folders) {
    if (folder.files.length === 0) continue;

    // Section cover page per folder
    const section = await createSectionPage(
      folder.name,
      `Patient: ${patient.patientName}`,
      [
        `Files: ${folder.files.length}`,
        `Size: ${formatFileSize(folder.files.reduce((s, f) => s + (f.size || 0), 0))}`,
      ],
    );
    const sectionPages = await merged.copyPages(section, section.getPageIndices());
    for (const p of sectionPages) merged.addPage(p);

    // Merge actual PDF files
    for (const file of folder.files) {
      const buffer = await fetchFileBuffer(file.fileUrl);
      if (!buffer) continue;
      try {
        const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const p of pages) merged.addPage(p);
      } catch (e) {
        console.error(`[PDF Service] Skipping ${file.fileName}:`, e.message);
      }
    }
  }

  // If no pages at all, add an empty info page
  if (merged.getPageCount() === 0) {
    const empty = await createSectionPage(
      "No Files",
      `Patient: ${patient.patientName}`,
      ["No PDF files found in any folder."],
    );
    const pages = await merged.copyPages(empty, empty.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }

  const pdfBytes = await merged.save();

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", pdfBytes.length);
  res.end(Buffer.from(pdfBytes));
};

/**
 * MODE "per-folder": One PDF per folder, bundled into a ZIP.
 * Streams ZIP to res.
 */
export const generatePatientPdfPerFolder = async (patient, res) => {
  const { default: archiver } = await import("archiver");
  const filename = `${safeName(patient.patientName)}_records_by_folder.zip`;

  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  const archive = archiver("zip", { zlib: { level: 9 } });
  archive.pipe(res);

  for (const folder of patient.folders) {
    if (folder.files.length === 0) continue;

    // Build a merged PDF for this folder
    const merged = await PDFDocument.create();

    // Cover page
    const cover = await createSectionPage(
      folder.name,
      `Patient: ${patient.patientName}`,
      [
        `Files: ${folder.files.length}`,
        `Generated: ${new Date().toLocaleDateString()}`,
      ],
    );
    const coverPages = await merged.copyPages(cover, cover.getPageIndices());
    for (const p of coverPages) merged.addPage(p);

    // Merge files
    for (const file of folder.files) {
      const buffer = await fetchFileBuffer(file.fileUrl);
      if (!buffer) continue;
      try {
        const source = await PDFDocument.load(buffer, { ignoreEncryption: true });
        const pages = await merged.copyPages(source, source.getPageIndices());
        for (const p of pages) merged.addPage(p);
      } catch (e) {
        console.error(`[PDF Service] Skipping ${file.fileName}:`, e.message);
      }
    }

    const pdfBytes = await merged.save();
    archive.append(Buffer.from(pdfBytes), { name: `${safeName(folder.name)}.pdf` });
  }

  await archive.finalize();
};

/**
 * Legacy: Generate metadata-only PDF listing (for backward compat / export controller).
 */
export const generatePatientPdf = async (patient, res) => {
  return generatePatientPdfMerged(patient, res);
};

export default {
  generatePatientPdf,
  generatePatientPdfMerged,
  generatePatientPdfPerFolder,
  generateFolderPdf,
};
