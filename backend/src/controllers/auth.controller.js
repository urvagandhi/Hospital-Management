/**
 * Authentication Controller
 * Handles login (with Auth Code second factor), change-password,
 * refresh-token, logout, biometric login and session management.
 */

import crypto from "crypto";
import AuditLog from "../models/AuditLog.js";
import Hospital from "../models/Hospital.js";
import Session from "../models/Session.js";
import { geolocateIp } from "../services/geoip.service.js";
import { sendAccountLockedEmail, sendForgotPasswordOtpEmail, sendLogoutConfirmationEmail, sendOTPEmail, sendPasswordChangedEmail, sendPasswordResetNoticeEmail, sendSessionRevokedEmail, sendWelcomeEmail } from "../services/mail.service.js";
import { notifyNewLogin, notifyPasswordChanged, notifySessionRevoked } from "../services/push.service.js";
import {
  consumeBiometricChallenge,
  deleteForgotPasswordOtp,
  deletePartialRegistration,
  getForgotPasswordLastSent,
  getLastOTPSent,
  getPartialRegistration,
  peekBiometricChallenge,
  setBiometricChallenge,
  setForgotPasswordLastSent,
  setForgotPasswordOtp,
  setLastOTPSent,
  setOTP,
  setPartialRegistration,
  verifyForgotPasswordOtp,
  verifyOTP,
} from "../services/redis.service.js";
import { createSession, invalidateAllSessions, invalidateSession, refreshAccessToken } from "../services/token.service.js";
import { comparePassword, hashPassword } from "../utils/hash.js";
import { generateTempToken, verifyToken } from "../utils/jwt.js";

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
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year — long-lived refresh cookie; security gate is 7-day AuthCode re-verify
    });

    return res.status(200).json({
      success: true,
      message: "Password changed successfully.",
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
    const { hospitalName, email, phoneNumber, address } = req.body;

    // Required: hospitalName, email, phoneNumber. address and logo are optional.
    if (!hospitalName || !email || !phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Hospital name, email, and phone number are required",
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

    // Logo is optional — if uploaded it will be stored; otherwise Hospital model
    // will apply its default placeholder logoUrl.

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

    // Convert logo to base64 data URL for storage (only if uploaded)
    const logoBase64 = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : undefined;

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

    // Create permanent Hospital directly (registration performed by admin).
    // authCode is auto-generated by the Hospital model's pre-validate hook.
    const hospital = await Hospital.create({
      hospitalName,
      email: email.toLowerCase(),
      passwordHash,
      phone: normalizedPhone,
      ...(address ? { address } : {}),
      ...(logoBase64 ? { logoUrl: logoBase64 } : {}),
      isActive: true,
      // Admin-set temp password must be changed on first login
      mustChangePassword: true,
      failedLoginAttempts: 0,
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
      await sendWelcomeEmail(email, hospital.hospitalName, email, tempPassword, hospital.authCode);
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

// ═══════════════════════════════════════════════════════════════════════════
// SELF-REGISTRATION FLOW (Android app)
//
//  Step 1: POST /api/auth/register
//          → validate + store partial reg in Redis + send OTP
//  Step 2: POST /api/auth/register/verify-otp
//          → verify OTP + create Hospital + send welcome email
//  Step 3: POST /api/auth/register/resend-otp
//          → re-send OTP (60s cooldown)
// ═══════════════════════════════════════════════════════════════════════════

const REG_OTP_TTL_SECONDS = 600;            // 10 minutes
const REG_OTP_MAX_ATTEMPTS = 3;
const REG_PARTIAL_TTL_SECONDS = 1800;       // 30 minutes
const REG_RESEND_COOLDOWN_SECONDS = 60;

/** Generate a 6-digit numeric OTP with leading zeros preserved. */
function generateOtp() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

/** Validate password strength: 8+ chars, upper, lower, digit, special. */
function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters";
  }
  if (!/[A-Z]/.test(password)) return "Password must contain an uppercase letter";
  if (!/[a-z]/.test(password)) return "Password must contain a lowercase letter";
  if (!/\d/.test(password)) return "Password must contain a digit";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password must contain a special character";
  return null;
}

/** Normalize a 10-digit Indian phone number to +91XXXXXXXXXX format. */
function normalizeIndianPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

/**
 * POST /api/auth/register
 *
 * Accepts: hospitalName, email, phone (or phoneNumber), password,
 *          logo (optional, multipart file), address (optional).
 *
 * Does NOT create the Hospital account. Instead:
 *   1. Validates fields + uniqueness of email and phone.
 *   2. Hashes the password (bcrypt) and stashes {hospitalName, email, phone,
 *      passwordHash, address, logoBase64} in Redis under `partial_reg:{email}`
 *      with a 30-minute TTL.
 *   3. Generates a 6-digit OTP, stores a SHA-256 hash in Redis under
 *      `otp:{email}` with a 10-minute TTL and 3-attempt limit.
 *   4. Sends the OTP to the user's email; logs to console as a dev stub
 *      for the phone (SMS gateway will be swapped in later).
 *   5. Arms a 60-second resend cooldown via `last_otp_sent:{email}`.
 *
 * The Hospital is only created once the user completes /register/verify-otp.
 */
export const registerSelfService = async (req, res) => {
  try {
    const { hospitalName, email, password, address } = req.body;
    // Accept both "phone" and "phoneNumber" for client flexibility
    const phoneRaw = req.body.phone || req.body.phoneNumber;

    // ── Required field validation ─────────────────────────────────────────
    if (!hospitalName || !email || !phoneRaw || !password) {
      return res.status(400).json({
        success: false,
        message: "Hospital name, email, phone, and password are required",
      });
    }

    if (typeof hospitalName !== "string" || hospitalName.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: "Hospital name must be at least 3 characters",
      });
    }

    // ── Email format ──────────────────────────────────────────────────────
    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ success: false, message: "Invalid email format" });
    }

    // ── Phone normalization ───────────────────────────────────────────────
    const normalizedPhone = normalizeIndianPhone(phoneRaw);
    if (!normalizedPhone) {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // ── Password strength ─────────────────────────────────────────────────
    const pwErr = validatePasswordStrength(password);
    if (pwErr) {
      return res.status(400).json({ success: false, message: pwErr });
    }

    // ── Uniqueness checks against existing accounts ───────────────────────
    const emailTaken = await Hospital.findOne({ email: normalizedEmail }).select("_id").lean();
    if (emailTaken) {
      return res.status(409).json({
        success: false,
        message: "An account with this email already exists",
      });
    }
    const phoneTaken = await Hospital.findOne({ phone: normalizedPhone }).select("_id").lean();
    if (phoneTaken) {
      return res.status(409).json({
        success: false,
        message: "An account with this phone number already exists",
      });
    }

    // ── Logo (optional) ──────────────────────────────────────────────────
    const logoBase64 = req.file
      ? `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`
      : null;

    // ── Hash password NOW so we never store the plaintext anywhere ──────
    const passwordHash = await hashPassword(password);

    // ── Stash partial registration in Redis (30 min TTL) ─────────────────
    await setPartialRegistration(
      normalizedEmail,
      {
        hospitalName: hospitalName.trim(),
        email: normalizedEmail,
        phone: normalizedPhone,
        passwordHash,
        address: address ? String(address).trim() : null,
        logoBase64,
      },
      REG_PARTIAL_TTL_SECONDS,
    );

    // ── Generate + store OTP (10 min TTL, 3 attempts) ────────────────────
    const otp = generateOtp();
    await setOTP(normalizedEmail, otp, REG_OTP_TTL_SECONDS);
    await setLastOTPSent(normalizedEmail, REG_RESEND_COOLDOWN_SECONDS);

    // ── Deliver OTP ──────────────────────────────────────────────────────
    try {
      await sendOTPEmail(normalizedEmail, otp, "registration");
      console.log(`✅ Registration OTP sent to email: ${normalizedEmail}`);
    } catch (mailErr) {
      console.error("❌ OTP email send failed:", mailErr.message);
      // Fall through — OTP is still in Redis; dev can read it from the log below
    }

    // Dev SMS stub — the real SMS gateway integration will replace this
    console.log(`📱 [DEV SMS] Registration OTP for ${normalizedPhone}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "OTP sent to email. Please verify to complete registration.",
      data: {
        email: normalizedEmail,
        otpExpiresInSeconds: REG_OTP_TTL_SECONDS,
        resendAvailableInSeconds: REG_RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (error) {
    console.error("[registerSelfService] error:", error);
    return res.status(500).json({
      success: false,
      message: "Registration failed. Please try again later.",
    });
  }
};

/**
 * POST /api/auth/register/verify-otp
 *
 * Accepts: email, otp.
 *
 * Verifies the 6-digit OTP (3-attempt limit). On success:
 *   - Loads the partial registration from Redis
 *   - Creates the Hospital account
 *       ▸ mustChangePassword = false  (user set their own password)
 *       ▸ isActive = true
 *       ▸ authCode is auto-generated by Hospital's pre-validate hook
 *   - Clears the Redis partial registration and OTP
 *   - Emails the hospital their authCode via sendWelcomeEmail (no temp password)
 */
export const verifyRegistrationOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
    }

    // ── Verify OTP (3 attempts max) ──────────────────────────────────────
    const result = await verifyOTP(normalizedEmail, String(otp), REG_OTP_MAX_ATTEMPTS);

    if (!result.valid) {
      if (result.expired) {
        return res.status(410).json({
          success: false,
          message: "OTP expired or not found. Please request a new one.",
        });
      }
      if (result.attemptsLeft === 0) {
        return res.status(400).json({
          success: false,
          message: "Too many incorrect attempts. Please request a new OTP.",
        });
      }
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${result.attemptsLeft} attempt(s) remaining.`,
        data: { attemptsLeft: result.attemptsLeft },
      });
    }

    // ── Fetch partial registration ───────────────────────────────────────
    const partial = await getPartialRegistration(normalizedEmail);
    if (!partial) {
      return res.status(410).json({
        success: false,
        message: "Registration session expired. Please start over.",
      });
    }

    // ── Final uniqueness check (someone else may have grabbed the email/phone
    //    between Step 1 and Step 2) ─────────────────────────────────────────
    const emailCollision = await Hospital.findOne({ email: partial.email }).select("_id").lean();
    if (emailCollision) {
      await deletePartialRegistration(normalizedEmail);
      return res.status(409).json({
        success: false,
        message: "This email was registered by another user while you were verifying. Please try a different email.",
      });
    }
    const phoneCollision = await Hospital.findOne({ phone: partial.phone }).select("_id").lean();
    if (phoneCollision) {
      await deletePartialRegistration(normalizedEmail);
      return res.status(409).json({
        success: false,
        message: "This phone number was registered by another user while you were verifying.",
      });
    }

    // ── Create the Hospital (authCode auto-generated by pre-validate hook) ─
    let hospital;
    try {
      hospital = await Hospital.create({
        hospitalName: partial.hospitalName,
        email: partial.email,
        phone: partial.phone,
        passwordHash: partial.passwordHash,
        ...(partial.address ? { address: partial.address } : {}),
        ...(partial.logoBase64 ? { logoUrl: partial.logoBase64 } : {}),
        isActive: true,
        mustChangePassword: false,   // user chose their own password
        failedLoginAttempts: 0,
      });
    } catch (createErr) {
      // Handle race-condition duplicate key errors gracefully
      if (createErr.code === 11000) {
        const field = Object.keys(createErr.keyPattern || {})[0] || "field";
        await deletePartialRegistration(normalizedEmail);
        return res.status(409).json({
          success: false,
          message: `This ${field} is already registered.`,
        });
      }
      throw createErr;
    }

    // ── Cleanup Redis ────────────────────────────────────────────────────
    await deletePartialRegistration(normalizedEmail);

    // ── Audit log (fire and forget) ──────────────────────────────────────
    AuditLog.create({
      userId: hospital._id,
      action: "HOSPITAL_REGISTRATION",
      status: "SUCCESS",
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: { hospitalName: hospital.hospitalName, flow: "self-service" },
    }).catch((e) => console.error("[AuditLog] registration:", e.message));

    // ── Welcome email (no temp password — user chose their own) ─────────
    try {
      await sendWelcomeEmail(hospital.email, hospital.hospitalName, hospital.email, null, hospital.authCode);
      console.log(`✅ Welcome email sent to ${hospital.email} (authCode: ${hospital.authCode})`);
    } catch (mailErr) {
      console.error("⚠️  Welcome email failed (account was still created):", mailErr.message);
    }

    return res.status(201).json({
      success: true,
      message: "Registration complete. You can now log in.",
      data: hospital,
    });
  } catch (error) {
    console.error("[verifyRegistrationOtp] error:", error);
    return res.status(500).json({
      success: false,
      message: "Verification failed. Please try again later.",
    });
  }
};

