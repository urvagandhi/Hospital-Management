/**
 * PDF Generation Service
 * Merges actual PDF files from Cloudinary into single documents using pdf-lib.
 * Uses pdfkit only for cover pages.
 */

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import logger from "../utils/logger.js";

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
    logger.error(
      { event: "pdf_fetch_failed", url, err: error },
      `[PDF Service] Failed to fetch ${url}`,
    );
    return null;
  }
}

/**
 * Fetch every file in a folder once, load as PDFDocument, extract page count.
 * Returns an array of { file, buffer, pdfDoc, pageCount } — reused for both
 * the cover page list and the actual merge, avoiding double-fetching.
 */
async function fetchFolderFiles(folder) {
  const results = [];
  for (const file of folder.files) {
    const buffer = await fetchFileBuffer(file.fileUrl);
    let pdfDoc = null;
    let pageCount = null;
    if (buffer) {
      try {
        pdfDoc = await PDFDocument.load(buffer, { ignoreEncryption: true });
        pageCount = pdfDoc.getPageCount();
      } catch {
        // Corrupted or unsupported format — skip page count
      }
    }
    results.push({ file, buffer, pdfDoc, pageCount });
  }
  return results;
}

function safeName(name) {
  return name.replace(/[^a-z0-9.\-]/gi, "_");
}

function stripControlChars(value = "") {
  return String(value).replace(/[\x00-\x1F\x7F]/g, "");
}

function formatFileSize(bytes) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

/**
 * Create a cover/section page using pdf-lib.
 * @param {string}   title    - Section/folder name
 * @param {string}   subtitle - "Patient: <name>"
 * @param {string[]} details  - ["Generated: ...", "Files: N", ...]
 * @param {{ fileName: string, size: number, pageCount: number|null }[]} files
 */
