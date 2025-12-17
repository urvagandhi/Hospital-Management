/**
 * TOTP Service
 * Handles TOTP generation, verification, backup codes, and lockout management
 *
 * Uses speakeasy for TOTP and qrcode for QR generation
 *
 * Security Features:
 * - Clock drift tolerance: window=0 for setup, window=1 for login
 * - Attempt counters with soft lock (5 failures = 5 min lock)
 * - Encrypted secret storage via encryption utility
 * - Hashed backup codes
 */

import crypto from "crypto";
import QRCode from "qrcode";
import speakeasy from "speakeasy";
import config from "../config/env.js";
import BackupCode from "../models/BackupCode.js";
import { decryptTotpSecret, encryptTotpSecret } from "../utils/encryption.js";
import { compareOtp, hashOtp } from "../utils/hash.js";

/**
 * Generate TOTP secret and QR code for authenticator app setup
 *
 * @param {string} hospitalName - Hospital name for display in authenticator
 * @param {string} email - Account identifier
 * @param {string} customIssuer - Optional custom issuer for white-labeling
 * @returns {Promise<object>} { secret, encryptedSecret, qrCode, otpauthUrl }
 */
export const generateTotpSecret = async (hospitalName, email, customIssuer = null) => {
    // Use custom issuer if provided, otherwise use config default
    const issuer = customIssuer || config.TOTP_ISSUER || "HospitalManagement";

    // Generate secret using speakeasy
    const secret = speakeasy.generateSecret({
        name: `${issuer}:${email}`,
        issuer: issuer,
        length: 20, // 160 bits, standard for TOTP
    });

    // Encrypt secret for database storage
    const encryptedSecret = encryptTotpSecret(secret.base32);

    // Generate QR code as data URL (base64)
    const qrCode = await QRCode.toDataURL(secret.otpauth_url);

    return {
        secret: secret.base32,
        encryptedSecret,
        qrCode,
        otpauthUrl: secret.otpauth_url,
        // Return masked secret for display (show first 4 and last 4 chars)
        maskedSecret: `${secret.base32.substring(0, 4)}${"*".repeat(secret.base32.length - 8)}${secret.base32.substring(secret.base32.length - 4)}`,
    };
};

/**
 * Verify TOTP token from authenticator app
 *
 * ⏱️ Clock Drift Tolerance:
 * - Setup verification: window=0 (strict, current code only)
 * - Login verification: window=1 (±1 time step = ±30 seconds)
 *
 * @param {string} encryptedSecret - Encrypted TOTP secret from database
 * @param {string} token - 6-digit token from authenticator app
 * @param {boolean} isSetup - True for setup verification (stricter window)
 * @returns {boolean} True if token is valid
 */
export const verifyTotpToken = (encryptedSecret, token, isSetup = false) => {
    // Decrypt secret
    const secret = decryptTotpSecret(encryptedSecret);

    // Use stricter window for setup (window=0), relaxed for login (window=1)
    const window = isSetup ? config.TOTP_SETUP_WINDOW : config.TOTP_WINDOW;

    const isValid = speakeasy.totp.verify({
        secret: secret,
        encoding: "base32",
        token: token,
        window: window,
        step: 30, // 30-second time step (standard)
    });

    return isValid;
};

/**
 * Generate backup codes for 2FA recovery
 * Creates 10 unique 8-character alphanumeric codes
 *
 * @param {string} hospitalId - Hospital ID
 * @returns {Promise<string[]>} Array of plain backup codes (shown once to user)
 */
export const generateBackupCodes = async (hospitalId) => {
    const numCodes = config.MAX_BACKUP_CODES || 10;
    const plainCodes = [];
    const hashedCodes = [];

    // Delete any existing backup codes for this hospital
    await BackupCode.deleteMany({ hospitalId });

    // Generate unique codes
    for (let i = 0; i < numCodes; i++) {
        // Generate 8-character alphanumeric code (format: XXXX-XXXX)
        const part1 = crypto.randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
        const part2 = crypto.randomBytes(3).toString("hex").toUpperCase().substring(0, 4);
        const code = `${part1}-${part2}`;

        plainCodes.push(code);

        // Hash for storage (remove dash for hashing)
        const codeHash = await hashOtp(code.replace("-", ""));
        hashedCodes.push({
            hospitalId,
            codeHash,
        });
    }

    // Store hashed codes in database
    await BackupCode.insertMany(hashedCodes);

    return plainCodes;
};

