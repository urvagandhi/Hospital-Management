/**
 * MediVault Brand Migration Script
 * 
 * 1. Renames Cloudinary folders/files ONLY from 'HospitALL' to 'MediVault'.
 * 2. Updates MongoDB records (Hospital logos and Patient documents) with new URLs and Public IDs.
 * 
 * Run: docker compose exec backend node scripts/migrate-brand-paths.js
 */

import mongoose from 'mongoose';
import Hospital from '../src/models/Hospital.js';
import Patient from '../src/models/Patient.js';
import { cloudinary } from '../src/services/storage.service.js';
import 'dotenv/config';

const MONGO_URI = process.env.MONGODB_URI;

async function migrateBrand() {
  console.log("🚀 Starting Brand Migration: HospitALL → MediVault");
  
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ MongoDB Connected");

    let migratedHospitals = 0;
    let migratedFiles = 0;
    let skipped = 0;
    let errors = 0;

    // --- 1. Migrate Hospital Logos (Only if they contain HospitALL) ---
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
        const result = await cloudinary.uploader.rename(oldPublicId, newPublicId, { resource_type: 'image' });
        
        hospital.logoUrl = result.secure_url;
        await hospital.save();
        migratedHospitals++;
      } catch (err) {
        console.error(`   ❌ Failed to migrate logo for ${hospital.hospitalName}:`, err.message);
        errors++;
      }
    }

    // --- 2. Migrate Patient Documents (Only if they start with HospitALL) ---
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
              
              const result = await cloudinary.uploader.rename(oldPublicId, newPublicId, { 
                resource_type: file.resourceType || 'raw' 
              });

              file.cloudinaryPublicId = result.public_id;
              file.fileUrl = result.secure_url;
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

migrateBrand().catch(console.error);
