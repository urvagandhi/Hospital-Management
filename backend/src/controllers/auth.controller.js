/**
 * Authentication Controller
 * Handles login, TOTP verification, refresh token, and logout
 *
 * TOTP-based Authenticator App authentication replaces SMS OTP
 */

import AuditLog from "../models/AuditLog.js";
import Hospital from "../models/Hospital.js";
import Session from "../models/Session.js";
// LEGACY SMS OTP (DISABLED – replaced by TOTP)
// import { createOtp, verifyOtp as verifyOtpService } from "../services/otp.service.js";
// import { sendOtpSms } from "../services/sms.service.js";
import crypto from "crypto";
import jwt from "jsonwebtoken"; // Import jwt for registration token
import PendingHospital from "../models/PendingHospital.js"; // Import PendingHospital
import { createSession, invalidateSession, refreshAccessToken } from "../services/token.service.js";
import {
  checkTotpLockout,
  generateBackupCodes,
  generateTotpSecret,
  getBackupCodesCount,
  recordFailedAttempt,
  resetFailedAttempts,
  updateTotpLastUsed,
  verifyBackupCode,
  verifyTotpToken,
} from "../services/totp.service.js";
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

    // Generate TOTP secret
    const customIssuer = `${hospitalName}`;
    const totpData = await generateTotpSecret(hospitalName, email, customIssuer);

    // Create PendingHospital Entry (Expires in 15 mins)
    const pendingHospital = await PendingHospital.create({
      hospitalName,
      email: email.toLowerCase(),
      passwordHash,
      phoneNumber,
      address,
      logoUrl: logoBase64,
      totpSecretEncrypted: totpData.encryptedSecret,
      totpIssuer: customIssuer,
    });

    // Generate a temporary registration token (contains pending ID)
    const registrationToken = jwt.sign(
      { pendingId: pendingHospital._id, type: "REGISTRATION_VERIFY" },
      process.env.JWT_SECRET,
      { expiresIn: "15m" }
    );

    return res.status(200).json({
      success: true,
      message: "Registration initiated. Please setup 2FA to complete registration.",
      data: {
        registrationToken,
        qrCode: totpData.qrCode,
        secret: totpData.secret, // Unmasked for manual entry
        otpauthUrl: totpData.otpauthUrl,
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
 * Verify Registration - Step 2: Verify TOTP and Create Hospital
 * POST /api/auth/verify-registration
 */
export const verifyRegistration = async (req, res) => {
  try {
    const { registrationToken, totpCode } = req.body;

    if (!registrationToken || !totpCode) {
      return res.status(400).json({
        success: false,
        message: "Registration token and TOTP code are required",
      });
    }

    // Verify token
    let decoded;
    try {
      decoded = jwt.verify(registrationToken, process.env.JWT_SECRET);
      if (decoded.type !== "REGISTRATION_VERIFY") {
        throw new Error("Invalid token type");
      }
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired registration session",
      });
    }

    // Find Pending Data
    const pendingHospital = await PendingHospital.findById(decoded.pendingId);
    if (!pendingHospital) {
      return res.status(404).json({
        success: false,
        message: "Registration session expired or invalid. Please register again.",
      });
    }

    // Check if email already exists (defensive check)
    const existingHospital = await Hospital.findOne({ email: pendingHospital.email });
    if (existingHospital) {
      // Should not happen unless race condition or user registered another way
      await PendingHospital.deleteOne({ _id: pendingHospital._id });
      return res.status(409).json({
        success: false,
        message: "Account already exists",
      });
    }

    // Verify TOTP Code (Strict Window for Setup)
    const isValid = verifyTotpToken(pendingHospital.totpSecretEncrypted, totpCode, true);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid TOTP code. Please try again.",
      });
    }

    // PROCEED TO CREATE PERMANENT HOSPITAL
    const hospital = await Hospital.create({
      hospitalName: pendingHospital.hospitalName,
      email: pendingHospital.email,
      passwordHash: pendingHospital.passwordHash,
      phone: pendingHospital.phoneNumber,
      address: pendingHospital.address,
      logoUrl: pendingHospital.logoUrl,
      isActive: true, // Auto-active after verification
      totpEnabled: true, // Enabled immediately
      totpVerified: true,
      totpSecretEncrypted: pendingHospital.totpSecretEncrypted,
      totpIssuer: pendingHospital.totpIssuer,
      totpSetupAt: new Date(),
      failedLoginAttempts: 0,
    });

    // Clean up pending doc
    await PendingHospital.deleteOne({ _id: pendingHospital._id });

    // Generate Backup Codes
    const backupCodes = await generateBackupCodes(hospital._id);

    // Create session
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    const crypto = await import("crypto");
    const deviceId = crypto.createHash("sha256").update(userAgent || "unknown").digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent);

    // Audit Log
    await AuditLog.create({
      userId: hospital._id,
      action: "HOSPITAL_REGISTRATION_VERIFIED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { hospitalName: hospital.hospitalName },
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", session.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "Registration completed successfully.",
      data: {
        hospital: {
          id: hospital._id,
          hospitalName: hospital.hospitalName,
          email: hospital.email,
          logoUrl: hospital.logoUrl,
        },
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        backupCodes: backupCodes, // Important to return these!
      }
    });

  } catch (error) {
    console.error("Verify registration error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification failed. Please try again.",
    });
  }
};

