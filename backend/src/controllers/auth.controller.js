/**
 * Authentication Controller
 * Handles login, TOTP verification, refresh token, and logout
 *
 * TOTP-based Authenticator App authentication replaces SMS OTP
 */

import AuditLog from "../models/AuditLog.js";
import Hospital from "../models/Hospital.js";
import Session from "../models/Session.js";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import PendingHospital from "../models/PendingHospital.js";
import { sendWelcomeEmail, sendAccountLockedEmail } from "../services/mail.service.js";
import { notifyNewLogin, notifySessionRevoked } from "../services/push.service.js";
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
 * Change Password - used with purpose-scoped temp token (PASSWORD_CHANGE)
 * Expects: Authorization: Bearer <tempToken>
 * Body: { newPassword }
 */
export const changePassword = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { newPassword } = req.body;

    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    // Hash and update password, clear mustChangePassword flag
    const newHash = await hashPassword(newPassword);
    hospital.passwordHash = newHash;
    hospital.mustChangePassword = false;
    await hospital.save();

    // Create a session so user is logged in and can proceed to setup 2FA
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"] || "unknown";
    const isMobile = (req.headers["x-client-type"] || "").includes("Android");
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent, isMobile);

    // Audit
    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_CHANGE",
        status: "SUCCESS",
        ipAddress,
        userAgent,
      });
    } catch (e) {
      console.error("AuditLog error (password change):", e);
    }

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
      message: "Password changed. Please complete 2FA setup.",
      requireTotpSetup: true,
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("changePassword error:", error);
    return res.status(500).json({ success: false, message: "Password change failed" });
  }
};

/**
 * Register Hospital - Create new hospital account
 * POST /api/auth/register-hospital
 */
