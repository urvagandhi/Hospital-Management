/**
 * Seed Script - Create sample hospitals for testing
 * Run: node scripts/seed.js
 */

import mongoose from "mongoose";
import Hospital from "../src/models/Hospital.js";
import { hashPassword } from "../src/utils/hash.js";
import config from "../src/config/env.js";

const sampleHospitals = [
  {
    hospitalName: "City Medical Center",
    email: "admin@citymedical.com",
    phone: "+919876543210",
    password: "Password123",
    logoUrl: "https://via.placeholder.com/150?text=City+Medical",
    department: "General",
    address: "123 Medical Lane",
    city: "Mumbai",
    state: "Maharashtra",
    zipCode: "400001",
  },
  {
    hospitalName: "Green Valley Hospital",
    email: "admin@greenvalley.com",
    phone: "+919876543211",
    password: "Password123",
    logoUrl: "https://via.placeholder.com/150?text=Green+Valley",
    department: "Cardiology",
    address: "456 Health Street",
    city: "Bangalore",
    state: "Karnataka",
    zipCode: "560001",
  },
  {
    hospitalName: "Royal Care Hospital",
    email: "admin@royalcare.com",
    phone: "+919876543212",
    password: "Password123",
    logoUrl: "https://via.placeholder.com/150?text=Royal+Care",
    department: "Orthopedics",
    address: "789 Wellness Road",
    city: "Delhi",
    state: "Delhi",
    zipCode: "110001",
  },
];

const seedDatabase = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(config.MONGODB_URI);
    console.log("✓ Connected to MongoDB");

    // Clear existing hospitals
    await Hospital.deleteMany({});
    console.log("✓ Cleared existing hospitals");

    // Hash passwords and create hospitals
    const hospitalsToCreate = await Promise.all(
      sampleHospitals.map(async (hospital) => ({
        ...hospital,
        passwordHash: await hashPassword(hospital.password),
      })),
    );

    // Remove password field (already hashed)
    for (const h of hospitalsToCreate) {
      delete h.password;
    }

    // Insert hospitals
    const created = await Hospital.insertMany(hospitalsToCreate);
    console.log(`✓ Created ${created.length} sample hospitals`);

    // Log created hospitals
    for (const hospital of created) {
      console.log(`  - ${hospital.hospitalName} (${hospital.email})`);
    }

    // Add sample patients for all hospitals
    const Patient = (await import("../src/models/Patient.js")).default;
    // Delete all patients before seeding
    await Patient.deleteMany({});

    let totalPatients = 0;
    for (const hospital of created) {
      // Derive hospital initials: multi-word → first letter of each word; single-word → first two letters
      const words = hospital.hospitalName.trim().split(/\s+/);
      const initials = words.length >= 2
        ? words.map((w) => w[0]).join("").toUpperCase()
        : hospital.hospitalName.slice(0, 2).toUpperCase();

      const samplePatients = [
        {
          hospitalId: hospital._id,
          patientId: `${initials}-001`,
          patientName: "John Doe",
          remarks: "Diabetic patient. Needs regular checkups.",
        },
        {
          hospitalId: hospital._id,
          patientId: `${initials}-002`,
          patientName: "Jane Smith",
          remarks: "Allergic to penicillin.",
        },
      ];
      const createdPatients = await Patient.insertMany(samplePatients);
      totalPatients += createdPatients.length;

      // Update hospital patientCounter to match
      await Hospital.updateOne({ _id: hospital._id }, { $set: { patientCounter: samplePatients.length } });

      console.log(`✓ Created ${createdPatients.length} sample patients for hospital: ${hospital.hospitalName}`);
    }
    console.log(`✓ Total patients seeded: ${totalPatients}`);

    // Debug: Print all hospital IDs
    console.log("\nHospital IDs after seeding:");
    for (const hospital of created) {
      console.log(`  - ${hospital.hospitalName}: ${hospital._id}`);
    }
    // Debug: Print all patients and their hospitalId
    const allPatients = await Patient.find({});
    console.log("\nPatient hospitalId mapping after seeding:");
    for (const patient of allPatients) {
      console.log(`  - ${patient.patientName}: ${patient.hospitalId}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("✗ Seed failed:", error);
    process.exit(1);
  }
};

seedDatabase();
