/**
 * Migration: Add patientId to existing patients
 *
 * This script:
 * 1. Finds all patients without a patientId field
 * 2. Groups them by hospitalId
 * 3. Derives hospital initials from hospital name
 * 4. Assigns sequential patientId values (e.g. SH-001, SH-002)
 * 5. Updates Hospital.patientCounter to reflect the highest assigned number
 *
 * Safe to run multiple times — skips patients that already have a patientId.
 * Does NOT delete any data, documents, or folders.
 *
 * Usage: node scripts/migrate-patient-ids.js
 */

import "dotenv/config";
import mongoose from "mongoose";
import Patient from "../src/models/Patient.js";
import Hospital from "../src/models/Hospital.js";

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in environment");
  process.exit(1);
}

async function migrate() {
  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

  // Find patients missing patientId
  const patientsWithoutId = await Patient.find({
    $or: [{ patientId: { $exists: false } }, { patientId: null }, { patientId: "" }],
  })
    .sort({ createdAt: 1 })
    .lean();

  console.log(`Found ${patientsWithoutId.length} patients without patientId`);

  if (patientsWithoutId.length === 0) {
    console.log("Nothing to migrate. All patients already have patientId.");
    await mongoose.disconnect();
    return;
  }

  // Group by hospitalId
  const grouped = {};
  for (const p of patientsWithoutId) {
    const hid = p.hospitalId.toString();
    if (!grouped[hid]) grouped[hid] = [];
    grouped[hid].push(p);
  }

  console.log(`Grouped into ${Object.keys(grouped).length} hospitals`);

  for (const [hospitalId, patients] of Object.entries(grouped)) {
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      console.warn(`Hospital ${hospitalId} not found — skipping ${patients.length} patients`);
      continue;
    }

    const initials = hospital.getInitials();
    let counter = hospital.patientCounter || 0;

    console.log(`Hospital "${hospital.hospitalName}" (${initials}): ${patients.length} patients, current counter: ${counter}`);

    for (const patient of patients) {
      counter++;
      const patientId = `${initials}-${String(counter).padStart(3, "0")}`;

      await Patient.updateOne({ _id: patient._id }, { $set: { patientId } });
      console.log(`  ${patient._id} → ${patientId} (${patient.patientName})`);
    }

    // Update hospital counter
    await Hospital.updateOne({ _id: hospitalId }, { $set: { patientCounter: counter } });
    console.log(`  Updated ${hospital.hospitalName} patientCounter to ${counter}`);
  }

  console.log("\nMigration complete!");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
