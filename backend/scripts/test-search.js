import "dotenv/config";
import mongoose from "mongoose";
import Patient from "../src/models/Patient.js";

await mongoose.connect(process.env.MONGODB_URI);

const hospitalId = new mongoose.Types.ObjectId("69c531d77ce8d75a069b30e9");
const search = "SHC-001";
const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

console.log("Escaped search:", JSON.stringify(escapedSearch));

const query = {
  hospitalId,
  $or: [
    { patientName: { $regex: escapedSearch, $options: "i" } },
    { patientId: { $regex: escapedSearch, $options: "i" } },
  ],
};

console.log("Query:", JSON.stringify(query));

const results = await Patient.find(query).select("patientId patientName").lean();
console.log("Results:", JSON.stringify(results, null, 2));

await mongoose.disconnect();