export const registerHospital = async (req, res) => {
  try {
    const { hospitalName, email, phoneNumber, address, username } = req.body;

    // Validate inputs
    if (!hospitalName || !email || !phoneNumber || !address) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Normalize phone: strip spaces/dashes, prepend +91 if bare 10 digits
    const phoneDigits = phoneNumber.replace(/[^\d]/g, "");
    let normalizedPhone;
    if (phoneDigits.length === 10) {
      normalizedPhone = `+91${phoneDigits}`;
    } else if (phoneNumber.startsWith("+") && phoneDigits.length === 12 && phoneDigits.startsWith("91")) {
      normalizedPhone = `+${phoneDigits}`;
    } else {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // Check if logo was uploaded
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Hospital logo is required",
      });
    }

    // Check if hospital already exists (email)
    const existingHospital = await Hospital.findOne({ email: email.toLowerCase() });
    if (existingHospital) {
      return res.status(409).json({
        success: false,
        message: "Hospital with this email already exists",
      });
    }

    // Check if phone already taken
    const existingPhone = await Hospital.findOne({ phone: normalizedPhone });
    if (existingPhone) {
      return res.status(409).json({
        success: false,
        message: "This phone number is already registered",
      });
    }

    // Check if username already taken (if provided)
    if (username) {
      const existingUsername = await Hospital.findOne({ username: username.toLowerCase() });
      if (existingUsername) {
        return res.status(409).json({
          success: false,
          message: "This username is already taken",
        });
      }
    }

    // Convert logo to base64 data URL for storage
    const logoBase64 = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;

    // Generate a secure temporary password (12 chars: uppercase, lowercase, digits, special)
    const generateSecurePassword = () => {
      const length = 12;
      const uppercase = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // Exclude I, O
      const lowercase = "abcdefghijkmnopqrstuvwxyz"; // Exclude l
      const digits = "23456789"; // Exclude 0, 1
      const special = "!@#$%^&*";
      const allChars = uppercase + lowercase + digits + special;

      // Ensure at least one of each type
      let password = "";
      password += uppercase[crypto.randomInt(0, uppercase.length)];
      password += lowercase[crypto.randomInt(0, lowercase.length)];
      password += digits[crypto.randomInt(0, digits.length)];
      password += special[crypto.randomInt(0, special.length)];

      // Fill remaining with random chars
      for (let i = password.length; i < length; i++) {
        password += allChars[crypto.randomInt(0, allChars.length)];
      }

      // Fisher-Yates shuffle with crypto.randomInt for uniform distribution
      const arr = password.split("");
      for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join("");
    };

    const tempPassword = generateSecurePassword();
    const passwordHash = await hashPassword(tempPassword);

    // Create permanent Hospital directly (registration performed by admin)
    const hospital = await Hospital.create({
      hospitalName,
      email: email.toLowerCase(),
      passwordHash,
      phone: normalizedPhone,
      address,
      logoUrl: logoBase64,
      isActive: true,
      totpEnabled: false,
      totpVerified: false,
      // Mark that admin-set password must be changed on first login
      mustChangePassword: true,
      failedLoginAttempts: 0,
      ...(username ? { username: username.toLowerCase() } : {}),
    });

    // Audit Log
    try {
      const ipAddress = req.ip || req.connection.remoteAddress;
      const userAgent = req.headers["user-agent"];
      await AuditLog.create({
        userId: hospital._id,
        action: "HOSPITAL_REGISTRATION",
        status: "SUCCESS",
        ipAddress,
        userAgent,
        details: { hospitalName: hospital.hospitalName },
      });
    } catch (e) {
      console.error("AuditLog error (registration):", e);
    }

    // Send invitation email with temporary password (best-effort)
    let invitationSent = false;
    let emailError = null;
    try {
      await sendWelcomeEmail(email, hospital.hospitalName, username || email, tempPassword);
      invitationSent = true;
      console.log(`✅ Welcome email sent to ${email}`);
    } catch (emailErr) {
      emailError = emailErr.message;
      console.error("❌ Invitation email send failed:", emailErr);
      // Continue - hospital created, admin can share credentials manually
    }

    return res.status(201).json({
      success: true,
      message: invitationSent
        ? "Hospital registered successfully. Invitation email with temporary password sent to hospital admin."
        : "Hospital registered successfully. Warning: Failed to send invitation email. Please share login credentials manually.",
      data: {
        hospital: {
          id: hospital._id,
          hospitalName: hospital.hospitalName,
          email: hospital.email,
          logoUrl: hospital.logoUrl,
        },
        invitationSent,
        emailError: invitationSent ? undefined : emailError,
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
    const isMobile = (req.headers["x-client-type"] || "").includes("Android");
    const crypto = await import("crypto");
    const deviceId = crypto
      .createHash("sha256")
      .update(userAgent || "unknown")
      .digest("hex")
      .substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent, isMobile);

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
      },
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
    // Support multi-identifier: email, phone, or username
    const { email, identifier, password } = req.body;
    const loginId = (identifier || email || "").trim();

    // Validate inputs
    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: "Credentials are required",
      });
    }

    // Detect identifier type
    let query;
    if (loginId.includes("@")) {
      // Email
      query = { email: loginId.toLowerCase() };
    } else if (/^\+?\d{7,15}$/.test(loginId.replace(/[\s\-()]/g, ""))) {
      // Phone (starts with + or is all digits, 7-15 chars)
      const phoneClean = loginId.replace(/[^\d+]/g, "");
      // Normalize: bare 10-digit → +91XXXXXXXXXX
      const phoneDigitsOnly = phoneClean.replace(/[^\d]/g, "");
      let normalizedPhone = phoneClean;
      if (phoneDigitsOnly.length === 10) {
        normalizedPhone = `+91${phoneDigitsOnly}`;
      } else if (phoneDigitsOnly.length === 12 && phoneDigitsOnly.startsWith("91")) {
        normalizedPhone = `+${phoneDigitsOnly}`;
      }
      query = { phone: normalizedPhone };
    } else {
      // Username
      query = { username: loginId.toLowerCase() };
    }

    let hospital;
    try {
      hospital = await Hospital.findOne(query);
    } catch (e) {
      console.error("[auth] DB find error:", e.message);
      throw new Error("Login failed. Please try again later.");
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
          metadata: { identifier: loginId, failureReason: "User not found" },
        });
      } catch (e) {
        console.error("AuditLog error:", e);
      }

      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
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
        message: "Invalid credentials",
      });
    }

    let isPasswordValid;
    try {
      isPasswordValid = await comparePassword(password, hospital.passwordHash);
    } catch (e) {
      console.error("[auth] Password compare error:", e.message);
      throw new Error("Login failed. Please try again later.");
    }

    if (!isPasswordValid) {
      hospital.failedLoginAttempts += 1;
      if (hospital.failedLoginAttempts >= 10) {
        // 10 failed attempts on account from any IP → lock + send email
        hospital.lockUntil = Date.now() + 30 * 60 * 1000;
        try {
          await sendAccountLockedEmail(hospital.email, 30);
        } catch (e) {
          console.error("Failed to send lock email:", e.message);
        }
      } else if (hospital.failedLoginAttempts >= 5) {
        hospital.lockUntil = Date.now() + 15 * 60 * 1000;
      }
      await hospital.save();
      return res.status(401).json({
        success: false,
        message: "Invalid credentials",
      });
    }

    if (hospital.failedLoginAttempts > 0) {
      hospital.failedLoginAttempts = 0;
      hospital.lockUntil = undefined;
      await hospital.save();
    }

    // If admin created account with a temporary password, force password change
    if (hospital.mustChangePassword) {
      const tempToken = generateTempToken(hospital._id, "PASSWORD_CHANGE");
      try {
        await AuditLog.create({
          userId: hospital._id,
          action: "LOGIN_ATTEMPT",
          status: "SUCCESS",
          ipAddress,
          userAgent,
          details: { step: "PASSWORD_VERIFIED", requirePasswordChange: true },
        });
      } catch (e) {
        console.error("AuditLog error (password change required):", e);
      }

      return res.status(200).json({
        success: true,
        message: "Password change required. Please change your password to continue.",
        requirePasswordChange: true,
        data: {
          tempToken,
          hospitalName: hospital.hospitalName,
          logoUrl: hospital.logoUrl,
        },
      });
    }

    // Check if TOTP 2FA is enabled
    // Only enforce TOTP for Mobile App Manual Login
    // Web: Disabled (as per request)
    // Mobile Biometric: Disabled (as per request)
    // Strict Mobile check via custom header (prevent mobile web from triggering this)
    const isMobile = (req.headers["x-client-type"] || "").includes("Android");
    const isBiometric = req.body.isBiometric === true;

    if (hospital.totpEnabled && hospital.totpVerified) {
      if (isMobile && !isBiometric) {
         // Enforce TOTP for Mobile Manual Login
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
      // Else: Is Web OR Is Biometric -> Skip TOTP check
    }

    // TOTP not enabled - create session directly
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent, isMobile);

    // Fire-and-forget push notification for new login
    notifyNewLogin(hospital._id, userAgent).catch(console.error);

    await AuditLog.create({
      userId: hospital._id,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "PASSWORD_ONLY", totpEnabled: false, isMobile },
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
      requireTotpSetup: !hospital.totpEnabled, // Force 2FA setup if not enabled
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Login failed. Please try again later.",
    });
  }
};

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

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
    return res.status(200).json({
      success: true,
      message: "Scan the QR code with your authenticator app",
      data: {
        qrCode: totpData.qrCode,
        secret: totpData.secret, // Unmasked for manual entry (shown once)
        otpauthUrl: totpData.otpauthUrl,
      },
    });
  } catch (error) {
    console.error("TOTP setup error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to setup 2FA",
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
      message: "Failed to verify 2FA",
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

    // Fire-and-forget push notification for new login
    notifyNewLogin(hospitalId, userAgent).catch(console.error);

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
      message: "TOTP verification failed",
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
      message: "Failed to disable 2FA",
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

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.set("Pragma", "no-cache");
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
      message: "Failed to reset 2FA",
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
      message: "Failed to verify rotation",
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

    // Fire-and-forget push notification for new login
    notifyNewLogin(hospitalId, userAgent).catch(console.error);

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
      message: "Recovery login failed",
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
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    let invalidated = false;

    // Try to invalidate by refresh token first
    if (refreshToken) {
      invalidated = await invalidateSession(refreshToken);
    }

    // Fallback: invalidate by session ID from the access token
    if (!invalidated) {
      const accessToken = req.cookies?.accessToken ||
        (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
      if (accessToken) {
        try {
          const { verifyToken } = await import("../utils/jwt.js");
          const decoded = verifyToken(accessToken);
          if (decoded.sessionId) {
            await Session.updateOne({ _id: decoded.sessionId }, { isActive: false });
            invalidated = true;
          }
        } catch (_) { /* token may be expired, ignore */ }
      }
    }

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
      message: "Logout failed",
    });
  }
};