/**
 * POST /api/auth/register/resend-otp
 *
 * Accepts: email.
 * Rate-limited to once per 60 seconds per email.
 */
export const resendRegistrationOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, message: "Email is required" });
    }
    const normalizedEmail = String(email).toLowerCase().trim();

    // ── 60-second cooldown ───────────────────────────────────────────────
    const lastSentTs = await getLastOTPSent(normalizedEmail);
    if (lastSentTs) {
      const elapsedMs = Date.now() - lastSentTs;
      const remainingSec = Math.ceil((REG_RESEND_COOLDOWN_SECONDS * 1000 - elapsedMs) / 1000);
      if (remainingSec > 0) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSec} second(s) before requesting another OTP.`,
          data: { retryAfterSeconds: remainingSec },
        });
      }
    }

    // ── Partial registration must still be valid ─────────────────────────
    const partial = await getPartialRegistration(normalizedEmail);
    if (!partial) {
      return res.status(410).json({
        success: false,
        message: "Registration session expired. Please start over.",
      });
    }

    // ── Generate + store fresh OTP (resets attempt counter) ──────────────
    const otp = generateOtp();
    await setOTP(normalizedEmail, otp, REG_OTP_TTL_SECONDS);
    await setLastOTPSent(normalizedEmail, REG_RESEND_COOLDOWN_SECONDS);

    // ── Deliver ──────────────────────────────────────────────────────────
    try {
      await sendOTPEmail(normalizedEmail, otp, "registration");
      console.log(`🔁 Registration OTP resent to: ${normalizedEmail}`);
    } catch (mailErr) {
      console.error("❌ OTP resend email failed:", mailErr.message);
    }
    console.log(`📱 [DEV SMS] Resent registration OTP for ${partial.phone}: ${otp}`);

    return res.status(200).json({
      success: true,
      message: "A new OTP has been sent.",
      data: {
        email: normalizedEmail,
        otpExpiresInSeconds: REG_OTP_TTL_SECONDS,
        resendAvailableInSeconds: REG_RESEND_COOLDOWN_SECONDS,
      },
    });
  } catch (error) {
    console.error("[resendRegistrationOtp] error:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to resend OTP. Please try again later.",
    });
  }
};

/**
 * Login - Step 1: Validate email/phone + password.
 * POST /api/auth/login
 *
 * Flow:
 *   • Invalid credentials                       → 401
 *   • hospital.mustChangePassword === true      → 200 { requirePasswordChange, tempToken (PURPOSE=PASSWORD_CHANGE) }
 *   • Biometric login (req.body.isBiometric)    → 200 full session (no 2nd factor)
 *   • Otherwise                                 → 200 { requireAuthCode, tempToken (PURPOSE=AUTH_CODE) }
 *
 * The 2nd factor is completed by POST /api/auth/login/verify-auth-code.
 */
export const login = async (req, res) => {
  try {
    // Support multi-identifier: email or phone
    const { email, identifier, password } = req.body;
    const loginId = (identifier || email || "").trim();

    // Validate inputs
    if (!loginId || !password) {
      return res.status(400).json({
        success: false,
        message: "Credentials are required",
      });
    }

    // Detect identifier type: email or phone only
    let query;
    if (loginId.includes("@")) {
      query = { email: loginId.toLowerCase() };
    } else if (/^\+?\d{7,15}$/.test(loginId.replace(/[\s\-()]/g, ""))) {
      // Phone (starts with + or is all digits, 7-15 chars)
      const phoneClean = loginId.replace(/[^\d+]/g, "");
      const phoneDigitsOnly = phoneClean.replace(/[^\d]/g, "");
      let normalizedPhone = phoneClean;
      if (phoneDigitsOnly.length === 10) {
        normalizedPhone = `+91${phoneDigitsOnly}`;
      } else if (phoneDigitsOnly.length === 12 && phoneDigitsOnly.startsWith("91")) {
        normalizedPhone = `+${phoneDigitsOnly}`;
      }
      query = { phone: normalizedPhone };
    } else {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid email or phone number",
      });
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
      return res.status(403).json({
        success: false,
        code: "ACCOUNT_DISABLED",
        message: "Your account has been disabled by an administrator. Please contact support.",
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

    // ── Password OK → issue AUTH_CODE temp token ────────────────────────
    // Second factor is now the 6-digit hospital authCode (replaces TOTP).
    // The biometric login path below bypasses this (creates a session directly).
    const isMobile = (req.headers["x-client-type"] || "").includes("Android");
    const isBiometric = req.body.isBiometric === true;

    if (isBiometric) {
      // Biometric login path — password verification was bypassed with a signed
      // challenge earlier, so authCode is not required. Create session directly.
      const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
      const session = await createSession(hospital._id, deviceId, ipAddress, userAgent, isMobile);

      notifyNewLogin(hospital._id, userAgent).catch(console.error);

      await AuditLog.create({
        userId: hospital._id,
        action: "LOGIN_SUCCESS",
        status: "SUCCESS",
        ipAddress,
        userAgent,
        details: { method: "BIOMETRIC", isMobile },
      }).catch((e) => console.error("AuditLog error:", e.message));

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
        maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year — long-lived refresh cookie; security gate is 7-day AuthCode re-verify
      });

      return res.status(200).json({
        success: true,
        message: "Login successful.",
        data: {
          accessToken: session.accessToken,
          refreshToken: session.refreshToken,
          tokenType: session.tokenType,
          expiresIn: session.expiresIn,
          hospital: hospital.toJSON(),
        },
      });
    }

    // Standard password login → require Auth Code as second factor
    const tempToken = generateTempToken(hospital._id, "AUTH_CODE");

    AuditLog.create({
      userId: hospital._id,
      action: "LOGIN_ATTEMPT",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { step: "PASSWORD_VERIFIED", requireAuthCode: true },
    }).catch((e) => console.error("AuditLog error:", e.message));

    return res.status(200).json({
      success: true,
      message: "Password verified. Please enter your Auth Code to continue.",
      requireAuthCode: true,
      data: {
        tempToken,
        hospitalName: hospital.hospitalName,
        logoUrl: hospital.logoUrl,
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
 * POST /api/auth/login/verify-auth-code
 *
 * Step 2 of the password-login flow. Consumes the AUTH_CODE temp token and
 * validates the hospital's 6-digit numeric authCode. On success creates a
 * session and issues access + refresh tokens (same as biometric login).
 *
 * Request:
 *   Authorization: Bearer <tempToken>            (purpose=AUTH_CODE, 10min TTL)
 *   Body: { authCode: "041326" }
 *
 * Response (200):
 *   { success, message, data: { accessToken, refreshToken, hospital, ... } }
 *
 * Failure cases:
 *   401  Invalid/expired temp token
 *   401  Wrong authCode (tracked via Hospital.failedLoginAttempts)
 *   423  Account locked after too many wrong attempts
 */
export const verifyAuthCodeLogin = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Invalid session token" });
    }

    const { authCode } = req.body;
    if (!authCode || !/^\d{6}$/.test(String(authCode))) {
      return res.status(400).json({ success: false, message: "Auth code must be 6 digits" });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital || !hospital.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (hospital.lockUntil && hospital.lockUntil > Date.now()) {
      return res.status(423).json({
        success: false,
        message: "Account is locked. Please try again later.",
        lockUntil: hospital.lockUntil,
      });
    }

    if (!hospital.authCode) {
      // Legacy account that predates authCode generation — admin must intervene.
      console.error(`[verifyAuthCodeLogin] Hospital ${hospitalId} has no authCode set`);
      return res.status(500).json({
        success: false,
        message: "This account cannot log in right now. Please contact support.",
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"] || "";

    // Constant-time comparison to prevent timing side-channel attacks
    const provided = Buffer.from(String(authCode));
    const expected = Buffer.from(hospital.authCode);
    const isValid = provided.length === expected.length && crypto.timingSafeEqual(provided, expected);

    if (!isValid) {
      hospital.failedLoginAttempts = (hospital.failedLoginAttempts || 0) + 1;
      if (hospital.failedLoginAttempts >= 10) {
        hospital.lockUntil = Date.now() + 30 * 60 * 1000;
        sendAccountLockedEmail(hospital.email, 30).catch((e) => console.error("Lock email failed:", e.message));
      } else if (hospital.failedLoginAttempts >= 5) {
        hospital.lockUntil = Date.now() + 15 * 60 * 1000;
      }
      await hospital.save();

      AuditLog.create({
        userId: hospital._id,
        action: "LOGIN_FAILED",
        status: "FAILURE",
        ipAddress,
        userAgent,
        details: { step: "AUTH_CODE", failedAttempts: hospital.failedLoginAttempts },
      }).catch((e) => console.error("AuditLog error:", e.message));

      return res.status(401).json({ success: false, message: "Invalid auth code" });
    }

    // Success — clear any accumulated failure state and create a session
    if (hospital.failedLoginAttempts > 0 || hospital.lockUntil) {
      hospital.failedLoginAttempts = 0;
      hospital.lockUntil = undefined;
      await hospital.save();
    }

    const isMobile = (req.headers["x-client-type"] || "").includes("Android");
    const deviceId = crypto.createHash("sha256").update(userAgent).digest("hex").substring(0, 16);
    const session = await createSession(hospital._id, deviceId, ipAddress, userAgent, isMobile);

    notifyNewLogin(hospital._id, userAgent).catch(console.error);

    AuditLog.create({
      userId: hospital._id,
      action: "LOGIN_SUCCESS",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { method: "AUTH_CODE", isMobile },
    }).catch((e) => console.error("AuditLog error:", e.message));

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
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year — long-lived refresh cookie; security gate is 7-day AuthCode re-verify
    });

    return res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: session.tokenType,
        expiresIn: session.expiresIn,
        hospital: hospital.toJSON(),
      },
    });
  } catch (error) {
    console.error("verifyAuthCodeLogin error:", error);
    return res.status(500).json({ success: false, message: "Login failed. Please try again later." });
  }
};

/**
 * POST /api/auth/login/resend-auth-code
 *
 * Re-send the hospital's 6-digit authCode to their registered email. Used
 * when the welcome email was lost/not received and the user is stuck at the
 * second-factor step. Gated by the AUTH_CODE temp token (user already proved
 * password ownership). Does NOT rotate the authCode and does NOT touch the
 * password — this works for both admin-provisioned and self-registered
 * hospitals, regardless of mustChangePassword.
 */
const resendAuthCodeCooldown = new Map(); // in-memory 60s cooldown per hospital

export const resendLoginAuthCode = async (req, res) => {
  try {
    const hospitalId = req.hospitalId;
    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Invalid session token" });
    }

    const last = resendAuthCodeCooldown.get(hospitalId);
    if (last && Date.now() - last < 60_000) {
      const retryAfter = Math.ceil((60_000 - (Date.now() - last)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${retryAfter} second(s) before resending.`,
        data: { retryAfterSeconds: retryAfter },
      });
    }

    const hospital = await Hospital.findById(hospitalId).select("email hospitalName authCode isActive");
    if (!hospital || !hospital.isActive) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }
    if (!hospital.authCode) {
      return res.status(500).json({
        success: false,
        message: "This account cannot resend an Auth Code right now. Please contact support.",
      });
    }

    resendAuthCodeCooldown.set(hospitalId, Date.now());

    try {
      await sendWelcomeEmail(hospital.email, hospital.hospitalName, hospital.email, null, hospital.authCode);
    } catch (mailErr) {
      console.error("[resendLoginAuthCode] mail send failed:", mailErr.message);
      return res.status(502).json({
        success: false,
        message: "Could not deliver the email. Please try again in a moment.",
      });
    }

    AuditLog.create({
      userId: hospitalId,
      action: "AUTH_CODE_RESEND",
      status: "SUCCESS",
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: { channel: "email" },
    }).catch((e) => console.error("[AuditLog] resendAuthCode:", e.message));

    return res.status(200).json({
      success: true,
      message: "Auth Code re-sent to your registered email.",
      data: { retryAfterSeconds: 60 },
    });
  } catch (error) {
    console.error("[resendLoginAuthCode] error:", error);
    return res.status(500).json({ success: false, message: "Failed to resend Auth Code" });
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

    // After rotation, `token` no longer matches any session — use the hospitalId
    // surfaced by refreshAccessToken() instead of re-querying by the old token.
    const hospital = await Hospital.findById(tokens.hospitalId);

    // Set new access + refresh cookies. Refresh rotation REQUIRES overwriting
    // the httpOnly refresh cookie so the next refresh presents the new token.
    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("accessToken", tokens.accessToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 15 * 60 * 1000, // 15 minutes
    });
    res.cookie("refreshToken", tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year — matches login
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
 * Logout - Invalidate (HARD-delete) session
 * POST /api/auth/logout
 *
 * Idempotent: returns 200 even if no session was found (e.g. retry after
 * network failure, or token already expired). Manual logout always hard-
 * deletes so the row never counts toward the 2-mobile-session limit.
 */
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

    // Capture the session BEFORE deletion so we can email/audit/cleanup.
    let sessionDoc = null;

    if (refreshToken) {
      sessionDoc = await Session.findOne({ refreshToken })
        .select("_id hospitalId isMobile userAgent ipAddress")
        .lean();
    }

    // Fallback: locate by sessionId from the access token (covers cases where
    // the refresh-cookie was already cleared but the access-token is still in
    // the Authorization header).
    if (!sessionDoc) {
      const accessToken = req.cookies?.accessToken ||
        (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
      if (accessToken) {
        try {
          const { verifyToken } = await import("../utils/jwt.js");
          const decoded = verifyToken(accessToken);
          if (decoded?.sessionId) {
            sessionDoc = await Session.findById(decoded.sessionId)
              .select("_id hospitalId isMobile userAgent ipAddress")
              .lean();
          }
        } catch (_) { /* expired/invalid access token — proceed to clear cookies */ }
      }
    }

    if (sessionDoc?._id) {
      // HARD delete — leaves no ghost entry that would count toward the
      // 2-mobile-session limit. The forced/admin-revoke paths intentionally
      // soft-delete so the old device's next API call gets a 401-with-reason;
      // for *self-initiated* logout that's not needed.
      await Session.deleteOne({ _id: sessionDoc._id });

      // Audit (fire-and-forget — never block logout).
      AuditLog.create({
        userId: sessionDoc.hospitalId,
        action: "LOGOUT",
        status: "SUCCESS",
        ipAddress: req.ip || req.connection?.remoteAddress,
        userAgent: req.headers["user-agent"],
        details: { sessionId: String(sessionDoc._id) },
      }).catch((e) => console.error("[logout] audit failed:", e.message));

      // Send confirmation email + smart fcmToken cleanup. Both fire-and-
      // forget so notification failures never break logout.
      Hospital.findById(sessionDoc.hospitalId).select("email").lean()
        .then((h) => {
          if (h?.email) {
            sendLogoutConfirmationEmail(h.email, {
              userAgent: sessionDoc.userAgent,
              ipAddress: sessionDoc.ipAddress,
              when: new Date(),
            }).catch((e) => console.error("[logout] email failed:", e.message));
          }
        })
        .catch((e) => console.error("[logout] hospital lookup failed:", e.message));

      // FCM token is stored once on the Hospital doc and shared across
      // devices. Only wipe it if no other mobile session remains — otherwise
      // we'd silently disable push for the still-signed-in device.
      if (sessionDoc.isMobile && sessionDoc.hospitalId) {
        Session.countDocuments({
          hospitalId: sessionDoc.hospitalId,
          isMobile: true,
          isActive: true,
          expiresAt: { $gt: new Date() },
        })
          .then((remaining) => {
            if (remaining === 0) {
              return Hospital.findByIdAndUpdate(
                sessionDoc.hospitalId,
                { $unset: { fcmToken: "" } },
              );
            }
            return null;
          })
          .catch((e) => console.error("[logout] fcmToken cleanup failed:", e.message));
      }
    }

    // Always clear cookies + return 200 (idempotent).
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
    }).catch(() => { });

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

    const hospital = await lookupHospitalByIdentifier(identifier);
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

    // Store challenge in Redis with a 2-minute TTL (Upstash → in-memory fallback)
    await setBiometricChallenge(hospital._id, deviceId, challenge, 120);

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

    // Peek at the stored challenge — we only CONSUME it once the signature
    // verifies. If verification fails (transient biometric hiccup, wrong
    // signature), the client can retry within the 2-minute TTL instead of
    // having to go back to /challenge.
    const challenge = await peekBiometricChallenge(hospitalId, deviceId);
    if (!challenge) {
      return res.status(401).json({
        success: false,
        code: "CHALLENGE_EXPIRED",
        message: "Biometric challenge expired. Please try again.",
      });
    }

    // Find biometric key for device
    const biometricKey = (hospital.biometricKeys || []).find((k) => k.deviceId === deviceId);
    if (!biometricKey) {
      return res.status(401).json({
        success: false,
        code: "NO_BIOMETRIC_KEY",
        message: "Biometric not enrolled on this device",
      });
    }

    // Android sends the public key as base64-encoded DER (X.509 SubjectPublicKeyInfo),
    // which Node's crypto.verify() cannot parse without PEM framing. Wrap it on
    // the fly so existing stored keys keep working without a migration.
    let publicKeyPem;
    try {
      const raw = String(biometricKey.publicKey).trim();
      if (raw.includes("-----BEGIN")) {
        publicKeyPem = raw; // already PEM
      } else {
        // Import as DER then re-export as PEM — robust against stray whitespace/newlines.
        const derBuf = Buffer.from(raw.replace(/\s+/g, ""), "base64");
        const keyObject = crypto.createPublicKey({ key: derBuf, format: "der", type: "spki" });
        publicKeyPem = keyObject.export({ format: "pem", type: "spki" });
      }
    } catch (e) {
      console.error("[verifyBiometric] public key parse failed:", e.message);
      return res.status(401).json({
        success: false,
        code: "KEY_PARSE_FAILED",
        message: "Stored biometric key is invalid. Please re-enroll.",
      });
    }

    // Verify signature. Both sides sign/verify the UTF-8 bytes of the base64
    // challenge string — Android's challenge.toByteArray() and Node's
    // verifier.update(string) agree because the challenge is pure ASCII.
    let isValid = false;
    try {
      const verifier = crypto.createVerify("SHA256");
      verifier.update(challenge, "utf8");
      verifier.end();
      isValid = verifier.verify(publicKeyPem, signature, "base64");
    } catch (e) {
      console.error("[verifyBiometric] verify threw:", e.message);
      isValid = false;
    }

    if (!isValid) {
      console.warn(`[verifyBiometric] signature invalid for hospital=${hospitalId} device=${deviceId}`);
      // Do NOT consume the challenge — let the client retry within TTL.
      return res.status(401).json({
        success: false,
        code: "INVALID_SIGNATURE",
        message: "Invalid biometric signature",
      });
    }

    // Signature valid → consume the challenge (one-shot replay prevention).
    await consumeBiometricChallenge(hospitalId, deviceId);

    // Create session (biometric login bypasses the auth-code step)
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
    }).catch(() => { });

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
      maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year — long-lived refresh cookie; security gate is 7-day AuthCode re-verify
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

    const hospital = await lookupHospitalByIdentifier(identifier);
    if (!hospital) {
      // Don't reveal if user exists
      return res.status(200).json({ success: true, conflict: false });
    }

    // Admin accounts can have multiple sessions
    if (hospital.role === "admin") {
      return res.status(200).json({ success: true, conflict: false });
    }

    const isMobileLogin = String(req.headers["x-client-type"] || "")
      .toLowerCase()
      .includes("android");

    // Web sessions are currently multi-session by design.
    if (!isMobileLogin) {
      return res.status(200).json({ success: true, conflict: false });
    }

    // Keep this in sync with token.service.js createSession() logic.
    const MOBILE_SESSION_LIMIT = 2;

    const activeMobileSessions = await Session.find({
      hospitalId: hospital._id,
      isMobile: true,
      isActive: true,
      expiresAt: { $gt: new Date() },
    })
      .select("platform lastSeenAt lastSeenIp userAgent createdAt")
      .sort({ createdAt: 1 })
      .lean();

    // No conflict until this login would exceed mobile limit and revoke one.
    if (activeMobileSessions.length < MOBILE_SESSION_LIMIT) {
      return res.status(200).json({ success: true, conflict: false });
    }

    const activeDevice = activeMobileSessions[0];
    return res.status(200).json({
      success: true,
      conflict: true,
      activeDevice: {
        platform: activeDevice.platform || "unknown",
        lastSeen: activeDevice.lastSeenAt,
        ip: activeDevice.lastSeenIp,
      },
      sessionCount: activeMobileSessions.length,
      sessionLimit: MOBILE_SESSION_LIMIT,
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
 * List all active sessions for the current hospital.
 * GET /api/auth/session/list
 * Marks the caller's own session with isCurrent:true so the client can
 * render a "This device" badge and disable its own revoke button.
 */
export const listActiveSessions = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const currentSessionId = req.sessionId;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const sessions = await Session.find({
      hospitalId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    })
      .select("_id deviceId platform isMobile userAgent ipAddress lastSeenAt lastSeenIp location createdAt")
      .sort({ createdAt: -1 })
      .lean();

    // Lazy-backfill: older sessions created before location was added have
    // no displayName. Kick off a geo lookup for each missing one. Doesn't
    // block the current response — next list call will have them.
    for (const s of sessions) {
      if (!s.location || !s.location.displayName) {
        geolocateIp(s.ipAddress)
          .then((location) =>
            Session.updateOne({ _id: s._id }, { $set: { location } }),
          )
          .catch(() => {});
      }
    }

    const data = sessions.map((s) => ({
      id: String(s._id),
      _id: String(s._id),
      sessionKey: String(s._id).slice(-6).toUpperCase(),
      deviceId: s.deviceId || null,
      platform: s.platform || "unknown",
      isMobile: !!s.isMobile,
      userAgent: s.userAgent,
      ipAddress: s.ipAddress,
      lastSeenAt: s.lastSeenAt,
      lastSeenIp: s.lastSeenIp,
      location: s.location || null,
      createdAt: s.createdAt,
      isCurrent: currentSessionId && String(s._id) === String(currentSessionId),
    }));

    return res.status(200).json({ success: true, data, count: data.length });
  } catch (error) {
    console.error("List sessions error:", error);
    return res.status(500).json({ success: false, message: "Failed to list sessions" });
  }
};

