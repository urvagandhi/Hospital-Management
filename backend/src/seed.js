/**
 * Seed Script — Multi-tenant demo data
 *
 * Creates:
 *   - 1 admin hospital  (City Medical Center)  + 15 patients
 *   - 4 regular hospitals                       + 8–12 patients each
 *   - All passwords: "Test@1234"
 *   - TOTP disabled (fresh accounts, ready for setup)
 *   - mustChangePassword: false (so you can login directly)
 *   - Varied registration dates for patients
 *
 * Run:  node src/seed.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";

// Load env
const devEnvPath = path.resolve(process.cwd(), ".env.development");
if (fs.existsSync(devEnvPath)) dotenv.config({ path: devEnvPath });
else dotenv.config();

import Hospital from "./models/Hospital.js";
import Patient from "./models/Patient.js";
import Session from "./models/Session.js";
import AuditLog from "./models/AuditLog.js";
import BackupCode from "./models/BackupCode.js";
import Otp from "./models/Otp.js";
import PendingHospital from "./models/PendingHospital.js";
import { hashPassword } from "./utils/hash.js";

const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/hospital-management";
const PASSWORD = "Test@1234";

// ─── Hospital data ───

const hospitals = [
  {
    hospitalName: "City Medical Center",
    username: "city_medical",
    email: "admin@citymedical.com",
    phone: "+919876543210",
    role: "admin",
    department: "Multi-Specialty",
    address: "42 MG Road",
    city: "Mumbai",
    state: "Maharashtra",
    zipCode: "400001",
    logoUrl: "https://ui-avatars.com/api/?name=City+Medical&background=1d4ed8&color=fff&size=150&bold=true&format=png",
  },
  {
    hospitalName: "Sunrise Health Clinic",
    username: "sunrise_health",
    email: "admin@sunrisehealth.in",
    phone: "+919876543211",
    role: "hospital",
    department: "General Medicine",
    address: "15 Nehru Nagar",
    city: "Delhi",
    state: "Delhi",
    zipCode: "110001",
    logoUrl: "https://ui-avatars.com/api/?name=Sunrise+Health&background=059669&color=fff&size=150&bold=true&format=png",
  },
  {
    hospitalName: "LifeCare Hospital",
    username: "lifecare_hosp",
    email: "admin@lifecare.org",
    phone: "+919876543212",
    role: "hospital",
    department: "Cardiology",
    address: "78 Park Street",
    city: "Kolkata",
    state: "West Bengal",
    zipCode: "700016",
    logoUrl: "https://ui-avatars.com/api/?name=LifeCare&background=dc2626&color=fff&size=150&bold=true&format=png",
  },
  {
    hospitalName: "Green Valley Medical",
    username: "greenvalley_med",
    email: "admin@greenvalley.com",
    phone: "+919876543213",
    role: "hospital",
    department: "Pediatrics",
    address: "3 Residency Road",
    city: "Bangalore",
    state: "Karnataka",
    zipCode: "560025",
    logoUrl: "https://ui-avatars.com/api/?name=Green+Valley&background=7c3aed&color=fff&size=150&bold=true&format=png",
  },
  {
    hospitalName: "Apollo Care Institute",
    username: "apollo_care",
    email: "admin@apollocare.in",
    phone: "+919876543214",
    role: "hospital",
    department: "Orthopedics",
    address: "101 Anna Salai",
    city: "Chennai",
    state: "Tamil Nadu",
    zipCode: "600002",
    logoUrl: "https://ui-avatars.com/api/?name=Apollo+Care&background=ea580c&color=fff&size=150&bold=true&format=png",
  },
];

// ─── Patient data pool ───

const firstNames = [
  "Aarav", "Vivaan", "Aditya", "Vihaan", "Arjun",
  "Reyansh", "Sai", "Arnav", "Dhruv", "Kabir",
  "Ananya", "Diya", "Myra", "Sara", "Aadhya",
  "Isha", "Kiara", "Riya", "Priya", "Neha",
  "Rohan", "Karan", "Raj", "Amit", "Suresh",
  "Meera", "Pooja", "Sneha", "Kavya", "Tanvi",
  "Vikram", "Nikhil", "Rahul", "Sanjay", "Deepak",
  "Lakshmi", "Radha", "Gita", "Suman", "Rekha",
];

const lastNames = [
  "Sharma", "Patel", "Singh", "Kumar", "Gupta",
  "Reddy", "Nair", "Joshi", "Mehta", "Shah",
  "Verma", "Iyer", "Rao", "Pillai", "Das",
  "Malhotra", "Chopra", "Banerjee", "Mukherjee", "Sinha",
];

const statuses = ["active", "active", "active", "active", "inactive", "archived"];

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randomPhone() {
  return "+91" + (7000000000 + Math.floor(Math.random() * 2999999999));
}

function randomDob() {
  return randomDate(new Date(1950, 0, 1), new Date(2010, 11, 31));
}

function generatePatients(hospitalId, count, mrnPrefix) {
  const patients = [];
  // Spread createdAt over last 2 years
  const now = new Date();
  const twoYearsAgo = new Date(now);
  twoYearsAgo.setFullYear(now.getFullYear() - 2);

  for (let i = 0; i < count; i++) {
    const first = firstNames[Math.floor(Math.random() * firstNames.length)];
    const last = lastNames[Math.floor(Math.random() * lastNames.length)];
    const createdAt = randomDate(twoYearsAgo, now);

    patients.push({
      hospitalId,
      patientName: `${first} ${last}`,
      email: `${first.toLowerCase()}.${last.toLowerCase()}${Math.floor(Math.random() * 99)}@email.com`,
      phone: randomPhone(),
      dateOfBirth: randomDob(),
      medicalRecordNumber: `${mrnPrefix}-${String(i + 1).padStart(4, "0")}`,
      status: statuses[Math.floor(Math.random() * statuses.length)],
      notes: i % 3 === 0 ? "Regular checkup patient" : i % 5 === 0 ? "Follow-up required" : "",
      createdAt,
      updatedAt: createdAt,
    });
  }
  return patients;
}

// ─── Main ───

async function seed() {
  console.log("\n=== Hospital Management — Seed Script ===\n");

  try {
    await mongoose.connect(MONGO_URI);
    console.log("[DB] Connected to", MONGO_URI.replace(/:([^@]+)@/, ":****@"));

    // ── Confirm destructive action ──
    console.log("[Seed] Dropping existing data (including all TOTP / sessions / OTPs)...");
    await Promise.all([
      Hospital.deleteMany({}),
      Patient.deleteMany({}),
      Session.deleteMany({}),
      AuditLog.deleteMany({}),
      BackupCode.deleteMany({}),
      Otp.deleteMany({}),
      PendingHospital.deleteMany({}),
    ]);
    console.log("[Seed] All collections cleared.\n");

    // ── Hash password once ──
    const passwordHash = await hashPassword(PASSWORD);
    console.log(`[Seed] Password for all accounts: ${PASSWORD}\n`);

    // ── Create hospitals ──
    const createdHospitals = [];
    const patientCounts = [15, 12, 10, 8, 9]; // patients per hospital
    const mrnPrefixes = ["CMC", "SHC", "LCH", "GVM", "ACI"];

    for (let i = 0; i < hospitals.length; i++) {
      const h = hospitals[i];
      const hospital = await Hospital.create({
        ...h,
        passwordHash,
        isActive: true,
        mustChangePassword: false,
        // TOTP fully reset
        totpEnabled: false,
        totpVerified: false,
        totpSecretEncrypted: null,
        totpPendingSecret: null,
        totpSetupAt: null,
        totpLastUsedAt: null,
        totpFailedAttempts: 0,
        totpLockedUntil: null,
        totpIssuer: null,
        totpSecretVersion: 1,
        // Auth reset
        failedLoginAttempts: 0,
        lockUntil: null,
        biometricKeys: [],
      });
      createdHospitals.push(hospital);

      const emoji = h.role === "admin" ? "(ADMIN)" : "       ";
      console.log(`  [Hospital] ${emoji} ${h.hospitalName}`);
      console.log(`             Login: ${h.email} | ${h.username} | ${h.phone}`);
    }

    console.log("");

    // ── Create patients for each hospital ──
    let totalPatients = 0;
    for (let i = 0; i < createdHospitals.length; i++) {
      const hospital = createdHospitals[i];
      const count = patientCounts[i];
      const prefix = mrnPrefixes[i];
      const patients = generatePatients(hospital._id, count, prefix);

      await Patient.insertMany(patients);
      totalPatients += count;

      console.log(`  [Patients] ${hospital.hospitalName}: ${count} patients (MRN: ${prefix}-XXXX)`);
    }

    console.log(`\n=== Seed Complete ===`);
    console.log(`  Hospitals: ${createdHospitals.length}`);
    console.log(`  Patients:  ${totalPatients}`);
    console.log(`  Password:  ${PASSWORD} (all accounts)`);
    console.log(`  TOTP:      Disabled (ready for setup on first mobile login)`);
    console.log(`\n  Login as admin:  admin@citymedical.com / city_medical / +919876543210`);
    console.log(`  Login as hospital: admin@sunrisehealth.in / sunrise_health / +919876543211\n`);

  } catch (error) {
    console.error("[Seed] Error:", error);
  } finally {
    await mongoose.disconnect();
    console.log("[DB] Disconnected.");
    process.exit(0);
  }
}

seed();