// ═══════════════════════════════════════════════════
// BIOMETRIC BINDING (Feature 4)
// ═══════════════════════════════════════════════════

/**
 * Register biometric public key
 * POST /api/auth/biometric/register
 */
export const registerBiometric = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { publicKey, deviceId } = req.body;

    if (!publicKey || !deviceId) {
      return res.status(400).json({ success: false, message: "publicKey and deviceId are required" });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    // Remove existing key for this device (re-enrollment)
    hospital.biometricKeys = (hospital.biometricKeys || []).filter(
      (k) => k.deviceId !== deviceId,
    );

    hospital.biometricKeys.push({ deviceId, publicKey, createdAt: new Date() });
    await hospital.save();

    const ipAddress = req.ip || req.connection.remoteAddress;
    await AuditLog.create({
      userId: hospitalId,
      action: "BIOMETRIC_REGISTERED",
      status: "SUCCESS",
      ipAddress,
      userAgent: req.headers["user-agent"],
      details: { deviceId },
    }).catch(() => {});

    return res.status(200).json({ success: true, message: "Biometric registered successfully" });
  } catch (error) {
    console.error("Biometric register error:", error);
    return res.status(500).json({ success: false, message: "Failed to register biometric" });
  }
};

/**
 * Generate biometric login challenge
 * POST /api/auth/biometric/challenge
 */