/**
 * Login - Step 1: Validate credentials
 * POST /api/auth/login
 *
 * If TOTP is enabled: returns { requireTotp: true, tempToken }
 * If TOTP is not enabled: creates session directly
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

    // Check if TOTP 2FA is enabled
    if (hospital.totpEnabled && hospital.totpVerified) {
      // Generate purpose-scoped temp token for TOTP verification
      const tempToken = generateTempToken(hospital._id, "TOTP_LOGIN");

      await AuditLog.create({
        userId: hospital._id,
        action: "LOGIN_ATTEMPT",
        status: "SUCCESS",
        ipAddress,
        userAgent,
        details: { step: "PASSWORD_VERIFIED", requireTotp: true },
      });

      return res.status(200).json({
        success: true,
        message: "Password verified. TOTP verification required.",
        requireTotp: true,
        data: {
          tempToken,
          hospitalName: hospital.hospitalName,
          logoUrl: hospital.logoUrl,
        },
      });
    }

    // TOTP not enabled - create session directly
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent);

    await AuditLog.create({
      userId: hospital._id,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "PASSWORD_ONLY", totpEnabled: false },
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", session.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful. Please setup 2FA to continue.",
      requireTotp: false,
      requireTotpSetup: true, // Force setup for existing users
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
      },
    });

    // ========================================
    // LEGACY SMS OTP (DISABLED – replaced by TOTP)
    // ========================================
    /*
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
    */
    // ========================================
    // END LEGACY SMS OTP
    // ========================================
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: `Login failed: ${error.message}`,
      stack: error.stack,
    });
  }
};

// ========================================
// LEGACY SMS OTP (DISABLED – replaced by TOTP)
// ========================================
/*
/**
 * Verify OTP - Step 2: Verify OTP and create session
 * POST /api/auth/verify-otp
 */
/*
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
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: {
        data: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          tokenType: session.tokenType,
          expiresIn: session.expiresIn,
          hospital: hospital.toJSON(),
        },
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
*/

/*
/**
 * Resend OTP
 * POST /api/auth/resend-otp
 */
/*
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
*/
// ========================================
// END LEGACY SMS OTP
// ========================================

/**
 * Setup TOTP - Generate secret and QR code
 * POST /api/auth/2fa/setup
 * Requires: Access Token
 */
