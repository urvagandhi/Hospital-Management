/**
 * Hash Utility Functions
 * Handles bcrypt hashing for passwords and OTPs
 */

import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

/**
 * Hash a string using bcrypt
 * @param {string} plainText - Text to hash
 * @returns {Promise<string>} Hashed text
 */
export const hashString = async (plainText) => {
  try {
    const salt = await bcrypt.genSalt(SALT_ROUNDS);
    const hash = await bcrypt.hash(plainText, salt);
    return hash;
  } catch (error) {
    throw new Error(`Hashing failed: ${error.message}`);
  }
};

/**
 * Compare plain text with hash
 * @param {string} plainText - Plain text to compare
 * @param {string} hash - Hash to compare against
 * @returns {Promise<boolean>} True if match
 */
export const compareHash = async (plainText, hash) => {
  try {
    return await bcrypt.compare(plainText, hash);
  } catch (error) {
    throw new Error(`Hash comparison failed: ${error.message}`);
  }
};

/**
 * Hash password (wrapper for clarity)
 * @param {string} password - Password to hash
 * @returns {Promise<string>} Hashed password
 */
export const hashPassword = (password) => hashString(password);

/**
 * Compare password with hash
 * @param {string} password - Plain password
 * @param {string} hash - Password hash
 * @returns {Promise<boolean>} True if match
 */
export const comparePassword = (password, hash) => compareHash(password, hash);

/**
 * Hash OTP
 * @param {string} otp - OTP to hash
 * @returns {Promise<string>} Hashed OTP
 */
export const hashOtp = (otp) => hashString(otp);

/**
 * Compare OTP with hash
 * @param {string} otp - Plain OTP
 * @param {string} hash - OTP hash
 * @returns {Promise<boolean>} True if match
 */
export const compareOtp = (otp, hash) => compareHash(otp, hash);

export default {
  hashString,
  compareHash,
  hashPassword,
  comparePassword,
  hashOtp,
  compareOtp,
};
