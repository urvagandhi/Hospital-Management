// Script to seed a test patient for the current hospital
// Usage: node backend/scripts/seedTestPatient.js <hospitalId>

const mongoose = require("mongoose");
const Patient = require("../src/models/Patient");
const dotenv = require("dotenv");
dotenv.config();

const hospitalId = process.argv[2];

if (!hospitalId) {
  console.error("Usage: node seedTestPatient.js <hospitalId>");
  process.exit(1);
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

  const patient = new Patient({
    hospitalId,
    patientName: "Test Patient",
    email: "testpatient@example.com",
    phone: "+911234567890",
    dateOfBirth: "1990-01-01",
    medicalRecordNumber: "MRN12345",
    status: "active",
    folders: [],
    createdAt: new Date(),
  });

  await patient.save();
  console.log("Test patient created:", patient);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Error seeding test patient:", err);
  process.exit(1);
});