export const setupTotp = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    // Check if TOTP is already enabled
    if (hospital.totpEnabled && hospital.totpVerified) {
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled. Disable it first to set up a new secret.",
      });
    }

    // Generate TOTP secret with optional custom issuer
    const customIssuer = hospital.totpIssuer || `${hospital.hospitalName}`;
    const totpData = await generateTotpSecret(hospital.hospitalName, hospital.email, customIssuer);

    // Store encrypted secret (not yet verified)
    hospital.totpSecretEncrypted = totpData.encryptedSecret;
    hospital.totpVerified = false;
    hospital.totpIssuer = customIssuer;
    await hospital.save();

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AuditLog.create({
      userId: hospitalId,
      action: "TOTP_SETUP_INITIATED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: "Scan the QR code with your authenticator app",
      data: {
        qrCode: totpData.qrCode,
        secret: totpData.secret, // Unmasked for manual entry
        otpauthUrl: totpData.otpauthUrl,
      },
    });
  } catch (error) {
    console.error("TOTP setup error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to setup 2FA: ${error.message}`,
    });
  }
};

/**
 * Verify TOTP Setup - Verify first OTP and enable 2FA
 * POST /api/auth/2fa/verify
 * Requires: Access Token
 *
 * Uses window=0 (strict) for setup verification
 */
export const verifyTotpSetup = async (req, res) => {
  try {
    const { token } = req.body;
    const hospitalId = req.hospital?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "TOTP token is required",
      });
    }

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    if (!hospital.totpSecretEncrypted) {
      return res.status(400).json({
        success: false,
        message: "Please initiate 2FA setup first",
      });
    }

    if (hospital.totpEnabled && hospital.totpVerified) {
      return res.status(400).json({
        success: false,
        message: "2FA is already enabled",
      });
    }

    // Verify token with window=0 (strict, no drift allowed for setup)
    const isValid = verifyTotpToken(hospital.totpSecretEncrypted, token, true);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid TOTP code. Please try again with the current code from your app.",
      });
    }

    // Enable 2FA
    hospital.totpEnabled = true;
    hospital.totpVerified = true;
    hospital.totpSetupAt = new Date();
    hospital.totpFailedAttempts = 0;
    hospital.totpLockedUntil = undefined;
    await hospital.save();

    // Generate backup codes
    const backupCodes = await generateBackupCodes(hospitalId);

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AuditLog.create({
      userId: hospitalId,
      action: "TOTP_ENABLED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { backupCodesGenerated: backupCodes.length },
    });

    return res.status(200).json({
      success: true,
      message: "2FA has been enabled successfully. Save your backup codes in a secure place.",
      data: {
        totpEnabled: true,
        backupCodes: backupCodes,
        backupCodesWarning: "These codes will only be shown once. Store them securely.",
      },
    });
  } catch (error) {
    console.error("TOTP verify setup error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to verify 2FA: ${error.message}`,
    });
  }
};

/**
 * Verify TOTP for Login - Complete login after password verification
 * POST /api/auth/login/totp
 * Requires: Temp Token with purpose=TOTP_LOGIN
 *
 * Uses window=1 (±1 time step tolerance)
 */
export const verifyTotpLogin = async (req, res) => {
  try {
    const { token } = req.body;
    const hospitalId = req.hospital?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "TOTP token is required",
      });
    }

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // Check lockout status
    const lockoutStatus = checkTotpLockout(hospital);
    if (lockoutStatus.isLocked) {
      await AuditLog.create({
        userId: hospitalId,
        action: "TOTP_LOGIN_ATTEMPT",
        status: "FAILURE",
        ipAddress,
        userAgent,
        details: { reason: "Account locked", lockedUntil: lockoutStatus.lockUntil },
      });

      return res.status(423).json({
        success: false,
        message: "Account is temporarily locked due to too many failed attempts",
        lockUntil: lockoutStatus.lockUntil,
      });
    }

    // Verify TOTP token with window=1 (±30 seconds tolerance)
    const isValid = verifyTotpToken(hospital.totpSecretEncrypted, token, false);

    if (!isValid) {
      // Record failed attempt
      const failResult = await recordFailedAttempt(hospital);

      await AuditLog.create({
        userId: hospitalId,
        action: "TOTP_LOGIN_ATTEMPT",
        status: "FAILURE",
        ipAddress,
        userAgent,
        details: { reason: "Invalid TOTP", attemptsRemaining: failResult.attemptsRemaining },
      });

      if (failResult.isNowLocked) {
        return res.status(423).json({
          success: false,
          message: "Account is now locked due to too many failed attempts",
          lockUntil: hospital.totpLockedUntil,
        });
      }

      return res.status(400).json({
        success: false,
        message: "Invalid TOTP code",
        attemptsRemaining: failResult.attemptsRemaining,
      });
    }

    // Reset failed attempts and update last used timestamp
    await resetFailedAttempts(hospital);
    await updateTotpLastUsed(hospital);

    // Generate device ID and create session
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospitalId, deviceId, ipAddress, userAgent);

    await AuditLog.create({
      userId: hospitalId,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "TOTP" },
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", session.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("TOTP login verification error:", error);
    return res.status(500).json({
      success: false,
      message: `TOTP verification failed: ${error.message}`,
    });
  }
};

