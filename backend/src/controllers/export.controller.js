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
  { label: "#",           x: MARGIN,       w: 30,  align: "left" },
  { label: "Patient Name", x: MARGIN + 30, w: 260, align: "left" },
  { label: "Patient ID",  x: MARGIN + 290, w: 120, align: "left" },
  { label: "Created",     x: MARGIN + 410, w: 122, align: "left" },
];

const ROW_H = 22;
const HEADER_ROW_H = 26;
const COLORS = {
  primary:     "#1e40af",
  primaryLight:"#dbeafe",
  headerBg:    "#1e3a5f",
  headerText:  "#ffffff",
  rowAlt:      "#f8fafc",
  rowNormal:   "#ffffff",
  border:      "#e2e8f0",
  textDark:    "#1e293b",
  textMuted:   "#64748b",
  active:      "#059669",
  inactive:    "#dc2626",
  archived:    "#6b7280",
};

// ─── Helpers ────────────────────────────────────────────────────

function drawRect(doc, x, y, w, h, color) {
  doc.save().rect(x, y, w, h).fill(color).restore();
}

function drawTableHeader(doc, y) {
  // Dark header row
  drawRect(doc, MARGIN, y, CONTENT_W, HEADER_ROW_H, COLORS.headerBg);

  const textY = y + (HEADER_ROW_H - 9) / 2;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COLORS.headerText);

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

  const textY = y + (ROW_H - 8) / 2;

  // Row number
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.textMuted);
  doc.text(String(data.index), COLUMNS[0].x + 5, textY, { width: COLUMNS[0].w - 10 });

  // Patient name
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.textDark);
  doc.text(data.name, COLUMNS[1].x + 5, textY, { width: COLUMNS[1].w - 10, lineBreak: false });

  // Patient ID
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.primary);
  doc.text(data.patientId, COLUMNS[2].x + 5, textY, { width: COLUMNS[2].w - 10, lineBreak: false });

  // Created date
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
  doc.text(data.registered, COLUMNS[3].x + 5, textY, { width: COLUMNS[3].w - 10, lineBreak: false });

  return y + ROW_H;
}

function drawPageHeader(doc, hospitalName, pageNum) {
  // Blue accent bar at top
  drawRect(doc, 0, 0, PAGE_W, 4, COLORS.primary);

  if (pageNum === 1) {
    // Title section on first page
    doc.font("Helvetica-Bold").fontSize(20).fillColor(COLORS.textDark);
    doc.text(hospitalName, MARGIN, 30, { width: CONTENT_W });

    doc.font("Helvetica").fontSize(10).fillColor(COLORS.textMuted);
    doc.text("Patient Records Report", MARGIN, 54);

    // Generation info - right aligned
    const dateStr = new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
    doc.text(`Generated: ${dateStr}, ${timeStr}`, MARGIN, 36, { width: CONTENT_W, align: "right" });

    // Separator
    doc.save()
      .moveTo(MARGIN, 72)
      .lineTo(TABLE_RIGHT, 72)
      .lineWidth(1)
      .stroke(COLORS.border)
      .restore();

    return 84;
  } else {
    // Continuation header
    doc.font("Helvetica").fontSize(8).fillColor(COLORS.textMuted);
    doc.text(`${hospitalName} — Patient Records (continued)`, MARGIN, 16, { width: CONTENT_W });
    return 32;
  }
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
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
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

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `patients_${dateStr}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    const doc = new PDFDocument({ margin: MARGIN, size: "LETTER" });
    doc.pipe(res);

    let pageNum = 1;
    let y = drawPageHeader(doc, hospital.hospitalName, pageNum);

    if (totalPatients === 0) {
      doc.font("Helvetica").fontSize(12).fillColor(COLORS.textMuted);
      doc.text("No patient records found.", MARGIN, y + 20, { width: CONTENT_W, align: "center" });
      drawPageFooter(doc, pageNum, 0);
      doc.end();
      return;
    }

    // Summary cards row
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = allPatients.filter((p) => new Date(p.createdAt) >= weekAgo).length;

    const cardW = (CONTENT_W - 16) / 2;
    const cards = [
      { label: "Total Patients", value: totalPatients, color: COLORS.primary },
      { label: "Added This Week", value: recentCount, color: COLORS.active },
    ];

    for (let i = 0; i < cards.length; i++) {
      const cx = MARGIN + i * (cardW + 8);
      drawRect(doc, cx, y, cardW, 42, cards[i].color + "0d");

      // Card border
      doc.save().roundedRect(cx, y, cardW, 42, 4).lineWidth(0.5).stroke(cards[i].color + "30").restore();

      doc.font("Helvetica-Bold").fontSize(16).fillColor(cards[i].color);
      doc.text(String(cards[i].value), cx + 12, y + 8, { width: cardW - 24 });

      doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.textMuted);
      doc.text(cards[i].label, cx + 12, y + 28, { width: cardW - 24 });
    }

    y += 54;

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