export const biometricChallenge = async (req, res) => {
  try {
    const { deviceId, identifier } = req.body;

    if (!deviceId || !identifier) {
      return res.status(400).json({ success: false, message: "deviceId and identifier are required" });
    }

    // Find user
    const loginId = identifier.trim();
    let query;
    if (loginId.includes("@")) query = { email: loginId.toLowerCase() };
    else if (/^\+?\d{7,15}$/.test(loginId.replace(/[\s\-()]/g, ""))) query = { phone: loginId.replace(/[^\d+]/g, "") };
    else query = { username: loginId.toLowerCase() };

    const hospital = await Hospital.findOne(query).lean();
    if (!hospital) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Check if biometric is registered for this device
    const biometricKey = (hospital.biometricKeys || []).find((k) => k.deviceId === deviceId);
    if (!biometricKey) {
      return res.status(404).json({ success: false, message: "No biometric key found for this device" });
    }

    // Generate challenge (nonce)
    const challenge = crypto.randomBytes(32).toString("base64");

    // Store challenge in Redis or in-memory with short TTL
    const { getRedis } = await import("../config/redis.js");
    const redis = getRedis();
    await redis.set(`bio:challenge:${hospital._id}:${deviceId}`, challenge, "EX", 120);

    return res.status(200).json({
      success: true,
      data: { challenge, hospitalId: hospital._id },
    });
  } catch (error) {
    console.error("Biometric challenge error:", error);
    return res.status(500).json({ success: false, message: "Failed to generate challenge" });
  }
};

/**
 * Verify biometric login
 * POST /api/auth/biometric/verify
 */
export const verifyBiometric = async (req, res) => {
  try {
    const { hospitalId, deviceId, signature } = req.body;

    if (!hospitalId || !deviceId || !signature) {
      return res.status(400).json({ success: false, message: "hospitalId, deviceId, and signature are required" });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital || !hospital.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Get stored challenge
    const { getRedis } = await import("../config/redis.js");
    const redis = getRedis();
    const challenge = await redis.get(`bio:challenge:${hospitalId}:${deviceId}`);
    if (!challenge) {
      return res.status(401).json({ success: false, message: "Challenge expired or invalid" });
    }

    // Find biometric key for device
    const biometricKey = (hospital.biometricKeys || []).find((k) => k.deviceId === deviceId);
    if (!biometricKey) {
      return res.status(401).json({ success: false, message: "No biometric key for this device" });
    }

    // Verify signature using the stored public key
    const verifier = crypto.createVerify("SHA256");
    verifier.update(challenge);
    const isValid = verifier.verify(biometricKey.publicKey, signature, "base64");

    // Clean up challenge (single-use)
    await redis.del(`bio:challenge:${hospitalId}:${deviceId}`);

    if (!isValid) {
      return res.status(401).json({ success: false, message: "Invalid biometric signature" });
    }

    // Create session (biometric login = skip TOTP)
    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"] || "unknown";
    const isMobile = true; // Biometric is always mobile
    const sessionDeviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, sessionDeviceId, ipAddress, userAgent, isMobile);

    // Fire-and-forget push notification for new login
    notifyNewLogin(hospital._id, userAgent).catch(console.error);

    await AuditLog.create({
      userId: hospital._id,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "BIOMETRIC", deviceId },
    }).catch(() => {});

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
      message: "Biometric login successful",
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("Biometric verify error:", error);
    return res.status(500).json({ success: false, message: "Biometric verification failed" });
  }
};