/**
 * Revoke a specific session by id (the caller's own sessions only).
 * POST /api/auth/session/revoke/:id
 * Refuses to revoke the caller's current session — use /logout for that.
 */
export const revokeSessionById = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const currentSessionId = req.sessionId;
    const { id } = req.params;

    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });
    if (!id || !id.match(/^[a-f0-9]{24}$/i)) {
      return res.status(400).json({ success: false, message: "Invalid session id" });
    }
    if (String(id) === String(currentSessionId)) {
      return res.status(400).json({
        success: false,
        message: "Cannot revoke your current session. Use /logout instead.",
      });
    }

    // Capture the revoked session's UA before flipping it, so the email
    // can show the actual device that was signed out.
    const revokedDoc = await Session.findOne({ _id: id, hospitalId, isActive: true })
      .select("userAgent").lean();
    if (!revokedDoc) {
      return res.status(404).json({ success: false, message: "Session not found or already revoked" });
    }

    await Session.updateOne(
      { _id: id, hospitalId, isActive: true },
      { isActive: false, revokedReason: "ADMIN_REVOKE" },
    );

    notifySessionRevoked(hospitalId).catch(console.error);
    Hospital.findById(hospitalId).select("email").lean()
      .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
        oldDevice: revokedDoc.userAgent,
        newDevice: req.headers["user-agent"],
        reason: "ADMIN_REVOKE",
      }))
      .catch((e) => console.error("[Auth] session-revoked email failed:", e.message));

    return res.status(200).json({ success: true, message: "Session revoked" });
  } catch (error) {
    console.error("Revoke session error:", error);
    return res.status(500).json({ success: false, message: "Failed to revoke session" });
  }
};

