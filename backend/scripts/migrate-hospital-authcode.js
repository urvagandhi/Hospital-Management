/**
 * Migration: Update Hospital documents for the new auth-code flow.
 *
 * This script does 4 things, each idempotent and safe to run multiple times:
 *
 *  1. Drops the legacy `username_1` unique index (so `null`-valued legacy
 *     records don't block new registrations).
 *
 *  2. Removes the deprecated `username` field from every hospital
 *     document (the field no longer exists in the Mongoose schema so
 *     it would otherwise linger as orphaned data).
 *
 *  3. Renames the legacy `patientCounter` field to `patientIdCounter`
 *     (only on documents that still have the old name).
 *
 *  4. Assigns `authCode` to every hospital that either:
 *       - doesn't have one yet, OR
 *       - has one that doesn't match the new 6-digit numeric format
 *         (e.g. a prior migration generated "H7K2M9"-style alphanumeric codes).
 *     Regenerated codes are 6-digit numeric, leading zeros preserved (e.g. "041326").
 *
 * Does NOT touch any patient/folder/file data.
 *
 * Usage:  node scripts/migrate-hospital-authcode.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import Hospital from "../src/models/Hospital.js";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in environment");
  process.exit(1);
}

// Matches the new authCode format: exactly 6 digits (leading zeros allowed)
const NUMERIC_AUTH_CODE_RE = /^\d{6}$/;

async function migrate() {
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
  // Load all hospitals (we need to inspect authCode format, which we can't
  // express efficiently as a Mongo query for "not a 6-digit string").
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

  // Also report hospitals that already had a valid numeric code (for visibility)
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
