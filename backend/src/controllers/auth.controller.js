/**
 * Authentication Controller
 * Handles login, OTP verification, refresh token, and logout
 */

import AuditLog from "../models/AuditLog.js";
import Hospital from "../models/Hospital.js";
import Session from "../models/Session.js";
import { createOtp, verifyOtp as verifyOtpService } from "../services/otp.service.js";
import { maskPhoneNumber, sendOtpSms } from "../services/sms.service.js";
import { createSession, invalidateSession, refreshAccessToken } from "../services/token.service.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { generateTempToken } from "../utils/jwt.js";

/**
 * Register Hospital - Create new hospital account
 * POST /api/auth/register-hospital
 */
export const registerHospital = async (req, res) => {
  try {
    const { hospitalName, email, password, phoneNumber, address } = req.body;

    // Validate inputs
    if (!hospitalName || !email || !password || !phoneNumber || !address) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Check if logo was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Hospital logo is required",
      });
    }

    // Check if hospital already exists
    const existingHospital = await Hospital.findOne({ email: email.toLowerCase() });
    if (existingHospital) {
      return res.status(409).json({
        success: false,
        message: "Hospital with this email already exists",
      });
    }

    // Convert logo to base64 data URL for storage
    const logoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create new hospital
    const hospital = await Hospital.create({
      hospitalName,
      email: email.toLowerCase(),
      passwordHash,
      phone: phoneNumber,
      address,
      logoUrl: logoBase64,
      isActive: true,
      failedLoginAttempts: 0,
    });

    // Log registration
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    await AuditLog.create({
      userId: hospital._id,
      action: "HOSPITAL_REGISTRATION",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { hospitalName, email },
    });

    return res.status(201).json({
      success: true,
      message: "Hospital registered successfully",
      data: {
        id: hospital._id,
        hospitalName: hospital.hospitalName,
        email: hospital.email,
      },
    });
  } catch (error) {
    console.error("Hospital registration error:", error);

    // Handle multer file upload errors
    if (error.message && error.message.includes("Only image files")) {
      return res.status(400).json({
        success: false,
        message: "Only image files are allowed (JPEG, PNG, GIF, WebP)",
      });
    }

    if (error.message && error.message.includes("File too large")) {
      return res.status(400).json({
        success: false,
        message: "Logo file size must be less than 2MB",
      });
    }

    // Handle MongoDB duplicate key error
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = "This information is already registered";

      if (field === "email") {
        message = "This email address is already registered";
      } else if (field === "phone") {
        message = "This phone number is already registered";
      }

      return res.status(409).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again later.",
    });
  }
};

/**
 * Login - Step 1: Validate credentials and send OTP
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    let hospital;
    try {
      hospital = await Hospital.findOne({ email: email.toLowerCase() });
    } catch (e) {
      throw new Error(`DB_FIND_ERROR: ${e.message}`);
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    if (!hospital) {
      try {
        await AuditLog.create({
          action: "LOGIN_ATTEMPT",
          status: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { email, failureReason: "User not found" },
        });
      } catch (e) {
        console.error("AuditLog error:", e);
      }

      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (hospital.lockUntil && hospital.lockUntil > Date.now()) {
      return res.status(423).json({
        success: false,
        message: "Account is locked. Please try again later.",
        lockUntil: hospital.lockUntil,
      });
    }

    if (!hospital.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    let isPasswordValid;
    try {
      isPasswordValid = await comparePassword(password, hospital.passwordHash);
    } catch (e) {
      throw new Error(`PASSWORD_COMPARE_ERROR: ${e.message}`);
    }

    if (!isPasswordValid) {
      hospital.failedLoginAttempts += 1;
      if (hospital.failedLoginAttempts >= 5) {
        hospital.lockUntil = Date.now() + 15 * 60 * 1000;
      }
      await hospital.save();
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (hospital.failedLoginAttempts > 0) {
      hospital.failedLoginAttempts = 0;
      hospital.lockUntil = undefined;
      await hospital.save();
    }

    let otpData;
    try {
      otpData = await createOtp(hospital._id, ipAddress, userAgent);
    } catch (e) {
      throw new Error(`CREATE_OTP_ERROR: ${e.message}`);
    }

    try {
      await sendOtpSms(hospital.phone, otpData.plainOtp);
    } catch (smsError) {
      console.error("SMS error:", smsError);
    }

    let tempToken;
    try {
      tempToken = generateTempToken(hospital._id);
    } catch (e) {
      throw new Error(`GENERATE_TOKEN_ERROR: ${e.message}`);
    }

    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "LOGIN_ATTEMPT",
        status: "SUCCESS",
        ipAddress,
        userAgent,
        details: { step: "PASSWORD_VERIFIED" },
      });
    } catch (e) {
      console.error("AuditLog success error:", e);
    }

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: {
        tempToken,
        phone: maskPhoneNumber(hospital.phone),
        expiresAt: otpData.expiresAt,
        hospitalName: hospital.hospitalName,
        logoUrl: hospital.logoUrl,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Login failed: ${error.message}`,
      stack: error.stack,
    });
  }
};

/**
 * Verify OTP - Step 2: Verify OTP and create session
 * POST /api/auth/verify-otp
 */
