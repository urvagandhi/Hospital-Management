/**
 * Encryption Utility
 * AES-256-GCM encryption for TOTP secrets
 *
 * Security: Uses authenticated encryption (GCM mode) to prevent tampering
 */

import crypto from "crypto";
import config from "../config/env.js";

// AES-256 requires a 32-byte key
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get encryption key from environment
 * @returns {Buffer} 32-byte encryption key
 * @throws {Error} If key is not configured or invalid
 */
const getEncryptionKey = () => {
    const key = config.TOTP_ENCRYPTION_KEY;

    if (!key) {
        throw new Error("TOTP_ENCRYPTION_KEY is not configured");
    }

    // Key should be a 64-character hex string (32 bytes)
    if (!/^[0-9a-fA-F]{64}$/.test(key)) {
        throw new Error("TOTP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }

    return Buffer.from(key, "hex");
};

/**
 * Encrypt TOTP secret using AES-256-GCM
 * Format: iv:authTag:encryptedData (all hex encoded)
 *
 * @param {string} secret - Plain TOTP secret (Base32)
 * @returns {string} Encrypted string in format "iv:authTag:encrypted"
 */
export const encryptTotpSecret = (secret) => {
    if (!secret) {
        throw new Error("Secret is required for encryption");
    }

    const key = getEncryptionKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(secret, "utf8", "hex");
    encrypted += cipher.final("hex");

    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encryptedData
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
};

/**
 * Decrypt TOTP secret using AES-256-GCM
 *
 * @param {string} encryptedData - Encrypted string in format "iv:authTag:encrypted"
 * @returns {string} Decrypted TOTP secret (Base32)
 */
export const decryptTotpSecret = (encryptedData) => {
    if (!encryptedData) {
        throw new Error("Encrypted data is required for decryption");
    }

    const parts = encryptedData.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
    }

    const [ivHex, authTagHex, encrypted] = parts;

    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
};

/**
 * Generate a random encryption key for TOTP secrets
 * Use this to generate a new key for .env file
 *
 * @returns {string} 64-character hex string (32 bytes)
 */
export const generateEncryptionKey = () => {
    return crypto.randomBytes(32).toString("hex");
};

export default {
    encryptTotpSecret,
    decryptTotpSecret,
    generateEncryptionKey,
};
