/**
 * One-off cleanup: hard-delete hospitals previously soft-deleted
 * (deletionStatus === "deleted") so they stop appearing in the dashboard.
 *
 * Audit logs reference the hospital ObjectId and are NOT touched.
 *
 * Usage:  node scripts/purge-soft-deleted-hospitals.js
 */

import "dotenv/config";
import mongoose from "mongoose";

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("MONGODB_URI not set in .env");
  process.exit(1);
}

const run = async () => {
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
