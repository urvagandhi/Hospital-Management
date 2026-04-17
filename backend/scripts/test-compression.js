/**
 * Manual test for the compression service integration.
 * Calls compressionService directly — does not require running the full backend.
 *
 * Usage:
 *   node scripts/test-compression.js <patientId> [folderName]
 *
 * Examples:
 *   node scripts/test-compression.js 6654abc123def456     # full patient merged
 *   node scripts/test-compression.js 6654abc123def456 Id  # single folder "Id"
 *
 * Requires env vars: MONGODB_URI, COMPRESSION_SERVICE_URL, COMPRESSION_SERVICE_SECRET
 */

import "dotenv/config";
import fs from "fs";
import mongoose from "mongoose";
import Patient from "../src/models/Patient.js";
import {
  compressFolder,
  compressPatient,
  fetchMergedStream,
} from "../src/services/compression.service.js";

const [, , patientId, folderName] = process.argv;

if (!patientId) {
  console.error("Usage: node scripts/test-compression.js <patientId> [folderName]");
  process.exit(1);
}

if (!process.env.COMPRESSION_SERVICE_URL || !process.env.COMPRESSION_SERVICE_SECRET) {
  console.error("Missing COMPRESSION_SERVICE_URL or COMPRESSION_SERVICE_SECRET in env");
  process.exit(1);
}

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("Missing MONGODB_URI in env");
  process.exit(1);
}

await mongoose.connect(mongoUri);
console.log("[DB] Connected to", mongoUri.replace(/:([^@]+)@/, ":****@"));

try {
  const patient = await Patient.findById(patientId);
  if (!patient) {
    console.error(`Patient "${patientId}" not found`);
    process.exit(1);
  }

  console.log(`[Patient] ${patient.patientName} — ${patient.folders.length} folders`);

  if (folderName) {
    // ── Single folder test ──
    const folder = patient.folders.find(
      (f) => f.name.toLowerCase() === folderName.toLowerCase(),
    );
    if (!folder) {
      console.error(`Folder "${folderName}" not found`);
      process.exit(1);
    }

    const sourcePdfs = folder.files
      .filter((f) => f.cloudinaryPublicId)
      .map((f) => ({
        public_id: f.cloudinaryPublicId,
        uploaded_at: (f.uploadedAt || new Date()).toISOString(),
        resource_type: f.resourceType || "image",
        access_mode: f.accessMode || "signed",
      }));

    console.log(`[Test] Compressing folder "${folder.name}" (${sourcePdfs.length} files)...`);
    const start = Date.now();

    const result = await compressFolder({
      folderId: String(folder._id),
      userId: "test-script",
      patientId,
      patientName: patient.patientName,
      displayName: folder.name,
      filesInfo: folder.files.map((f) => ({
        file_name: f.fileName,
        page_count: f.pageCount ?? null,
      })),
      sourcePdfs,
    });

    console.log(`[Result]`, JSON.stringify(result, null, 2));
    console.log(`[Time] ${Date.now() - start}ms`);

    const upstream = await fetchMergedStream(result.merged_url);
    const buf = Buffer.from(await upstream.arrayBuffer());
    const outPath = `/tmp/test-folder-${folderName}.pdf`;
    fs.writeFileSync(outPath, buf);
    console.log(`[Saved] ${outPath} (${buf.length} bytes)`);
  } else {
    // ── Full patient test (merged mode) ──
    const folderMap = patient.folders
      .filter((f) => f.files.length > 0)
      .map((folder) => ({
        folder_id: String(folder._id),
        display_name: folder.name,
        patient_name: patient.patientName,
        source_pdfs: folder.files
          .filter((f) => f.cloudinaryPublicId)
          .map((f) => ({
            public_id: f.cloudinaryPublicId,
            uploaded_at: (f.uploadedAt || new Date()).toISOString(),
            resource_type: f.resourceType || "image",
            access_mode: f.accessMode || "signed",
          })),
        files_info: folder.files.map((f) => ({
          file_name: f.fileName,
          page_count: f.pageCount ?? null,
        })),
      }));

    console.log(
      `[Test] Compressing patient "${patient.patientName}" (${folderMap.length} folders, ${folderMap.reduce((s, f) => s + f.source_pdfs.length, 0)} total files)...`,
    );
    const start = Date.now();

    const result = await compressPatient({
      patientId,
      userId: "test-script",
      patientName: patient.patientName,
      folderMap,
    });

    console.log(`[Result]`, JSON.stringify(result, null, 2));
    console.log(`[Time] ${Date.now() - start}ms`);

    const upstream = await fetchMergedStream(result.merged_url);
    const buf = Buffer.from(await upstream.arrayBuffer());
    const outPath = `/tmp/test-patient-${patient.patientName.replace(/\s+/g, "_")}.pdf`;
    fs.writeFileSync(outPath, buf);
    console.log(`[Saved] ${outPath} (${buf.length} bytes)`);
  }
} finally {
  await mongoose.disconnect();
  console.log("[DB] Disconnected");
}
