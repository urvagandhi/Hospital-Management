/**
 * Export Controller
 * Generates well-formatted PDF reports and ZIP archives
 */

import PDFDocument from "pdfkit";
import Patient from "../models/Patient.js";
import Hospital from "../models/Hospital.js";

// ─── Layout constants ───────────────────────────────────────────
const MARGIN = 40;
const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const CONTENT_W = PAGE_W - MARGIN * 2;
const TABLE_RIGHT = PAGE_W - MARGIN;

// Column definitions: [label, x, width, align]
const COLUMNS = [
  { label: "#",            x: MARGIN,       w: 30,  align: "left" },
  { label: "Patient Name", x: MARGIN + 30,  w: 140, align: "left" },
  { label: "Patient ID",   x: MARGIN + 170, w: 80,  align: "left" },
  { label: "Created",      x: MARGIN + 250, w: 80,  align: "left" },
  { label: "Remarks",      x: MARGIN + 330, w: 202, align: "left" },
];

const ROW_H = 28;
const HEADER_ROW_H = 32;
const COLORS = {
  primary:     "#3d82f5", // Bright blue accent
  headerBg:    "#193265", // Professional dark navy
  headerText:  "#ffffff",
  rowNormal:   "#ffffff",
  rowAlt:      "#f9fafb", // Subtle grey
  textDark:    "#111827",
  textMuted:   "#4b5563",
  border:      "#d1d5db", // Clear border
};

// ─── Helpers ────────────────────────────────────────────────────

function drawRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function drawTableHeader(doc, y) {
  // Simple dark header row without accent stripes
  drawRect(doc, MARGIN, y, CONTENT_W, HEADER_ROW_H, COLORS.headerBg);

  const textY = y + (HEADER_ROW_H - 10) / 2;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.headerText);

  for (const col of COLUMNS) {
    doc.text(col.label.toUpperCase(), col.x + 5, textY, {
      width: col.w - 10,
      align: col.align,
    });
  }

  return y + HEADER_ROW_H;
}

function drawTableRow(doc, y, data, index) {
  const isAlt = index % 2 === 1;
  drawRect(doc, MARGIN, y, CONTENT_W, ROW_H, isAlt ? COLORS.rowAlt : COLORS.rowNormal);

  // Bottom border
  doc.save()
    .moveTo(MARGIN, y + ROW_H)
    .lineTo(TABLE_RIGHT, y + ROW_H)
    .lineWidth(0.5)
    .stroke(COLORS.border)
    .restore();

  const textY = y + (ROW_H - 10) / 2;

  // Row number
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
  doc.text(String(data.index), COLUMNS[0].x + 5, textY, { width: COLUMNS[0].w - 10 });

  // Patient name
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.textDark);
  doc.text(data.name, COLUMNS[1].x + 5, textY, { width: COLUMNS[1].w - 10, lineBreak: false });

  // Patient ID
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.textDark);
  doc.text(data.patientId, COLUMNS[2].x + 5, textY, { width: COLUMNS[2].w - 10, lineBreak: false });

  // Created date
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.textMuted);
  doc.text(data.registered, COLUMNS[3].x + 5, textY, { width: COLUMNS[3].w - 10, lineBreak: false });

  // Remarks
  const remarks = data.remarks || "—";
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(COLORS.textDark);
  doc.text(remarks, COLUMNS[4].x + 5, textY, {
    width: COLUMNS[4].w - 10,
    height: ROW_H - 10,
    ellipsis: true,
    lineBreak: false,
  });

  return y + ROW_H;
}

function drawPageHeader(doc, hospitalName, pageNum, isCover = false) {
  if (isCover) return 0;

  const headerY = 20;
  
  // Simple clean text header
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.textDark);
  doc.text(hospitalName.toUpperCase(), MARGIN, headerY);
  
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.textMuted);
  doc.text("PATIENT REGISTRY", MARGIN, headerY, { width: CONTENT_W, align: "center" });
  
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
  doc.text(`PAGE ${pageNum}`, MARGIN, headerY, { width: CONTENT_W, align: "right" });

  // Thin separator
  doc.save()
    .moveTo(MARGIN, headerY + 15)
    .lineTo(TABLE_RIGHT, headerY + 15)
    .lineWidth(0.5)
    .stroke(COLORS.border)
    .restore();

  return 50;
}

