/**
 * MediVault Brand Migration Script
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import fs from 'fs';

// 1. LOAD ENV IF PRESENT
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const possiblePaths = [
  path.resolve(__dirname, '../.env'),    // backend/.env
  path.resolve(__dirname, '../../.env')  // root/.env
];

let envPath = possiblePaths.find(p => fs.existsSync(p));

if (envPath) {
  console.log(`✅ Loading environment from: ${envPath}`);
  dotenv.config({ path: envPath });
} else {
  console.log(`ℹ️ No .env file found, using system environment variables.`);
}

async function run() {
  // 2. DYNAMICALLY IMPORT EVERYTHING ELSE
  // This ensures process.env is populated BEFORE storage.service.js runs
  const { default: mongoose } = await import('mongoose');
  const { default: Hospital } = await import('../src/models/Hospital.js');
  const { default: Patient } = await import('../src/models/Patient.js');
  const { cloudinary } = await import('../src/services/storage.service.js');

  const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;

  console.log("🚀 Starting Brand Migration: HospitALL → MediVault");
  
  if (!MONGO_URI) {
    console.error("❌ ERROR: MONGODB_URI not found in .env");
    process.exit(1);
  }
  
  if (!process.env.CLOUDINARY_API_KEY) {
    console.error("❌ ERROR: Cloudinary API Key not found. Check your .env file at:", envPath);
    process.exit(1);
  }

  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");

    let migratedHospitals = 0;
    let migratedFiles = 0;
    let skipped = 0;
    let errors = 0;

    // --- 1. Migrate Hospital Logos ---
    console.log("\n🏥 Migrating Hospital Logos...");
    const hospitals = await Hospital.find({ logoUrl: /HospitALL/ });

    for (const hospital of hospitals) {
      try {
        const oldUrl = hospital.logoUrl;
        const urlParts = oldUrl.split('/');
        const fileNameWithExt = urlParts.pop();
        const folderIndex = urlParts.findIndex(p => p === 'HospitALL');
        
        if (folderIndex === -1) {
          skipped++;
          continue;
        }

        const oldPublicId = urlParts.slice(folderIndex).join('/') + '/' + fileNameWithExt.split('.')[0];
        const newPublicId = oldPublicId.replace('HospitALL', 'MediVault');

        console.log(`   Renaming Logo: ${oldPublicId} → ${newPublicId}`);
        
        let result;
        try {
          result = await cloudinary.uploader.rename(oldPublicId, newPublicId, { resource_type: 'image' });
        } catch (renameErr) {
          if (renameErr.message.includes("Resource not found")) {
            console.log(`     ⚠️  Logo already moved in Cloudinary. Updating DB record only.`);
            hospital.logoUrl = hospital.logoUrl.replace('HospitALL', 'MediVault');
          } else {
            throw renameErr;
          }
        }

        if (result) {
          hospital.logoUrl = result.secure_url;
        }

        await hospital.save();
        migratedHospitals++;
      } catch (err) {
        console.error(`   ❌ Failed to migrate logo for ${hospital.hospitalName}:`, err.message);
        errors++;
      }
    }

    // --- 2. Migrate Patient Documents ---
    console.log("\n📄 Migrating Patient Documents...");
    const patients = await Patient.find({
      "folders.files.cloudinaryPublicId": { $regex: /^HospitALL/ }
    });

    for (const patient of patients) {
      let patientDirty = false;
      for (const folder of patient.folders) {
        for (const file of folder.files) {
          const oldPublicId = file.cloudinaryPublicId;
          if (oldPublicId && oldPublicId.startsWith('HospitALL')) {
            try {
              const newPublicId = oldPublicId.replace('HospitALL', 'MediVault');
              console.log(`   Moving File: ${oldPublicId} → ${newPublicId}`);
              
              let result;
              try {
                result = await cloudinary.uploader.rename(oldPublicId, newPublicId, { 
                  resource_type: file.resourceType || 'raw' 
                });
              } catch (renameErr) {
                // If it's already moved, Cloudinary will say "Resource not found"
                if (renameErr.message.includes("Resource not found")) {
                  console.log(`     ⚠️  Already moved in Cloudinary. Updating DB record only.`);
                  // We need to construct the new URL manually since we didn't get a result object
                  const oldUrl = file.fileUrl;
                  file.fileUrl = oldUrl.replace('HospitALL', 'MediVault');
                  file.cloudinaryPublicId = newPublicId;
                } else {
                  throw renameErr;
                }
              }

              if (result) {
                file.cloudinaryPublicId = result.public_id;
                file.fileUrl = result.secure_url;
              }

              patientDirty = true;
              migratedFiles++;
            } catch (err) {
              console.error(`   ❌ Failed to move file ${file.fileName}:`, err.message);
              errors++;
            }
          }
        }
      }
      if (patientDirty) {
        await patient.save();
      }
    }

    console.log("\n" + "═".repeat(40));
    console.log("🏁 MIGRATION SUMMARY");
    console.log("═".repeat(40));
    console.log(`Hospitals Migrated : ${migratedHospitals}`);
    console.log(`Files Migrated     : ${migratedFiles}`);
    console.log(`Errors             : ${errors}`);
    console.log(`Skipped            : ${skipped}`);
    console.log("═".repeat(40) + "\n");

  } catch (err) {
    console.error("💥 Critical Migration Error:", err);
  } finally {
    await mongoose.disconnect();
    console.log("👋 DB Disconnected");
  }
}

run().catch(console.error);