/**
 * Revoke every session for the current hospital except the caller's own.
 * POST /api/auth/session/revoke-all-others
 */
export const revokeAllOtherSessions = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const currentSessionId = req.sessionId;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const result = await Session.updateMany(
      { hospitalId, isActive: true, _id: { $ne: currentSessionId } },
      { isActive: false, revokedReason: "ADMIN_REVOKE" },
    );

    if (result.modifiedCount > 0) {
      notifySessionRevoked(hospitalId).catch(console.error);
      Hospital.findById(hospitalId).select("email").lean()
        .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
          oldDevice: null,
          newDevice: req.headers["user-agent"],
          reason: "ADMIN_REVOKE",
        }))
        .catch((e) => console.error("[Auth] session-revoked email failed:", e.message));
    }

    return res.status(200).json({
      success: true,
      message: "Other sessions revoked",
      revokedCount: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("Revoke all others error:", error);
    return res.status(500).json({ success: false, message: "Failed to revoke sessions" });
  }
};

/**
 * Re-verify the 6-digit hospital Auth Code for a mobile session that has
 * passed the 7-day freshness window.
 *
 * POST /api/auth/session/reverify-auth-code
 *   Auth: valid access token (middleware allows this route through even
 *         when authCodeVerifiedAt is stale).
 *   Body: { authCode: "######" }
 *
 * On success, bumps session.authCodeVerifiedAt so the user stays logged in
 * for another 7 days without re-entering their password.
 */
