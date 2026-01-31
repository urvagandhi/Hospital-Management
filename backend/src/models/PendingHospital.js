import mongoose from "mongoose";

const pendingHospitalSchema = new mongoose.Schema(
    {
        hospitalName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },
        passwordHash: {
            type: String,
            required: true,
        },
        phoneNumber: {
            type: String,
            required: true,
        },
        address: {
            type: String,
            required: true,
        },
        logoUrl: {
            type: String, // Base64 data URL
        },
        // TOTP Secret (Encrypted) - Waiting for verification
        totpSecretEncrypted: {
            type: String,
            required: true,
        },
        totpIssuer: {
            type: String,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 900, // Documents expire after 15 minutes (900 seconds)
        },
    },
    {
        timestamps: true,
    }
);

const PendingHospital = mongoose.model("PendingHospital", pendingHospitalSchema);

export default PendingHospital;
