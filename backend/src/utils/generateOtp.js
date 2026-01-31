/**
 * OTP Generation Utility
 * Generates cryptographically secure random OTP
 */

import crypto from "crypto";

/**
 * Generate a random OTP of specified length
 * @param {number} length - Length of OTP (default: 6)
 * @returns {string} Random OTP string
 */
export const generateOtp = (length = 6) => {
  const digits = "0123456789";
  let otp = "";

  const randomBytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    otp += digits[randomBytes[i] % 10];
  }

  return otp;
};

/**
 * Generate OTP with retry limit
 * @param {number} maxRetries - Maximum retry attempts
 * @returns {string} Unique OTP
 */
export const generateUniqueOtp = (maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    const otp = generateOtp(6);
    // Verify OTP doesn't contain easily confused patterns
    if (!containsConfusingPattern(otp)) {
      return otp;
    }
  }
  return generateOtp(6);
};

/**
 * Check if OTP contains confusing patterns (e.g., 000000, 111111)
 * @param {string} otp - OTP to check
 * @returns {boolean} True if pattern is confusing
 */
const containsConfusingPattern = (otp) => {
  // Check for repeated digits (e.g., 000000, 111111)
  const singleDigitPattern = /^(\d)\1{5}$/;
  if (singleDigitPattern.test(otp)) {
    return true;
  }

  // Check for sequential patterns (e.g., 123456, 654321)
  const isSequential = (str) => {
    for (let i = 1; i < str.length; i++) {
      if (Math.abs(parseInt(str[i]) - parseInt(str[i - 1])) !== 1) {
        return false;
      }
    }
    return true;
  };

  return isSequential(otp);
};

export default generateOtp;