/**
 * Disable TOTP 2FA
 * POST /api/auth/2fa/disable
 * Requires: Access Token + Valid TOTP code
 */
export const disableTotp = async (req, res) => {
  try {
    const { token } = req.body;
    const hospitalId = req.hospital?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "TOTP token is required to disable 2FA",
      });
    }

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    if (!hospital.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled",
      });
    }

    // Verify current TOTP before disabling
    const isValid = verifyTotpToken(hospital.totpSecretEncrypted, token, false);

    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid TOTP code. Cannot disable 2FA.",
      });
    }

    // Disable 2FA and clear secrets
    hospital.totpEnabled = false;
    hospital.totpVerified = false;
    hospital.totpSecretEncrypted = undefined;
    hospital.totpSetupAt = undefined;
    hospital.totpLastUsedAt = undefined;
    hospital.totpFailedAttempts = 0;
    hospital.totpLockedUntil = undefined;
    hospital.totpSecretVersion = 1; // Reset version
    await hospital.save();

    // Delete backup codes
    const BackupCode = (await import("../models/BackupCode.js")).default;
    await BackupCode.deleteMany({ hospitalId });

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AuditLog.create({
      userId: hospitalId,
      action: "TOTP_DISABLED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: "2FA has been disabled",
    });
  } catch (error) {
    console.error("TOTP disable error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to disable 2FA: ${error.message}`,
    });
  }
};


/**
 * Reset TOTP - Disable 2FA with Password (for lost devices)
 * POST /api/auth/2fa/reset
 * Requires: Password
 */
export const resetTotp = async (req, res) => {
  try {
    const { password } = req.body;
    const hospitalId = req.hospital?.id;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "Password is required",
      });
    }

    const hospital = await Hospital.findById(hospitalId).select("+password");
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    if (!hospital.totpEnabled) {
      return res.status(400).json({
        success: false,
        message: "2FA is not enabled",
      });
    }

    // Verify Password
    const isMatch = await hospital.matchPassword(password);
    if (!isMatch) {
      return res.status(403).json({
        success: false,
        message: "Invalid password",
      });
    }

    // Generate NEW TOTP secret (Rotation Flow)
    // We do NOT disable the old one yet. We store the new one in totpPendingSecret.
    const customIssuer = hospital.totpIssuer || `${hospital.hospitalName}`;
    const totpData = await generateTotpSecret(hospital.hospitalName, hospital.email, customIssuer);

    hospital.totpPendingSecret = totpData.encryptedSecret;
    await hospital.save();

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AuditLog.create({
      userId: hospitalId,
      action: "TOTP_ROTATION_INITIATED", // Changed from RESET to ROTATION_INITIATED
      status: "SUCCESS",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: "Password verified. Please scan the new QR code to complete rotation.",
      data: {
        qrCode: totpData.qrCode,
        secret: totpData.secret,
        otpauthUrl: totpData.otpauthUrl,
      },
    });
  } catch (error) {
    console.error("TOTP reset error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to reset 2FA: ${error.message}`,
    });
  }
};

