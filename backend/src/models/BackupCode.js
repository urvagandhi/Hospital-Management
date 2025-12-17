/**
 * BackupCode Model
 * Stores hashed one-time backup codes for 2FA recovery
 *
 * Security:
 * - Backup codes are bcrypt hashed before storage
 * - Compound unique index prevents duplicate codes
 * - Codes are marked as used after successful login
 */

import mongoose from "mongoose";

const backupCodeSchema = new mongoose.Schema(
    {
        hospitalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Hospital",
            required: true,
            index: true,
        },
        codeHash: {
            type: String,
            required: true, // bcrypt hashed backup code
        },
        isUsed: {
            type: Boolean,
            default: false,
        },
        usedAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    }
);

// 🧾 [SECURITY] Compound unique index to prevent duplicate codes
backupCodeSchema.index({ hospitalId: 1, codeHash: 1 }, { unique: true });

// Index for cleanup queries
backupCodeSchema.index({ hospitalId: 1, isUsed: 1 });

const BackupCode = mongoose.model("BackupCode", backupCodeSchema);

export default BackupCode;
