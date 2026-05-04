/**
 * One-off cleanup: hard-delete hospitals previously soft-deleted
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

const run = async () => {
  // 2. DYNAMICALLY IMPORT SERVICES
  const { default: mongoose } = await import("mongoose");

  const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!MONGODB_URI) {
    console.error("MONGODB_URI not set in .env");
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  const Hospital = mongoose.connection.collection("hospitals");

  const victims = await Hospital.find({ deletionStatus: "deleted" }, {
    projection: { _id: 1, hospitalName: 1, email: 1 },
  }).toArray();

  console.log(`Found ${victims.length} soft-deleted hospitals:`);
  victims.forEach((v) => console.log(`  - ${v._id}  ${v.hospitalName}  ${v.email}`));

  if (victims.length === 0) {
    await mongoose.disconnect();
    return;
  }

  const result = await Hospital.deleteMany({ deletionStatus: "deleted" });
  console.log(`\nPurged ${result.deletedCount} hospital documents.`);

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Purge failed:", err);
  process.exit(1);
});
