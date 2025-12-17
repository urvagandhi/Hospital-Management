
import dotenv from "dotenv";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try loading from .env.development first, then .env
dotenv.config({ path: path.join(__dirname, "../.env.development") });
if (!process.env.MONGODB_URI) {
    dotenv.config({ path: path.join(__dirname, "../.env") });
}

// Minimal Hospital Schema for update
const hospitalSchema = new mongoose.Schema({
    email: String,
    totpEnabled: Boolean,
    totpVerified: Boolean,
    totpSecretEncrypted: String,
});
const Hospital = mongoose.model("Hospital", hospitalSchema);

const reset2FA = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;
        if (!mongoUri) {
            throw new Error("MONGODB_URI is not defined");
        }

        await mongoose.connect(mongoUri);
        console.log("Connected to MongoDB");

        // Default to the demo email or take arg
        const email = process.argv[2] || "admin@citymedical.com";

        console.log(`Searching for user with email: ${email}`);

        const hospital = await Hospital.findOne({ email });

        if (!hospital) {
            console.log("User not found!");
            process.exit(1);
        }

        console.log(`User found. 2FA Status: Enabled=${hospital.totpEnabled}, Verified=${hospital.totpVerified}`);

        if (hospital.totpEnabled) {
            hospital.totpEnabled = false;
            hospital.totpVerified = false;
            hospital.totpSecretEncrypted = undefined;
            await hospital.save();
            console.log("SUCCESS: 2FA has been disabled for this user.");
        } else {
            console.log("INFO: 2FA is already disabled for this user.");
        }

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

reset2FA();
