
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, "../.env.development") });
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: path.join(__dirname, "../.env") });
}

// Inline schema for flexible querying
const hospitalSchema = new mongoose.Schema({}, { strict: false });
const Hospital = mongoose.model("Hospital", hospitalSchema);

const checkDuplicates = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("Connected to MongoDB: " + process.env.MONGODB_URI);

        const email = process.argv[2] || "admin@citymedical.com";
        console.log(`Searching for ALL users with email: ${email}`);

        const users = await Hospital.find({ email: email });

        console.log(`Found ${users.length} user(s).`);
        users.forEach((u, i) => {
            console.log(`[${i}] ID: ${u._id}, Email: ${u.email}, TOTP Enabled: ${u.totpEnabled}, Verified: ${u.totpVerified}`);
        });

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

checkDuplicates();