async function createSectionPage(title, subtitle, _details = [], files = []) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([612, 792]); // US Letter
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  const regular = await doc.embedFont(StandardFonts.Helvetica);

  // ─── Colors ───────────────────────────────────────────────────
  const headerBg = rgb(0.098, 0.196, 0.392);  // #193265 dark navy
  const accent = rgb(0.239, 0.510, 0.961);  // #3D82F5 bright blue
  const pageBg = rgb(0.973, 0.984, 1.000);  // #f8fbff
  const border = rgb(0.863, 0.894, 0.937);  // #DCE4EF
  const cardShadow = rgb(0.808, 0.843, 0.886);
  const dark = rgb(0.110, 0.157, 0.243);  // #1C283E
  const muted = rgb(0.565, 0.604, 0.659);  // #909AA8
  const white = rgb(1, 1, 1);
  const blueLight = rgb(0.710, 0.824, 0.988);  // #B5D2FC

  // ─── Page Background ─────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: pageBg });

  // ─── Top Header ───────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 692, width: 612, height: 100, color: headerBg });
  page.drawRectangle({ x: 0, y: 788, width: 612, height: 4, color: accent });

  page.drawText(title.toUpperCase(), { x: 40, y: 752, size: 22, font, color: white });
  page.drawText("MEDICAL RECORDS", { x: 40, y: 722, size: 9, font, color: blueLight });

  // ─── Decorative Divider ───────────────────────────────────────
  page.drawRectangle({ x: 40, y: 568, width: 247, height: 1, color: border });
  page.drawRectangle({ x: 302, y: 564, width: 8, height: 8, color: accent });
  page.drawRectangle({ x: 325, y: 568, width: 247, height: 1, color: border });

  // ─── Patient Card (name only) ─────────────────────────────────
  const cx = 40, cy = 380, cw = 532, ch = 90;

  page.drawRectangle({ x: cx + 3, y: cy - 3, width: cw, height: ch, color: cardShadow });
  page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, color: white });
  page.drawRectangle({ x: cx, y: cy, width: 5, height: ch, color: accent });

  page.drawText("PATIENT", { x: cx + 20, y: cy + ch - 22, size: 7.5, font, color: muted });

  const patientName = stripControlChars(
    subtitle ? subtitle.replace(/^Patient:\s*/, "") : "",
  );
  page.drawText(patientName, { x: cx + 20, y: cy + ch - 52, size: 24, font, color: dark, maxWidth: cw - 50 });

  // ─── Document List ────────────────────────────────────────────
  if (files.length > 0) {
    const listLabelY = cy - 28;
    const docWord = files.length === 1 ? "Document" : "Documents";

    // Section heading
    page.drawText(`${files.length} ${docWord} in this Folder`, {
      x: cx + 20, y: listLabelY, size: 8, font, color: dark,
    });
    page.drawRectangle({ x: cx, y: listLabelY - 10, width: cw, height: 1, color: border });

    // Column headers
    const colHeaderY = listLabelY - 22;
    page.drawText("#", { x: cx + 12, y: colHeaderY, size: 6.5, font, color: muted });
    page.drawText("FILE NAME", { x: cx + 32, y: colHeaderY, size: 6.5, font, color: muted });
    page.drawText("PAGES", { x: cx + 450, y: colHeaderY, size: 6.5, font, color: muted });
    page.drawRectangle({ x: cx, y: colHeaderY - 5, width: cw, height: 0.75, color: border });

    let fileY = colHeaderY - 22;

    for (let i = 0; i < files.length; i++) {
      if (fileY < 45) break;

      const f = files[i];

      if (i % 2 === 0) {
        page.drawRectangle({ x: cx, y: fileY - 6, width: cw, height: 20, color: rgb(0.965, 0.973, 0.988) });
      }

      page.drawText(String(i + 1), { x: cx + 12, y: fileY, size: 8, font, color: muted });

      const cleanFileName = stripControlChars(f.fileName || "");
      const name = cleanFileName.length > 62 ? cleanFileName.substring(0, 59) + "…" : cleanFileName;
      page.drawText(name, { x: cx + 32, y: fileY, size: 9, font: regular, color: dark });

      const pgStr = f.pageCount != null ? (f.pageCount === 1 ? "1 pg" : `${f.pageCount} pgs`) : "—";
      page.drawText(pgStr, { x: cx + 450, y: fileY, size: 8, font: regular, color: muted });

      fileY -= 22;
    }

    const maxVisible = Math.floor((colHeaderY - 22 - 45) / 22);
    if (files.length > maxVisible) {
      const remaining = files.length - maxVisible;
      page.drawText(`…and ${remaining} more document${remaining > 1 ? "s" : ""}`, {
        x: cx + 32, y: 50, size: 8, font: regular, color: muted,
      });
    }
  }

  // ─── Footer ───────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 32, color: pageBg });
  page.drawRectangle({ x: 0, y: 32, width: 612, height: 1, color: border });
  page.drawText("MyMediVault", { x: 40, y: 12, size: 7.5, font: regular, color: muted });
  page.drawText("Confidential Medical Records", { x: 415, y: 12, size: 7.5, font: regular, color: muted });

  return doc;
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

  // Fetch + load once — get buffers, page counts, and pdfDocs in one pass
  const fileResults = await fetchFolderFiles(folder);

  const coverFiles = fileResults.map(({ file, pageCount }) => ({
    fileName: file.fileName,
    size: file.size,
    pageCount,
  }));

  const cover = await createSectionPage(
    folder.name,
    `Patient: ${patient.patientName}`,
    [
      `Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
      `Files: ${folder.files.length}`,
      `Total size: ${formatFileSize(folder.files.reduce((s, f) => s + (f.size || 0), 0))}`,
      patient.patientId ? `ID: ${patient.patientId}` : "",
    ].filter(Boolean),
    coverFiles,
  );

  const merged = await PDFDocument.create();
  const coverPages = await merged.copyPages(cover, cover.getPageIndices());
  for (const p of coverPages) merged.addPage(p);

  for (const { pdfDoc, file } of fileResults) {
    if (!pdfDoc) continue;
    try {
      const pages = await merged.copyPages(pdfDoc, pdfDoc.getPageIndices());
      for (const p of pages) merged.addPage(p);
    } catch (e) {
      logger.error(
        { event: "pdf_merge_skip", fileName: file.fileName, err: e },
        `[PDF Service] Skipping ${file.fileName}`,
      );
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

    // Fetch + load once per folder
    const fileResults = await fetchFolderFiles(folder);

    const coverFiles = fileResults.map(({ file, pageCount }) => ({
      fileName: file.fileName,
      size: file.size,
      pageCount,
    }));

    const section = await createSectionPage(
      folder.name,
      `Patient: ${patient.patientName}`,
      [
        `Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
        `Files: ${folder.files.length}`,
        `Total size: ${formatFileSize(folder.files.reduce((s, f) => s + (f.size || 0), 0))}`,
        patient.patientId ? `ID: ${patient.patientId}` : null,
      ].filter(Boolean),
      coverFiles,
    );
    const sectionPages = await merged.copyPages(section, section.getPageIndices());
    for (const p of sectionPages) merged.addPage(p);

    for (const { pdfDoc, file } of fileResults) {
      if (!pdfDoc) continue;
      try {
        const pages = await merged.copyPages(pdfDoc, pdfDoc.getPageIndices());
        for (const p of pages) merged.addPage(p);
      } catch (e) {
        logger.error(
          { event: "pdf_merge_skip", fileName: file.fileName, err: e },
          `[PDF Service] Skipping ${file.fileName}`,
        );
      }
    }
  }

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

    const fileResults = await fetchFolderFiles(folder);

    const coverFiles = fileResults.map(({ file, pageCount }) => ({
      fileName: file.fileName,
      size: file.size,
      pageCount,
    }));

    const folderMerged = await PDFDocument.create();

    const cover = await createSectionPage(
      folder.name,
      `Patient: ${patient.patientName}`,
      [
        `Generated: ${new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}`,
        `Files: ${folder.files.length}`,
        `Total size: ${formatFileSize(folder.files.reduce((s, f) => s + (f.size || 0), 0))}`,
        patient.patientId ? `ID: ${patient.patientId}` : null,
      ].filter(Boolean),
      coverFiles,
    );
    const coverPages = await folderMerged.copyPages(cover, cover.getPageIndices());
    for (const p of coverPages) folderMerged.addPage(p);

    for (const { pdfDoc, file } of fileResults) {
      if (!pdfDoc) continue;
      try {
        const pages = await folderMerged.copyPages(pdfDoc, pdfDoc.getPageIndices());
        for (const p of pages) folderMerged.addPage(p);
      } catch (e) {
        logger.error(
          { event: "pdf_merge_skip", fileName: file.fileName, err: e },
          `[PDF Service] Skipping ${file.fileName}`,
        );
      }
    }

    const pdfBytes = await folderMerged.save();
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