function drawCoverPage(doc, hospitalName, totalPatients) {
  // Background
  drawRect(doc, 0, 0, PAGE_W, PAGE_H, "#ffffff");

  // Top Header Bar (Matching pdf.service.js navy)
  drawRect(doc, 0, 0, PAGE_W, 100, COLORS.headerBg);
  drawRect(doc, 0, 0, PAGE_W, 4, COLORS.primary); // Bright blue accent

  doc.font("Helvetica-Bold").fontSize(24).fillColor("#ffffff");
  doc.text("PATIENT RECORDS REPORT", 40, 40);

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#B5D2FC");
  doc.text("GENERATED FOR HOSPITAL ADMINISTRATION", 40, 72);

  // Decorative Divider
  const dividerY = 140;
  doc.save()
    .moveTo(40, dividerY)
    .lineTo(PAGE_W - 40, dividerY)
    .lineWidth(1)
    .stroke(COLORS.border)
    .restore();

  // Hospital Card (Cleaner, no shadow)
  const cx = 40, cy = 180, cw = PAGE_W - 80, ch = 90;
  
  drawRect(doc, cx, cy, cw, ch, "#f9fafb");
  drawRect(doc, cx, cy, 4, ch, COLORS.primary);

  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.textMuted);
  doc.text("HOSPITAL NAME", cx + 20, cy + 20);

  doc.font("Helvetica-Bold").fontSize(26).fillColor(COLORS.textDark);
  doc.text(hospitalName.toUpperCase(), cx + 20, cy + 38, { width: cw - 40 });

  // Report Info
  const infoY = cy + ch + 60;
  const dateStr = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
  
  doc.font("Helvetica-Bold").fontSize(12).fillColor(COLORS.textDark);
  doc.text("DOCUMENT SUMMARY", cx, infoY);
  
  doc.save().moveTo(cx, infoY + 18).lineTo(PAGE_W - 40, infoY + 18).lineWidth(1).stroke(COLORS.primary).restore();

  const details = [
    { label: "Total Registered Patients", value: totalPatients },
    { label: "Generation Date", value: dateStr },
    { label: "Classification", value: "CONFIDENTIAL / INTERNAL USE ONLY" }
  ];

  let currentY = infoY + 40;
  for (const item of details) {
    doc.font("Helvetica").fontSize(10).fillColor(COLORS.textMuted);
    doc.text(item.label, cx, currentY);
    doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.textDark);
    doc.text(String(item.value), cx + 180, currentY);
    currentY += 25;
  }

  // Footer
  const footerY = PAGE_H - 50;
  doc.save().moveTo(40, footerY).lineTo(PAGE_W - 40, footerY).lineWidth(0.75)
    .dash(2, { space: 2 }).stroke(COLORS.border).restore();
  
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.textDark);
  doc.text("MyMediVault", 40, footerY + 15);
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
  doc.text("Automated Patient Registry Export", 40, footerY + 28);
}

function drawPageFooter(doc, pageNum, totalPatients) {
  const footerY = PAGE_H - 30;

  doc.save()
    .moveTo(MARGIN, footerY - 5)
    .lineTo(TABLE_RIGHT, footerY - 5)
    .lineWidth(0.5)
    .stroke(COLORS.border)
    .restore();

  doc.font("Helvetica").fontSize(7).fillColor(COLORS.textMuted);
  doc.text(`Total patients: ${totalPatients}`, MARGIN, footerY, { width: CONTENT_W / 2 });
  doc.text(`Page ${pageNum}`, MARGIN + CONTENT_W / 2, footerY, { width: CONTENT_W / 2, align: "right" });
}

// ─── Main PDF export ────────────────────────────────────────────

export const exportPatientsPdf = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;

    if (!hospitalId) {
      return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    }

    const hospital = await Hospital.findById(hospitalId).select("hospitalName").lean();
    if (!hospital) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Hospital not found" } });
    }

    req.setTimeout(300000);
    res.setTimeout(300000);

    // Fetch all patients first for accurate count
    const allPatients = await Patient.find({ hospitalId })
      .select("patientId patientName remarks createdAt")
      .sort({ createdAt: -1 })
      .lean();

    const totalPatients = allPatients.length;

    const safeHospitalName = hospital.hospitalName.replace(/[^a-z0-9]/gi, "_");
    const filename = `Patient_Registry_${safeHospitalName}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Disable autoPageBreak to prevent redundant pages when drawing near margins
    const doc = new PDFDocument({ margin: 0, size: "LETTER", autoPageBreak: false });
    doc.pipe(res);

    // Cover Page
    drawCoverPage(doc, hospital.hospitalName, totalPatients);
    doc.addPage();

    let pageNum = 1;
    let y = drawPageHeader(doc, hospital.hospitalName, pageNum);

    if (totalPatients === 0) {
      doc.font("Helvetica").fontSize(12).fillColor(COLORS.textMuted);
      doc.text("No patient records found.", MARGIN, y + 20, { width: CONTENT_W, align: "center" });
      drawPageFooter(doc, pageNum, 0);
      doc.end();
      return;
    }

    // Table
    y = drawTableHeader(doc, y);

    for (let i = 0; i < allPatients.length; i++) {
      const p = allPatients[i];

      // Check if we need a new page (leave room for footer)
      if (y + ROW_H > PAGE_H - 45) {
        drawPageFooter(doc, pageNum, totalPatients);
        doc.addPage();
        pageNum++;
        y = drawPageHeader(doc, hospital.hospitalName, pageNum);
        y = drawTableHeader(doc, y);
      }

      y = drawTableRow(doc, y, {
        index: i + 1,
        name: p.patientName,
        patientId: p.patientId || "—",
        remarks: p.remarks,
        registered: new Date(p.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" }),
      }, i);
    }

    // Bottom border of table
    doc.save()
      .moveTo(MARGIN, y)
      .lineTo(TABLE_RIGHT, y)
      .lineWidth(1)
      .stroke(COLORS.border)
      .restore();

    drawPageFooter(doc, pageNum, totalPatients);
    doc.end();
  } catch (error) {
    req.log.error({ event: "export_pdf_failed", err: error }, "[Export] PDF error");
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: { code: "EXPORT_ERROR", message: "PDF export failed. Please try again." },
      });
    }
  }
};

export default { exportPatientsPdf };