export const verifyOtp = async (req, res) => {
  try {
    const { otp } = req.body;
    const hospitalId = req.hospital?.id;

    if (!otp) {
      return res.status(400).json({
        success: false,
        message: "OTP is required",
      });
    }

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    // Verify OTP
    try {
      await verifyOtpService(hospitalId, otp);
    } catch (otpError) {
      return res.status(400).json({
        success: false,
        message: otpError.message,
      });
    }

    // Get client IP and user agent
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // Generate device ID (simplified: using user agent hash)
    // In production, use fingerprint library for better device identification
    const crypto = await import("crypto");
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);

    // Create session
    const session = await createSession(hospitalId, deviceId, ipAddress, userAgent);

    // Get hospital data
    const hospital = await Hospital.findById(hospitalId);

    await AuditLog.create({
      userId: hospitalId,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "OTP" },
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === "production";

    res.cookie("accessToken", session.accessToken, {
      httpOnly: true,
      secure: isProduction, // Must be true for SameSite=None
      sameSite: isProduction ? "none" : "lax", // Must be None for cross-site
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction, // Must be true for SameSite=None
      sameSite: isProduction ? "none" : "lax", // Must be None for cross-site
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        // accessToken: session.accessToken, // Removed, sent in cookie
        // refreshToken: session.refreshToken, // Removed, sent in cookie
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("OTP verification error:", error);
    return res.status(500).json({
      success: false,
      message: `OTP verification failed: ${error.message}`,
    });
  }
};

/**
 * Refresh Token
 * POST /api/auth/refresh-token
 */
export const refreshToken = async (req, res) => {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    const tokens = await refreshAccessToken(token);

    // Get hospital data to send back
    const session = await Session.findOne({ refreshToken: token });
    const hospital = await Hospital.findById(session.hospitalId);

    // Set new access token cookie
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });

    return res.status(200).json({
      success: true,
      message: "Token refreshed successfully",
      data: {
        ...tokens,
        hospital: hospital ? hospital.toJSON() : null,
      },
    });
  } catch (error) {
    console.error("Token refresh error:", error);
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Logout - Invalidate session
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    const token = req.cookies.refreshToken || req.body.refreshToken;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Refresh token is required",
      });
    }

    await invalidateSession(token);

    // Clear cookies
    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");

    // Log logout
    // We might not have user ID here easily unless we decode token, but session invalidation handles it.
    // Ideally we should log who logged out.

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({
      success: false,
      message: `Logout failed: ${error.message}`,
    });
  }
};

/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
export const resendOtp = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const { resendOtp: resendOtpService } = await import("../services/otp.service.js");
    const otpData = await resendOtpService(hospitalId, ipAddress, userAgent);

    // Send OTP via SMS
    try {
      const hospital = await Hospital.findById(hospitalId);
      await sendOtpSms(hospital.phone, otpData.plainOtp);
    } catch (smsError) {
      console.error("SMS sending failed:", smsError);
    }

    const hospital = await Hospital.findById(hospitalId);

    return res.status(200).json({
      success: true,
      message: "OTP resent successfully",
      data: {
        phone: maskPhoneNumber(hospital.phone),
        expiresAt: otpData.expiresAt,
      },
    });
  } catch (error) {
    console.error("Resend OTP error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to resend OTP: ${error.message}`,
    });
  }
};

export default {
  registerHospital,
  login,
  verifyOtp,
  refreshToken,
  logout,
  resendOtp,
};