/**
 * Verify TOTP Reset/Rotation - Finalize the rotation
 * POST /api/auth/2fa/reset/verify
 * Requires: Access Token + TOTP Code
 */
export const verifyTotpReset = async (req, res) => {
  try {
    const { token } = req.body;
    const hospitalId = req.hospital?.id;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "TOTP token is required",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    if (!hospital.totpPendingSecret) {
      return res.status(400).json({
        success: false,
        message: "No rotation pending. Please initiate 2FA reset first.",
      });
    }

    // Verify token against PENDING secret
    const isValid = verifyTotpToken(hospital.totpPendingSecret, token, true);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid TOTP code. Please try again.",
      });
    }

    // Success: Promote Pending Secret to Active Secret
    hospital.totpSecretEncrypted = hospital.totpPendingSecret;
    hospital.totpPendingSecret = undefined;
    hospital.totpEnabled = true; // Ensure it stays enabled
    hospital.totpVerified = true;
    hospital.totpSetupAt = new Date(); // Update setup time
    hospital.totpFailedAttempts = 0;
    hospital.totpLockedUntil = undefined;
    await hospital.save();

    // Regenerate backup codes (invalidate old ones)
    const BackupCode = (await import("../models/BackupCode.js")).default;
    await BackupCode.deleteMany({ hospitalId });
    const backupCodes = await generateBackupCodes(hospitalId);

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    await AuditLog.create({
      userId: hospitalId,
      action: "TOTP_ROTATION_COMPLETED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
    });

    return res.status(200).json({
      success: true,
      message: "2FA rotation completed successfully.",
      data: {
        backupCodes,
      },
    });

  } catch (error) {
    console.error("TOTP rotation verification error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to verify rotation: ${error.message}`,
    });
  }
};

/**
 * Recovery Login - Login using backup code
 * POST /api/auth/login/recovery
 * Requires: Temp Token with purpose=TOTP_LOGIN
 */
export const recoveryLogin = async (req, res) => {
  try {
    const { code } = req.body;
    const hospitalId = req.hospital?.id;

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Backup code is required",
      });
    }

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized. Please login first.",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    // Verify backup code
    const isValid = await verifyBackupCode(hospitalId, code);

    if (!isValid) {
      await AuditLog.create({
        userId: hospitalId,
        action: "RECOVERY_LOGIN_ATTEMPT",
        status: "FAILURE",
        ipAddress,
        userAgent,
        details: { reason: "Invalid backup code" },
      });

      return res.status(400).json({
        success: false,
        message: "Invalid or already used backup code",
      });
    }

    // Reset TOTP lockout on successful recovery
    await resetFailedAttempts(hospital);

    // Get remaining backup codes count
    const remainingCodes = await getBackupCodesCount(hospitalId);

    // Generate device ID and create session
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospitalId, deviceId, ipAddress, userAgent);

    await AuditLog.create({
      userId: hospitalId,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "BACKUP_CODE", remainingBackupCodes: remainingCodes },
    });

    // Set cookies
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", session.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000,
    });

    res.cookie("refreshToken", session.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Recovery login successful",
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
        remainingBackupCodes: remainingCodes,
        warning: remainingCodes <= 2 ? "You have few backup codes remaining. Consider generating new ones." : undefined,
      },
    });
  } catch (error) {
    console.error("Recovery login error:", error);
    return res.status(500).json({
      success: false,
      message: `Recovery login failed: ${error.message}`,
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
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          hospital: hospital ? hospital.toJSON() : null,
        },
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

export default {
  registerHospital,
  login,
  setupTotp,
  verifyTotpSetup,
  verifyTotpLogin,
  disableTotp,
  resetTotp,
  verifyTotpReset,
  recoveryLogin,
  refreshToken,
  logout,
  // LEGACY SMS OTP (DISABLED – replaced by TOTP)
  // verifyOtp,
  // resendOtp,
};