export const reverifyAuthCode = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const sessionId = req.sessionId;
    const { authCode } = req.body || {};

    if (!hospitalId || !sessionId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    if (!authCode || !/^\d{6}$/.test(String(authCode))) {
      return res.status(400).json({
        success: false,
        message: "authCode must be a 6-digit string",
      });
    }

    const hospital = await Hospital.findById(hospitalId).select("authCode").lean();
    if (!hospital) {
      return res.status(404).json({ success: false, message: "Hospital not found" });
    }

    if (String(hospital.authCode) !== String(authCode)) {
      AuditLog.create({
        userId: hospitalId,
        action: "AUTH_CODE_REVERIFY_FAILED",
        status: "FAILURE",
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.headers["user-agent"],
        details: { sessionId: String(sessionId) },
      }).catch(() => { });
      return res.status(401).json({
        success: false,
        code: "INVALID_AUTH_CODE",
        message: "Invalid Auth Code. Please try again.",
      });
    }

    await Session.updateOne(
      { _id: sessionId, hospitalId, isActive: true },
      { authCodeVerifiedAt: new Date() },
    );

    AuditLog.create({
      userId: hospitalId,
      action: "AUTH_CODE_REVERIFIED",
      status: "SUCCESS",
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: { sessionId: String(sessionId) },
    }).catch(() => { });

    return res.status(200).json({
      success: true,
      message: "Auth Code re-verified. You're good for another 7 days.",
    });
  } catch (error) {
    console.error("reverifyAuthCode error:", error);
    return res.status(500).json({ success: false, message: "Re-verification failed" });
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

    // Fire-and-forget push + email notification for revoked sessions
    notifySessionRevoked(hospitalId).catch(console.error);
    Hospital.findById(hospitalId).select("email").lean()
      .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
        oldDevice: null,
        newDevice: req.headers["user-agent"],
        reason: "SESSION_CONFLICT",
      }))
      .catch((e) => console.error("[Auth] session-revoked email failed:", e.message));

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

