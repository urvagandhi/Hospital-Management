/**
 * Migration: Update Hospital documents for the new auth-code flow.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

// 1. LOAD ENV IMMEDIATELY
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const possiblePaths = [
  path.resolve(__dirname, '../.env'),    // backend/.env
  path.resolve(__dirname, '../../.env')  // root/.env
];
let envPath = possiblePaths.find(p => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
}

async function migrate() {
  // 2. DYNAMICALLY IMPORT SERVICES
  const { default: mongoose } = await import("mongoose");
  const { default: Hospital } = await import("../src/models/Hospital.js");

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set in environment");
    process.exit(1);
  }

  // Matches the new authCode format: exactly 6 digits (leading zeros allowed)
  const NUMERIC_AUTH_CODE_RE = /^\d{6}$/;

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const collection = mongoose.connection.db.collection("hospitals");

  // ── Step 1: Drop the legacy `username_1` unique index if it exists ──────
  try {
    const indexes = await collection.indexes();
    const usernameIdx = indexes.find((i) => i.name === "username_1");
    if (usernameIdx) {
      await collection.dropIndex("username_1");
      console.log("[1/4] Dropped legacy index: username_1");
    } else {
      console.log("[1/4] No legacy username_1 index to drop");
    }
  } catch (err) {
    console.warn("[1/4] Index drop failed (may be safe to ignore):", err.message);
  }

  // ── Step 2: Remove `username` field from all documents ──────────────────
  const unsetRes = await collection.updateMany(
    { username: { $exists: true } },
    { $unset: { username: "" } },
  );
  console.log(`[2/4] Removed 'username' field from ${unsetRes.modifiedCount} hospital(s)`);

  // ── Step 3: Rename patientCounter → patientIdCounter ────────────────────
  const renameRes = await collection.updateMany(
    { patientCounter: { $exists: true } },
    { $rename: { patientCounter: "patientIdCounter" } },
  );
  console.log(`[3/4] Renamed patientCounter → patientIdCounter on ${renameRes.modifiedCount} hospital(s)`);

  // ── Step 4: Assign/regenerate authCode where missing or in old format ───
  const hospitals = await Hospital.find({}).select("_id hospitalName authCode");

  const needsNewCode = hospitals.filter((h) => {
    if (!h.authCode) return true;                    // missing
    if (!NUMERIC_AUTH_CODE_RE.test(h.authCode)) return true; // legacy alphanumeric
    return false;
  });

  console.log(`[4/4] ${needsNewCode.length} hospital(s) need authCode assigned or regenerated`);

  for (const h of needsNewCode) {
    const oldCode = h.authCode || "(none)";
    const newCode = await Hospital.generateUniqueAuthCode();
    await Hospital.updateOne({ _id: h._id }, { $set: { authCode: newCode } });
    console.log(`       ${h.hospitalName.padEnd(30)}  ${oldCode.padEnd(8)} → ${newCode}`);
  }

  const alreadyNumeric = hospitals.length - needsNewCode.length;
  if (alreadyNumeric > 0) {
    console.log(`       ${alreadyNumeric} hospital(s) already had valid 6-digit authCode — unchanged`);
  }

  console.log("\nMigration complete!");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
