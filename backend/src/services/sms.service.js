/**
 * SMS Service
 * Placeholder for SMS gateway integration (Twilio, AWS SNS, etc.)
 *
 * ========================================
 * LEGACY SMS OTP (DISABLED – replaced by TOTP)
 * ========================================
 * SMS OTP sending functions are disabled.
 * The TOTP implementation replaces SMS-based OTP.
 * maskPhoneNumber and formatPhoneNumber are still active for display.
 * ========================================
 */


// ========================================
// LEGACY SMS OTP (DISABLED – replaced by TOTP)
// ========================================
/*
/**
 * Send OTP via SMS
 * @param {string} phone - Phone number in E.164 format
 * @param {string} otp - OTP to send
 * @returns {Promise<object>} SMS send result
 */
/*
export const sendOtpSms = async (phone, otp) => {
  try {
    // Placeholder: Replace with actual SMS gateway implementation
    // Example for Twilio:
    // const message = await twilioClient.messages.create({
    //   body: `Your Hospital Management OTP is: ${otp}. Valid for 5 minutes.`,
    //   from: config.SMS_GATEWAY_SENDER,
    //   to: phone,
    // });

    console.log(`[SMS Service] Sending OTP ${otp} to ${phone}`);

    // For development: Log OTP instead of sending
    if (config.NODE_ENV === "development") {
      console.log(`[DEV] OTP for ${phone}: ${otp}`);
      return {
        success: true,
        message: "OTP logged (development mode)",
        phone,
        otp: otp.substring(0, 2) + "****", // Masked OTP
      };
    }

    // Production: Integrate with actual SMS provider
    return {
      success: true,
      message: "OTP sent successfully",
      phone: maskPhoneNumber(phone),
    };
  } catch (error) {
    throw new Error(`Failed to send OTP SMS: ${error.message}`);
  }
};
*/

/*
/**
 * Send verification confirmation SMS
 * @param {string} phone - Phone number
 * @param {string} hospitalName - Hospital name
 * @returns {Promise<object>} SMS send result
 */
/*
export const sendVerificationConfirmationSms = async (phone, hospitalName) => {
  try {
    console.log(`[SMS Service] Sending confirmation SMS to ${phone}`);

    return {
      success: true,
      message: "Confirmation SMS sent",
      phone: maskPhoneNumber(phone),
    };
  } catch (error) {
    throw new Error(`Failed to send confirmation SMS: ${error.message}`);
  }
};
*/
// ========================================
// END LEGACY SMS OTP
// ========================================

// Disabled exports (kept for backward compatibility)
export const sendOtpSms = null;
export const sendVerificationConfirmationSms = null;

/**
 * Mask phone number for display (show last 4 digits)
 * @param {string} phone - Phone number
 * @returns {string} Masked phone number
 */
export const maskPhoneNumber = (phone) => {
  // Assumes E.164 format: +91XXXXXXXXXX
  const lastFour = phone.slice(-4);
  const prefix = phone.substring(0, phone.length - 4);
  return `${prefix}${lastFour.replace(/\d/g, "X")}`;
};

/**
 * Format phone number to E.164 format
 * @param {string} phone - Phone number
 * @returns {string} Formatted phone number
 */
export const formatPhoneNumber = (phone) => {
  // Remove all non-digits
  const cleaned = phone.replace(/\D/g, "");

  // Add +91 if not present (assuming India)
  if (cleaned.length === 10) {
    return `+91${cleaned}`;
  }
  if (cleaned.length === 12 && cleaned.startsWith("91")) {
    return `+${cleaned}`;
  }

  return phone;
};

export default {
  sendOtpSms,
  sendVerificationConfirmationSms,
  maskPhoneNumber,
  formatPhoneNumber,
};
