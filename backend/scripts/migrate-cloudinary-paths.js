/**
 * One-time migration: move existing Cloudinary files from flat structure
 *   hospital/documents/{randomId}
 * to the organized structure
 *   HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{hash}
 *
 * Uses Cloudinary rename API — no bytes are re-uploaded.
 * Updates cloudinaryPublicId + fileUrl in MongoDB atomically per file.
 *
 * Run: node --env-file=.env src/migrate-cloudinary-paths.js
 */

import mongoose from 'mongoose';
import Patient from '../src/models/Patient.js';
import { cloudinary, slugifyFolder } from '../src/services/storage.service.js';

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

// Extract creation date from a MongoDB ObjectId (first 4 bytes = unix timestamp)
function dateFromObjectId(id) {
  const ts = parseInt(String(id).slice(0, 8), 16);
  return new Date(ts * 1000);
}

function buildNewPublicId(hospitalId, patientMongoId, folderName, fileId) {
  const folderSlug = slugifyFolder(folderName);
  const d = dateFromObjectId(fileId);
  const dateStr = d.toISOString().slice(0, 10).replace(/-/g, ''); // YYYYMMDD
  // use last 4 chars of the file's own _id as the hash — globally unique, stable
  const hash = String(fileId).slice(-4);
  return `HospitALL/h_${hospitalId}/p_${patientMongoId}/${folderSlug}/${dateStr}_${hash}`;
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('DB connected\n');

  const patients = await Patient.find({}).select('_id hospitalId patientId folders');

  let migrated = 0, skipped = 0, failed = 0;

  for (const patient of patients) {
    let patientDirty = false;

    for (const folder of patient.folders || []) {
      for (const file of folder.files || []) {
        const old = file.cloudinaryPublicId;

        // Skip if already migrated (doesn't start with old prefix)
        if (!old || !old.startsWith('hospital/documents/')) {
          skipped++;
          continue;
        }

        const newPublicId = buildNewPublicId(
          patient.hospitalId.toString(),
          patient._id.toString(),
          folder.name,
          file._id.toString(),
        );

        process.stdout.write(`  [${patient.patientId}] ${folder.name}\n    ${old}\n    → ${newPublicId}\n`);

        try {
          // Rename in Cloudinary (server-side move, no re-upload)
          const result = await cloudinary.uploader.rename(old, newPublicId, {
            resource_type: file.resourceType || 'raw',
            overwrite: false,
          });

          // Update the file record in memory; save once per patient at the end
          file.cloudinaryPublicId = result.public_id;
          file.fileUrl = result.secure_url;
          patientDirty = true;
          migrated++;
          console.log('    ✓ moved\n');
        } catch (err) {
          failed++;
          console.error('    ✗ FAILED:', err.message, '\n');
        }
      }
    }

    if (patientDirty) {
      await patient.save();
    }
  }

  console.log('═══════════════════════════════');
  console.log(`Migrated : ${migrated}`);
  console.log(`Skipped  : ${skipped} (already on new path or no publicId)`);
  console.log(`Failed   : ${failed}`);
  console.log('═══════════════════════════════');

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