// ═══════════════════════════════════════════════════════════════════════════
// FORGOT PASSWORD FLOW (public)
//
//  Step 1: POST /api/auth/forgot-password/init
//          → email/phone identifier → always 200 (no enumeration) → OTP via email
//  Step 2: POST /api/auth/forgot-password/verify
//          → identifier + otp → returns PASSWORD_RESET temp token (15-min TTL)
//  Step 3: POST /api/auth/forgot-password/reset
//          → Bearer temp token + newPassword → updates hash, revokes all
//            sessions, sends notice email.
//
//  Redis keys:   forgot_otp:{hospitalId}, forgot_last_sent:{hospitalId}
//  Token purpose: PASSWORD_RESET (15 min)
//  SMS is deferred — OTP is always delivered to the hospital's registered email,
//  even when the user enters a phone number.
// ═══════════════════════════════════════════════════════════════════════════

const FORGOT_OTP_TTL_SECONDS = 600;           // 10 minutes
const FORGOT_OTP_MAX_ATTEMPTS = 5;
const FORGOT_RESEND_COOLDOWN_SECONDS = 60;

/**
 * Resolve an identifier (email or phone) to a Hospital, or null.
 * Mirrors the identifier-parsing rules used by the login controller.
 */
async function lookupHospitalByIdentifier(identifier) {
  const loginId = String(identifier || "").trim();
  if (!loginId) return null;

  let query;
  if (loginId.includes("@")) {
    query = { email: loginId.toLowerCase() };
  } else if (/^\+?\d{7,15}$/.test(loginId.replace(/[\s\-()]/g, ""))) {
    const phoneClean = loginId.replace(/[^\d+]/g, "");
    const phoneDigitsOnly = phoneClean.replace(/[^\d]/g, "");
    let normalizedPhone = phoneClean;
    if (phoneDigitsOnly.length === 10) normalizedPhone = `+91${phoneDigitsOnly}`;
    else if (phoneDigitsOnly.length === 12 && phoneDigitsOnly.startsWith("91")) normalizedPhone = `+${phoneDigitsOnly}`;
    query = { phone: normalizedPhone };
  } else {
    return null;
  }

  try {
    return await Hospital.findOne(query);
  } catch (e) {
    console.error("[forgotPassword] DB find error:", e.message);
    return null;
  }
}

