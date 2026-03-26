/**
 * Export Controller
 * Generates PDFs for each module, compresses into a single ZIP archive,
 * and streams it to the client.
 */

import archiver from "archiver";
import PDFDocument from "pdfkit";
import Patient from "../models/Patient.js";
import Hospital from "../models/Hospital.js";

/**
 * POST /api/export/archive
 * Body: { modules: ["patients", "billing", "reports", ...] }
 */
export const exportArchive = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { modules } = req.body;

    if (!hospitalId) {
      return res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Unauthorized" } });
    }

    // Check role (admin or hospital — both can export their own data)
    const hospital = await Hospital.findById(hospitalId).select("hospitalName role").lean();
    if (!hospital) {
      return res.status(404).json({ success: false, error: { code: "NOT_FOUND", message: "Hospital not found" } });
    }

    // Set extended timeout for this endpoint (5 minutes)
    req.setTimeout(300000);
    res.setTimeout(300000);

    // Set response headers for ZIP download
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const filename = `hospital_export_${dateStr}.zip`;
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    // Create ZIP archive, pipe directly to response (no disk buffering)
    const archive = archiver("zip", { zlib: { level: 6 } });

    archive.on("error", (err) => {
      console.error("[Export] Archive error:", err);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: { code: "ARCHIVE_ERROR", message: "Archive generation failed" } });
      }
    });

    archive.pipe(res);

    // Process each module
    for (const moduleName of modules) {
      const pdfBuffer = await generateModulePdf(moduleName, hospitalId, hospital.hospitalName);
      const safeModuleName = moduleName.replace(/[^a-z0-9_-]/gi, "_");
      archive.append(pdfBuffer, { name: `${safeModuleName}.pdf` });
    }

    await archive.finalize();
  } catch (error) {
    console.error("[Export] Error:", error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: { code: "EXPORT_ERROR", message: "Export failed. Please try again." },
      });
    }
  }
};

/**
 * Generate a PDF buffer for a specific module
 */
async function generateModulePdf(moduleName, hospitalId, hospitalName) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      const chunks = [];

      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      // Header
      doc.fontSize(18).text(`${hospitalName} — ${formatModuleName(moduleName)}`, { align: "center" });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor("grey").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
      doc.moveDown(1.5);
      doc.fillColor("black");

      switch (moduleName.toLowerCase()) {
        case "patients": {
          const PAGE_SIZE = 100;
          let skip = 0;
          let totalAdded = 0;

          while (true) {
            const patients = await Patient.find({ hospitalId })
              .select("patientName email phone medicalRecordNumber status createdAt")
              .sort({ createdAt: -1 })
              .skip(skip)
              .limit(PAGE_SIZE)
              .lean();

            if (patients.length === 0 && totalAdded === 0) {
              doc.fontSize(12).text("No records found for Patients", { italic: true });
              break;
            }
            if (patients.length === 0) break;

            for (const p of patients) {
              if (doc.y > 700) doc.addPage();
              doc.fontSize(11).text(`${p.patientName}`, { continued: true });
              doc.fontSize(9).fillColor("grey").text(
                `  MRN: ${p.medicalRecordNumber || "N/A"} | Status: ${p.status || "active"} | Created: ${new Date(p.createdAt).toLocaleDateString()}`,
              );
              doc.fillColor("black");
              if (p.email) doc.fontSize(9).text(`  Email: ${p.email}`);
              if (p.phone) doc.fontSize(9).text(`  Phone: ${p.phone}`);
              doc.moveDown(0.3);
              totalAdded++;
            }

            skip += PAGE_SIZE;
          }
          break;
        }

        default: {
          // For any unrecognized module, include a "No records" placeholder
          doc.fontSize(12).text(`No records found for ${formatModuleName(moduleName)}`, { italic: true });
          break;
        }
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function formatModuleName(name) {
  return name.charAt(0).toUpperCase() + name.slice(1).replace(/[_-]/g, " ");
}

export default { exportArchive };
