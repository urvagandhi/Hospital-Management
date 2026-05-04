/**
 * Migration: Add patientId to existing patients
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
  const { default: Patient } = await import("../src/models/Patient.js");
  const { default: Hospital } = await import("../src/models/Hospital.js");

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set in environment");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log("Connected to MongoDB");

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
    let counter = hospital.patientIdCounter || 0;

    console.log(`Hospital "${hospital.hospitalName}" (${initials}): ${patients.length} patients, current counter: ${counter}`);

    for (const patient of patients) {
      counter++;
      const patientId = `${initials}-${String(counter).padStart(3, "0")}`;

      await Patient.updateOne({ _id: patient._id }, { $set: { patientId } });
      console.log(`  ${patient._id} → ${patientId} (${patient.patientName})`);
    }

    await Hospital.updateOne({ _id: hospitalId }, { $set: { patientIdCounter: counter } });
    console.log(`  Updated ${hospital.hospitalName} patientIdCounter to ${counter}`);
  }

  console.log("\nMigration complete!");
  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