/**
 * Verify and consume a backup code
 * Marks the code as used after successful verification
 *
 * @param {string} hospitalId - Hospital ID
 * @param {string} code - Backup code entered by user (with or without dash)
 * @returns {Promise<boolean>} True if code is valid and unused
 */
export const verifyBackupCode = async (hospitalId, code) => {
    // Normalize code (remove dash if present)
    const normalizedCode = code.replace("-", "").toUpperCase();

    // Find all unused backup codes for this hospital
    const backupCodes = await BackupCode.find({
        hospitalId,
        isUsed: false,
    });

    // Check each code (bcrypt comparison is async)
    for (const backupCode of backupCodes) {
        const isMatch = await compareOtp(normalizedCode, backupCode.codeHash);

        if (isMatch) {
            // Mark code as used
            backupCode.isUsed = true;
            backupCode.usedAt = new Date();
            await backupCode.save();

            return true;
        }
    }

    return false;
};

/**
 * Check if hospital is locked due to too many failed TOTP attempts
 *
 * @param {object} hospital - Hospital document
 * @returns {object} { isLocked: boolean, lockUntil: Date|null, remainingAttempts: number }
 */
export const checkTotpLockout = (hospital) => {
    const maxAttempts = config.TOTP_MAX_ATTEMPTS || 5;

    // Check if currently locked
    if (hospital.totpLockedUntil && hospital.totpLockedUntil > new Date()) {
        return {
            isLocked: true,
            lockUntil: hospital.totpLockedUntil,
            remainingAttempts: 0,
        };
    }

    // Check if lock has expired (reset if so)
    if (hospital.totpLockedUntil && hospital.totpLockedUntil <= new Date()) {
        return {
            isLocked: false,
            lockUntil: null,
            remainingAttempts: maxAttempts,
        };
    }

    return {
        isLocked: false,
        lockUntil: null,
        remainingAttempts: maxAttempts - (hospital.totpFailedAttempts || 0),
    };
};

/**
 * Record a failed TOTP attempt
 * Locks the account after 5 failures for 5 minutes
 *
 * @param {object} hospital - Hospital document
 * @returns {Promise<object>} { isNowLocked: boolean, attemptsRemaining: number }
 */
export const recordFailedAttempt = async (hospital) => {
    const maxAttempts = config.TOTP_MAX_ATTEMPTS || 5;
    const lockDuration = (config.TOTP_LOCK_DURATION_MINUTES || 5) * 60 * 1000;

    // Check if lock has expired and reset if needed
    if (hospital.totpLockedUntil && hospital.totpLockedUntil <= new Date()) {
        hospital.totpFailedAttempts = 0;
        hospital.totpLockedUntil = undefined;
    }

    // Increment failed attempts
    hospital.totpFailedAttempts = (hospital.totpFailedAttempts || 0) + 1;

    // Lock if exceeded max attempts
    if (hospital.totpFailedAttempts >= maxAttempts) {
        hospital.totpLockedUntil = new Date(Date.now() + lockDuration);
        await hospital.save();

        return {
            isNowLocked: true,
            attemptsRemaining: 0,
        };
    }

    await hospital.save();

    return {
        isNowLocked: false,
        attemptsRemaining: maxAttempts - hospital.totpFailedAttempts,
    };
};

/**
 * Reset failed TOTP attempts after successful authentication
 *
 * @param {object} hospital - Hospital document
 * @returns {Promise<void>}
 */
export const resetFailedAttempts = async (hospital) => {
    hospital.totpFailedAttempts = 0;
    hospital.totpLockedUntil = undefined;
    await hospital.save();
};

/**
 * Update TOTP last used timestamp
 *
 * @param {object} hospital - Hospital document
 * @returns {Promise<void>}
 */
export const updateTotpLastUsed = async (hospital) => {
    hospital.totpLastUsedAt = new Date();
    await hospital.save();
};

/**
 * Get remaining backup codes count for a hospital
 *
 * @param {string} hospitalId - Hospital ID
 * @returns {Promise<number>} Number of unused backup codes
 */
export const getBackupCodesCount = async (hospitalId) => {
    return await BackupCode.countDocuments({
        hospitalId,
        isUsed: false,
    });
};

export default {
    generateTotpSecret,
    verifyTotpToken,
    generateBackupCodes,
    verifyBackupCode,
    checkTotpLockout,
    recordFailedAttempt,
    resetFailedAttempts,
    updateTotpLastUsed,
    getBackupCodesCount,
};
