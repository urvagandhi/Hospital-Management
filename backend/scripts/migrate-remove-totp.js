/**
 * Migration: Remove TOTP from the hospitals collection.
 *
 * Does 3 things, each idempotent:
 *
 *   1. $unset all TOTP fields from every hospital document:
 *        totpEnabled, totpVerified, totpSecretEncrypted, totpPendingSecret,
 *        totpSetupAt, totpLastUsedAt, totpFailedAttempts, totpLockedUntil,
 *        totpSecretVersion, totpIssuer
 *      (Schema no longer has these; without $unset they linger as orphan fields.)
 *
 *   2. Drop the dead `backupcodes` collection (was 1:many with Hospital).
 *
 *   3. Drop the dead `pendinghospitals` collection (replaced by Redis
 *      partial_reg during self-registration).
 *
 * Does NOT touch any patient, folder, file, session, or audit log data.
 *
 * Usage:  node scripts/migrate-remove-totp.js
 */

import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in environment");
  process.exit(1);
}

const TOTP_FIELDS = [
  "totpEnabled",
  "totpVerified",
  "totpSecretEncrypted",
  "totpPendingSecret",
  "totpSetupAt",
  "totpLastUsedAt",
  "totpFailedAttempts",
  "totpLockedUntil",
  "totpSecretVersion",
  "totpIssuer",
];

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB\n");

  const db = mongoose.connection.db;
  const hospitals = db.collection("hospitals");

  // ── Step 1: unset TOTP fields ───────────────────────────────────────────
  const unset = Object.fromEntries(TOTP_FIELDS.map((f) => [f, ""]));
  const selector = { $or: TOTP_FIELDS.map((f) => ({ [f]: { $exists: true } })) };

  const matched = await hospitals.countDocuments(selector);
  console.log(`[1/3] Found ${matched} hospital(s) with at least one TOTP field to remove`);

  if (matched > 0) {
    const res = await hospitals.updateMany(selector, { $unset: unset });
    console.log(`       Unset TOTP fields from ${res.modifiedCount} hospital(s)`);
  }

  // ── Step 2: drop backupcodes collection ─────────────────────────────────
  try {
    const collections = await db.listCollections({ name: "backupcodes" }).toArray();
    if (collections.length > 0) {
      await db.dropCollection("backupcodes");
      console.log("[2/3] Dropped 'backupcodes' collection");
    } else {
      console.log("[2/3] No 'backupcodes' collection to drop");
    }
  } catch (err) {
    console.warn("[2/3] backupcodes drop warning:", err.message);
  }

  // ── Step 3: drop pendinghospitals collection ────────────────────────────
  try {
    const collections = await db.listCollections({ name: "pendinghospitals" }).toArray();
    if (collections.length > 0) {
      await db.dropCollection("pendinghospitals");
      console.log("[3/3] Dropped 'pendinghospitals' collection");
    } else {
      console.log("[3/3] No 'pendinghospitals' collection to drop");
    }
  } catch (err) {
    console.warn("[3/3] pendinghospitals drop warning:", err.message);
  }

  console.log("\nMigration complete!");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