// ═══════════════════════════════════════════════════
// SESSION MANAGEMENT (Feature 5)
// ═══════════════════════════════════════════════════

/**
 * Check for active session conflict before login
 * POST /api/auth/session/check-conflict
 */
export const checkSessionConflict = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) return res.status(400).json({ success: false, message: "identifier required" });

    const loginId = identifier.trim();
    let query;
    if (loginId.includes("@")) query = { email: loginId.toLowerCase() };
    else if (/^\+?\d{7,15}$/.test(loginId.replace(/[\s\-()]/g, ""))) query = { phone: loginId.replace(/[^\d+]/g, "") };
    else query = { username: loginId.toLowerCase() };

    const hospital = await Hospital.findOne(query).select("_id role").lean();
    if (!hospital) {
      // Don't reveal if user exists
      return res.status(200).json({ success: true, conflict: false });
    }

    // Admin accounts can have multiple sessions
    if (hospital.role === "admin") {
      return res.status(200).json({ success: true, conflict: false });
    }

    const activeSessions = await Session.find({
      hospitalId: hospital._id,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).select("platform lastSeenAt lastSeenIp userAgent").lean();

    if (activeSessions.length === 0) {
      return res.status(200).json({ success: true, conflict: false });
    }

    const activeDevice = activeSessions[0];
    return res.status(200).json({
      success: true,
      conflict: true,
      activeDevice: {
        platform: activeDevice.platform || "unknown",
        lastSeen: activeDevice.lastSeenAt,
        ip: activeDevice.lastSeenIp,
      },
    });
  } catch (error) {
    console.error("Session conflict check error:", error);
    return res.status(500).json({ success: false, message: "Failed to check session" });
  }
};

/**
 * Validate current session
 * GET /api/auth/session/validate
 */
export const validateSession = async (req, res) => {
  try {
    return res.status(200).json({ success: true, valid: true });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Validation failed" });
  }
};

/**
 * Force logout from another device (resolve conflict)
 * POST /api/auth/session/force-logout
 */
export const forceLogoutOtherSessions = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const currentSessionId = req.sessionId;

    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Invalidate all sessions except current
    await Session.updateMany(
      { hospitalId, isActive: true, _id: { $ne: currentSessionId } },
      { isActive: false, revokedReason: "SESSION_CONFLICT" },
    );

    // Fire-and-forget push notification for revoked sessions
    notifySessionRevoked(hospitalId).catch(console.error);

    return res.status(200).json({ success: true, message: "Other sessions terminated" });
  } catch (error) {
    console.error("Force logout error:", error);
    return res.status(500).json({ success: false, message: "Failed to terminate sessions" });
  }
};

/**
 * Store FCM push notification token from mobile client
 * POST /api/auth/fcm-token
 */
export const storeFcmToken = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ success: false, message: "fcmToken is required" });

    await Hospital.findByIdAndUpdate(hospitalId, {
      fcmToken: { token: fcmToken, updatedAt: new Date() },
    });

    return res.status(200).json({ success: true, message: "FCM token stored" });
  } catch (error) {
    console.error("Store FCM token error:", error);
    return res.status(500).json({ success: false, message: "Failed to store FCM token" });
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
  registerBiometric,
  biometricChallenge,
  verifyBiometric,
  checkSessionConflict,
  validateSession,
  forceLogoutOtherSessions,
  storeFcmToken,
};
