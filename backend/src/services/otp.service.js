/**
 * OTP Service
 * Handles OTP generation, storage, validation, and cleanup
 *
 * ========================================
 * LEGACY SMS OTP (DISABLED – replaced by TOTP)
 * ========================================
 * This entire service is preserved but disabled.
 * The TOTP implementation in totp.service.js replaces this functionality.
 * To restore SMS OTP, uncomment the code below and update auth.controller.js
 * ========================================
 */


// ========================================
// LEGACY SMS OTP (DISABLED – replaced by TOTP)
// ========================================
/*
/**
 * Create and store new OTP
 * @param {string} hospitalId - Hospital ID
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - User agent string
 * @returns {Promise<object>} OTP record (without plaintext otp)
 */
/*
export const createOtp = async (hospitalId, ipAddress, userAgent) => {
  try {
    // Delete any existing OTP for this hospital
    await Otp.deleteMany({ hospitalId });

    // Generate OTP
    const plainOtp = generateUniqueOtp();
    const otpHash = await hashOtp(plainOtp);

    // Calculate expiry time
    const expiresAt = new Date(Date.now() + config.OTP_EXPIRY_MINUTES * 60 * 1000);

    // Store OTP
    const otpRecord = await Otp.create({
      hospitalId,
      otpHash,
      expiresAt,
      ipAddress,
      userAgent,
      attemptsCount: 0,
    });

    return {
      id: otpRecord._id,
      hospitalId: otpRecord.hospitalId,
      expiresAt: otpRecord.expiresAt,
      createdAt: otpRecord.createdAt,
      plainOtp, // Return plaintext only once for sending via SMS
    };
  } catch (error) {
    throw new Error(`Failed to create OTP: ${error.message}`);
  }
};
*/

/*
/**
 * Verify OTP
 * @param {string} hospitalId - Hospital ID
 * @param {string} otp - OTP entered by user
 * @returns {Promise<boolean>} True if OTP is valid
 */
/*
export const verifyOtp = async (hospitalId, otp) => {
  try {
    // Find active OTP for hospital
    const otpRecord = await Otp.findOne({
      hospitalId,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      throw new Error("OTP not found or expired");
    }

    // Check attempts
    if (otpRecord.attemptsCount >= config.MAX_OTP_ATTEMPTS) {
      await Otp.deleteOne({ _id: otpRecord._id });
      throw new Error("Maximum OTP attempts exceeded");
    }

    // Compare OTP
    const isMatch = await compareOtp(otp, otpRecord.otpHash);

    if (!isMatch) {
      otpRecord.attemptsCount += 1;
      await otpRecord.save();
      throw new Error("Invalid OTP");
    }

    // Mark as used
    otpRecord.isUsed = true;
    await otpRecord.save();

    return true;
  } catch (error) {
    throw error;
  }
};
*/

/*
/**
 * Get OTP expiry time remaining in seconds
 * @param {string} hospitalId - Hospital ID
 * @returns {Promise<number>} Seconds remaining
 */
/*
export const getOtpExpiry = async (hospitalId) => {
  try {
    const otpRecord = await Otp.findOne({
      hospitalId,
      isUsed: false,
      expiresAt: { $gt: new Date() },
    });

    if (!otpRecord) {
      return 0;
    }

    const now = new Date();
    const timeRemaining = Math.floor((otpRecord.expiresAt - now) / 1000);
    return Math.max(0, timeRemaining);
  } catch (error) {
    throw new Error(`Failed to get OTP expiry: ${error.message}`);
  }
};
*/

/*
/**
 * Resend OTP (creates new OTP)
 * @param {string} hospitalId - Hospital ID
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - User agent string
 * @returns {Promise<object>} New OTP record
 */
/*
export const resendOtp = async (hospitalId, ipAddress, userAgent) => {
  try {
    return await createOtp(hospitalId, ipAddress, userAgent);
  } catch (error) {
    throw new Error(`Failed to resend OTP: ${error.message}`);
  }
};
*/

/*
/**
 * Clean up expired OTPs (manual cleanup)
 * @returns {Promise<object>} Deletion result
 */
/*
export const cleanupExpiredOtps = async () => {
  try {
    const result = await Otp.deleteMany({
      expiresAt: { $lt: new Date() },
    });
    return result;
  } catch (error) {
    throw new Error(`Failed to cleanup OTPs: ${error.message}`);
  }
};
*/

// ========================================
// END LEGACY SMS OTP
// ========================================

// Empty exports to prevent import errors
// These functions are disabled but exports are kept for backward compatibility
export const createOtp = null;
export const verifyOtp = null;
export const getOtpExpiry = null;
export const resendOtp = null;
export const cleanupExpiredOtps = null;

export default {
  createOtp,
  verifyOtp,
  getOtpExpiry,
  resendOtp,
  cleanupExpiredOtps,
};