/**
 * POST /api/auth/forgot-password/init
 * Body: { identifier }  (email or phone)
 *
 * Always returns a generic success payload to prevent account enumeration.
 * If the identifier resolves to a real hospital we issue a fresh OTP and email
 * it. Wrong identifiers silently no-op (but still pretend to work).
 */
export const forgotPasswordInit = async (req, res) => {
  try {
    const { identifier } = req.body;
    if (!identifier) {
      return res.status(400).json({ success: false, message: "Identifier is required" });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const hospital = await lookupHospitalByIdentifier(identifier);

    // Enumeration-safe generic response
    const genericOk = {
      success: true,
      message: "If that account exists, we've sent a reset code to the registered email.",
      data: {
        otpExpiresInSeconds: FORGOT_OTP_TTL_SECONDS,
        resendAvailableInSeconds: FORGOT_RESEND_COOLDOWN_SECONDS,
      },
    };

    if (!hospital || !hospital.isActive) {
      try {
        await AuditLog.create({
          action: "PASSWORD_RESET_INIT",
          status: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { identifier: String(identifier), failureReason: hospital ? "inactive" : "not_found" },
        });
      } catch (e) {
        console.error("AuditLog error (forgot init miss):", e);
      }
      return res.status(200).json(genericOk);
    }

    // Enforce 60-second resend cooldown (keyed by hospitalId so attackers
    // can't reset the clock by switching between email/phone).
    const lastSentTs = await getForgotPasswordLastSent(hospital._id.toString());
    if (lastSentTs) {
      const remainingSec = Math.ceil((FORGOT_RESEND_COOLDOWN_SECONDS * 1000 - (Date.now() - lastSentTs)) / 1000);
      if (remainingSec > 0) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${remainingSec} second(s) before requesting another code.`,
          data: { retryAfterSeconds: remainingSec },
        });
      }
    }

    const otp = generateOtp();
    await setForgotPasswordOtp(hospital._id.toString(), otp, FORGOT_OTP_TTL_SECONDS);
    await setForgotPasswordLastSent(hospital._id.toString(), FORGOT_RESEND_COOLDOWN_SECONDS);

    try {
      await sendForgotPasswordOtpEmail(hospital.email, otp);
      console.log(`✅ Forgot-password OTP sent to: ${hospital.email}`);
    } catch (mailErr) {
      console.error("❌ Forgot-password OTP email failed:", mailErr.message);
      // Don't leak failure — OTP is still in Redis for dev
    }

    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_RESET_INIT",
        status: "SUCCESS",
        ipAddress,
        userAgent,
      });
    } catch (e) {
      console.error("AuditLog error (forgot init):", e);
    }

    return res.status(200).json(genericOk);
  } catch (error) {
    console.error("[forgotPasswordInit] error:", error);
    return res.status(500).json({ success: false, message: "Unable to process request. Please try again later." });
  }
};

/**
 * POST /api/auth/forgot-password/verify
 * Body: { identifier, otp }
 *
 * Verifies the OTP (5-attempt limit) and, on success, issues a 15-minute
 * temp token bearing purpose=PASSWORD_RESET which the client uses for the
 * reset step.
 */
export const forgotPasswordVerify = async (req, res) => {
  try {
    const { identifier, otp } = req.body;
    if (!identifier || !otp) {
      return res.status(400).json({ success: false, message: "Identifier and OTP are required" });
    }
    if (!/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];

    const hospital = await lookupHospitalByIdentifier(identifier);
    if (!hospital) {
      // Generic miss — same error shape whether the OTP is wrong or the
      // identifier doesn't exist, to avoid enumeration.
      return res.status(400).json({ success: false, message: "Invalid or expired code." });
    }

    const result = await verifyForgotPasswordOtp(hospital._id.toString(), String(otp), FORGOT_OTP_MAX_ATTEMPTS);

    if (!result.valid) {
      try {
        await AuditLog.create({
          userId: hospital._id,
          action: "PASSWORD_RESET_FAILED",
          status: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { failureReason: result.expired ? "expired" : "invalid_otp" },
        });
      } catch (e) {
        console.error("AuditLog error (forgot verify fail):", e);
      }

      if (result.expired) {
        return res.status(410).json({ success: false, message: "Code expired or not found. Please request a new one." });
      }
      if (result.attemptsLeft === 0) {
        return res.status(400).json({ success: false, message: "Too many incorrect attempts. Please request a new code." });
      }
      return res.status(400).json({
        success: false,
        message: `Invalid code. ${result.attemptsLeft} attempt(s) remaining.`,
        data: { attemptsLeft: result.attemptsLeft },
      });
    }

    const tempToken = generateTempToken(hospital._id.toString(), "PASSWORD_RESET");

    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_RESET_VERIFIED",
        status: "SUCCESS",
        ipAddress,
        userAgent,
      });
    } catch (e) {
      console.error("AuditLog error (forgot verify):", e);
    }

    return res.status(200).json({
      success: true,
      message: "Code verified. You may now set a new password.",
      data: {
        tempToken,
        expiresInSeconds: 15 * 60,
      },
    });
  } catch (error) {
    console.error("[forgotPasswordVerify] error:", error);
    return res.status(500).json({ success: false, message: "Unable to verify code. Please try again later." });
  }
};

/**
 * POST /api/auth/forgot-password/reset
 * Headers: Authorization: Bearer <PASSWORD_RESET temp token>
 * Body:    { newPassword }
 *
 * Sets a new password, revokes ALL sessions on the account, clears any
 * residual OTP, and emails a security notice. The temp token is single-use
 * in practice because the reset itself invalidates the session landscape —
 * but we do not explicitly blacklist it (matches existing PASSWORD_CHANGE
 * pattern used on first login).
 */
export const forgotPasswordReset = async (req, res) => {
  try {
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return res.status(401).json({ success: false, message: "No token provided" });
    }

    let decoded;
    try {
      decoded = verifyToken(token);
    } catch (e) {
      return res.status(401).json({ success: false, message: e.message });
    }
    if (decoded.type !== "temp" || decoded.purpose !== "PASSWORD_RESET") {
      return res.status(401).json({ success: false, message: "Invalid token for password reset" });
    }

    const { newPassword } = req.body;
    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) {
      return res.status(400).json({ success: false, message: pwErr });
    }

    const hospital = await Hospital.findById(decoded.id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: "Hospital not found" });
    }

    // Don't let the user "reset" to the same password they already had —
    // this is a cheap sanity check, not a full history policy.
    const sameAsCurrent = await comparePassword(newPassword, hospital.passwordHash);
    if (sameAsCurrent) {
      return res.status(400).json({ success: false, message: "New password must be different from the current password" });
    }

    hospital.passwordHash = await hashPassword(newPassword);
    hospital.mustChangePassword = false;
    hospital.failedLoginAttempts = 0;
    hospital.lockUntil = undefined;
    await hospital.save();

    // Revoke every session — a password reset is a trust-reset event.
    try {
      await invalidateAllSessions(hospital._id);
      notifySessionRevoked(hospital._id).catch((e) => console.error("[forgotPasswordReset] push notify failed:", e.message));
    } catch (e) {
      console.error("[forgotPasswordReset] session invalidation failed:", e.message);
    }

    // Best-effort cleanup of any stale OTP material.
    await deleteForgotPasswordOtp(hospital._id.toString());

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers["user-agent"];
    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_RESET_COMPLETED",
        status: "SUCCESS",
        ipAddress,
        userAgent,
      });
    } catch (e) {
      console.error("AuditLog error (forgot reset):", e);
    }

    sendPasswordResetNoticeEmail(hospital.email, "reset").catch((e) =>
      console.error("[forgotPasswordReset] notice email failed:", e.message),
    );

    return res.status(200).json({
      success: true,
      message: "Password reset successfully. Please sign in with your new password.",
    });
  } catch (error) {
    console.error("[forgotPasswordReset] error:", error);
    return res.status(500).json({ success: false, message: "Password reset failed. Please try again later." });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS-BASED CHANGE PASSWORD (authenticated)
//
//   POST /api/auth/password/change
//   Auth:  verifyAccessToken (session must be live)
//   Body:  { currentPassword, newPassword }
//
// Differs from the existing /change-password route (first-login flow) in that
// this one requires a live session + current password, and leaves the caller's
// session intact while revoking every OTHER session on the account.
// ═══════════════════════════════════════════════════════════════════════════

export const changePasswordSettings = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const currentSessionId = req.sessionId;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "Current and new passwords are required" });
    }

    const pwErr = validatePasswordStrength(newPassword);
    if (pwErr) return res.status(400).json({ success: false, message: pwErr });

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    const ok = await comparePassword(currentPassword, hospital.passwordHash);
    if (!ok) {
      try {
        await AuditLog.create({
          userId: hospital._id,
          action: "PASSWORD_CHANGE_FAILED",
          status: "FAILURE",
          ipAddress,
          userAgent,
          metadata: { failureReason: "invalid_current_password" },
        });
      } catch (e) {
        console.error("AuditLog error (pw change fail):", e);
      }
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    if (currentPassword === newPassword) {
      return res.status(400).json({ success: false, message: "New password must be different from current password" });
    }

    hospital.passwordHash = await hashPassword(newPassword);
    hospital.mustChangePassword = false;
    await hospital.save();

    // Revoke every other session — the user effectively re-establishes trust.
    try {
      await Session.updateMany(
        { hospitalId, isActive: true, _id: { $ne: currentSessionId } },
        { isActive: false, revokedReason: "ADMIN_REVOKE" },
      );
      notifySessionRevoked(hospitalId).catch((e) => console.error("[changePasswordSettings] push failed:", e.message));
    } catch (e) {
      console.error("[changePasswordSettings] revoke others failed:", e.message);
    }

    try {
      await AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_CHANGED",
        status: "SUCCESS",
        ipAddress,
        userAgent,
      });
    } catch (e) {
      console.error("AuditLog error (pw change):", e);
    }

    sendPasswordResetNoticeEmail(hospital.email, "changed").catch((e) =>
      console.error("[changePasswordSettings] notice email failed:", e.message),
    );

    // B6 — security-alert email + push, gated by notificationPrefs.securityAlerts
    const wantsAlerts = !hospital.notificationPrefs || hospital.notificationPrefs.securityAlerts !== false;
    if (wantsAlerts) {
      sendPasswordChangedEmail(hospital.email, { ipAddress, when: new Date() })
        .catch((e) => console.error("[changePasswordSettings] alert email failed:", e.message));
      notifyPasswordChanged(hospitalId).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Password changed successfully. Other sessions have been signed out.",
    });
  } catch (error) {
    console.error("[changePasswordSettings] error:", error);
    return res.status(500).json({ success: false, message: "Password change failed. Please try again later." });
  }
};

export default {
  changePassword,
  registerHospital,
  registerSelfService,
  verifyRegistrationOtp,
  resendRegistrationOtp,
  login,
  verifyAuthCodeLogin,
  refreshToken,
  logout,
  registerBiometric,
  biometricChallenge,
  verifyBiometric,
  checkSessionConflict,
  validateSession,
  forceLogoutOtherSessions,
  listActiveSessions,
  revokeSessionById,
  revokeAllOtherSessions,
  reverifyAuthCode,
  storeFcmToken,
  forgotPasswordInit,
  forgotPasswordVerify,
  forgotPasswordReset,
  changePasswordSettings,
};
