/**
 * Migration: Rename + reorder patient folders to match new folder structure
 *
 * What it does (non-destructive — files inside folders are never touched):
 *   1. Renames old folder names → new names
 *   2. Reorders the folders array to match the new canonical sequence
 *   3. Adds any missing new folders (others, extra, etc.) at the right position
 *
 * Run: node src/migrate-folders.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

const devEnvPath = path.resolve(process.cwd(), ".env.development");
if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath });
else dotenv.config();

import Patient from "../src/models/Patient.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/hospital-management";

// ─── Rename map: old name → new name ───────────────────────────────────────
const RENAME_MAP = {
  "claim paper":                  "claim documents",
  "hospital bills":               "hospital bill",
  "discharge summary":            "consultation papers",
  "hospital documents":           "hospital indoor case, ot note, daily note",
  "medical prescription & bills": "bills and prescriptions",
  "consent":                      "consents",
  // unchanged — listed for completeness
  "id":      "id",
  "reports": "reports",
};

// ─── Canonical order (new folder structure) ────────────────────────────────
const CANONICAL_ORDER = [
  "claim documents",
  "id",
  "consultation papers",
  "hospital indoor case, ot note, daily note",
  "reports",
  "bills and prescriptions",
  "hospital bill",
  "others",
  "extra",
  "consents",
];

async function migrate() {
  console.log("\n=== Folder Migration ===\n");

  await mongoose.connect(MONGO_URI);
  console.log("[DB] Connected to", MONGO_URI.replace(/:([^@]+)@/, ":****@"));

  const patients = await Patient.find({}).lean();
  console.log(`[Migration] Found ${patients.length} patients to process.\n`);

  let updated = 0;
  let skipped = 0;

  for (const patient of patients) {
    // Step 1: Build a map of current folders by name (after renaming)
    const folderMap = new Map();

    for (const folder of patient.folders) {
      const newName = RENAME_MAP[folder.name] ?? folder.name;
      // If two old folders map to the same new name (shouldn't happen), merge files
      if (folderMap.has(newName)) {
        folderMap.get(newName).files.push(...(folder.files || []));
      } else {
        folderMap.set(newName, { ...folder, name: newName });
      }
    }

    // Step 2: Build the reordered folders array following canonical order
    const reordered = [];
    for (const canonicalName of CANONICAL_ORDER) {
      if (folderMap.has(canonicalName)) {
        // Existing folder (possibly renamed) — keep its _id and files
        reordered.push(folderMap.get(canonicalName));
        folderMap.delete(canonicalName);
      } else {
        // New folder not present yet — add it empty (no _id, Mongoose will generate)
        reordered.push({ name: canonicalName, files: [] });
      }
    }

    // Step 3: Append any remaining folders not in canonical order (custom folders)
    for (const [, folder] of folderMap) {
      reordered.push(folder);
    }

    // Step 4: Persist
    await Patient.updateOne(
      { _id: patient._id },
      { $set: { folders: reordered } },
    );

    updated++;
    console.log(`  [✓] ${patient.patientName} (${patient.patientId})`);
  }

  console.log(`\n=== Migration Complete ===`);
  console.log(`  Updated: ${updated}`);
  console.log(`  Skipped: ${skipped}`);

  await mongoose.disconnect();
  console.log("\n[DB] Disconnected.");
  process.exit(0);
}

migrate().catch((err) => {
  console.error("[Migration] Fatal error:", err);
  process.exit(1);
});
