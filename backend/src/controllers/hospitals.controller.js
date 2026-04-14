/**
 * Hospitals Controller
 * Handles hospital management operations
 */

import crypto from "crypto";
import Hospital from "../models/Hospital.js";
import AuditLog from "../models/AuditLog.js";
import { hashPassword } from "../utils/hash.js";
import { sendWelcomeEmail, sendOTPEmail, sendContactChangedNoticeEmail, sendDeletionRequestEmail } from "../services/mail.service.js";
import { notifyAdminsOfDeletionRequest } from "../services/push.service.js";
import {
  setContactChangeRequest,
  verifyContactChangeOtp,
  deleteContactChangeRequest,
} from "../services/redis.service.js";

/**
 * Get all hospitals
 * GET /api/hospitals
 */
export const getAllHospitals = async (req, res) => {
  try {
    const hospitals = await Hospital.find().select("-passwordHash -fcmToken -biometricKeys -failedLoginAttempts -lockUntil -__v").sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      data: hospitals,
      count: hospitals.length,
    });
  } catch (error) {
    console.error("Get hospitals error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospitals",
    });
  }
};

/**
 * Get current authenticated hospital
 * GET /api/hospitals/me
 */
export const getCurrentHospital = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const hospital = await Hospital.findById(hospitalId).select("-passwordHash -failedLoginAttempts -lockUntil -__v");

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Get current hospital error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospital",
    });
  }
};

/**
 * Get hospital by ID
 * GET /api/hospitals/:id
 */
export const getHospitalById = async (req, res) => {
  try {
    const { id } = req.params;

    const hospital = await Hospital.findById(id).select("-passwordHash -failedLoginAttempts -lockUntil -__v");

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: hospital,
    });
  } catch (error) {
    console.error("Get hospital error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch hospital",
    });
  }
};

/**
 * Update hospital details
 * PUT /api/hospitals/:id
 * Authorization: verifyAdminOrSelf middleware ensures only admin or the hospital itself can update
 */
export const updateHospital = async (req, res) => {
  try {
    const { id } = req.params;
    const { hospitalName, email, phone, address, isActive } = req.body;

    // Validate inputs
    if (!hospitalName || !email || !phone || !address) {
      return res.status(400).json({
        success: false,
        message: "All fields are required",
      });
    }

    // Normalize phone: strip formatting, prepend +91 if bare 10 digits
    const phoneDigits = phone.replace(/[^\d]/g, "");
    let normalizedPhone;
    if (phoneDigits.length === 10) {
      normalizedPhone = `+91${phoneDigits}`;
    } else if (phone.startsWith("+") && phoneDigits.length === 12 && phoneDigits.startsWith("91")) {
      normalizedPhone = `+${phoneDigits}`;
    } else {
      return res.status(400).json({
        success: false,
        message: "Phone number must be 10 digits",
      });
    }

    // Check if hospital exists
    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    // Check if email is already taken by another hospital
    if (email !== hospital.email) {
      const existingHospital = await Hospital.findOne({
        email: email.toLowerCase(),
        _id: { $ne: id },
      });
      if (existingHospital) {
        return res.status(409).json({
          success: false,
          message: "This email is already registered by another hospital",
        });
      }
    }

    // Check if phone is already taken by another hospital
    if (normalizedPhone !== hospital.phone) {
      const existingPhone = await Hospital.findOne({
        phone: normalizedPhone,
        _id: { $ne: id },
      });
      if (existingPhone) {
        return res.status(409).json({
          success: false,
          message: "This phone number is already registered by another hospital",
        });
      }
    }

    // Update hospital
    hospital.hospitalName = hospitalName;
    hospital.email = email.toLowerCase();
    hospital.phone = normalizedPhone;
    hospital.address = address;

    // Only admins can change isActive status
    if (!req.isSelf && isActive !== undefined) {
      hospital.isActive = isActive;
    }

    // Handle logo upload if provided
    if (req.file) {
      const base64Logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      hospital.logoUrl = base64Logo;
    }

    await hospital.save();

    return res.status(200).json({
      success: true,
      message: "Hospital updated successfully",
      data: hospital,
    });
  } catch (error) {
    console.error("Update hospital error:", error);

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      let message = "This information is already registered";

      if (field === "email") {
        message = "This email address is already registered by another hospital";
      } else if (field === "phone") {
        message = "This phone number is already registered by another hospital";
      }

      return res.status(409).json({
        success: false,
        message,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to update hospital",
    });
  }
};

/**
 * Resend welcome email to an admin-created hospital that has not yet changed
 * its temporary password. Regenerates the temp password (since the original
 * was never stored in plaintext), persists the new hash, and emails it along
 * with the existing authCode.
 *
 * POST /api/hospitals/:id/resend-welcome    (admin only)
 *
 * Returns 409 once the hospital has changed its password — the admin no longer
 * owns that secret, and resending would overwrite the user's own password.
 */
const resendCooldownSecondsByHospital = new Map(); // in-memory 60s cooldown

export const resendWelcomeEmail = async (req, res) => {
  try {
    const { id } = req.params;

    const hospital = await Hospital.findById(id);
    if (!hospital) {
      return res.status(404).json({ success: false, message: "Hospital not found" });
    }

    // Gate: once the hospital has changed their password, the admin can no
    // longer resend — doing so would reset the user's chosen password.
    if (!hospital.mustChangePassword) {
      return res.status(409).json({
        success: false,
        message: "Hospital has already changed its password. Resend is no longer available.",
      });
    }

    // Simple 60-second per-hospital cooldown to prevent email spam.
    const lastAt = resendCooldownSecondsByHospital.get(id);
    if (lastAt && Date.now() - lastAt < 60_000) {
      const retryAfter = Math.ceil((60_000 - (Date.now() - lastAt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Please wait ${retryAfter} second(s) before resending.`,
        data: { retryAfterSeconds: retryAfter },
      });
    }

    // Generate a fresh temp password (same alphabet/rules as initial admin register).
    const generate = () => {
      const U = "ABCDEFGHJKLMNPQRSTUVWXYZ";
      const L = "abcdefghijkmnopqrstuvwxyz";
      const D = "23456789";
      const S = "!@#$%^&*";
      const all = U + L + D + S;
      let p = U[crypto.randomInt(0, U.length)] + L[crypto.randomInt(0, L.length)]
        + D[crypto.randomInt(0, D.length)] + S[crypto.randomInt(0, S.length)];
      for (let i = 4; i < 12; i++) p += all[crypto.randomInt(0, all.length)];
      const arr = p.split("");
      for (let i = arr.length - 1; i > 0; i--) {
        const j = crypto.randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr.join("");
    };
    const newTempPassword = generate();

    hospital.passwordHash = await hashPassword(newTempPassword);
    hospital.failedLoginAttempts = 0;
    hospital.lockUntil = undefined;
    await hospital.save();

    resendCooldownSecondsByHospital.set(id, Date.now());

    try {
      await sendWelcomeEmail(
        hospital.email,
        hospital.hospitalName,
        hospital.email,
        newTempPassword,
        hospital.authCode,
      );
    } catch (mailErr) {
      console.error("[resendWelcomeEmail] mail send failed:", mailErr.message);
      return res.status(502).json({
        success: false,
        message: "Hospital password was reset but the email could not be delivered. Please try again.",
      });
    }

    AuditLog.create({
      userId: req.hospital?.id,
      action: "HOSPITAL_RESEND_WELCOME",
      status: "SUCCESS",
      ipAddress: req.ip || req.connection?.remoteAddress,
      userAgent: req.headers["user-agent"],
      details: { targetHospitalId: id, targetEmail: hospital.email },
    }).catch((e) => console.error("[AuditLog] resendWelcome:", e.message));

    return res.status(200).json({
      success: true,
      message: "Welcome email resent with a new temporary password.",
    });
  } catch (error) {
    console.error("[resendWelcomeEmail] error:", error);
    return res.status(500).json({ success: false, message: "Failed to resend welcome email" });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// Profile management: PATCH /me + OTP-gated contact change
// ═══════════════════════════════════════════════════════════════════════════

const CONTACT_OTP_TTL_SECONDS = 600;
const CONTACT_OTP_MAX_ATTEMPTS = 5;

function generateOtp6() {
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
}

function normalizeIndianPhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d]/g, "");
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
  return null;
}

/**
 * PATCH /api/hospitals/me
 * Non-sensitive profile updates only: hospitalName, address, logo.
 * Email/phone are handled via the OTP-gated contact-change flow below.
 */
export const patchMe = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    const { hospitalName, address } = req.body || {};
    const changes = {};

    if (typeof hospitalName === "string" && hospitalName.trim()) {
      if (hospitalName.trim().length < 3) {
        return res.status(400).json({ success: false, message: "Hospital name must be at least 3 characters" });
      }
      hospital.hospitalName = hospitalName.trim();
      changes.hospitalName = hospital.hospitalName;
    }

    if (typeof address === "string") {
      hospital.address = address.trim();
      changes.address = hospital.address;
    }

    if (req.file) {
      hospital.logoUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      changes.logoUrl = true;
    }

    if (Object.keys(changes).length === 0) {
      return res.status(400).json({ success: false, message: "No valid fields to update" });
    }

    await hospital.save();

    AuditLog.create({
      userId: hospital._id,
      action: "PROFILE_PATCHED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: changes,
    }).catch((e) => console.error("AuditLog error (profile patch):", e));

    return res.status(200).json({ success: true, message: "Profile updated", data: hospital });
  } catch (error) {
    console.error("[patchMe] error:", error);
    return res.status(500).json({ success: false, message: "Failed to update profile" });
  }
};

/**
 * POST /api/hospitals/me/change-contact/init
 * Body: { newEmail } OR { newPhone }   (exactly one)
 *
 * Validates format + uniqueness, stores the pending change in Redis, and
 * emails a 6-digit OTP to the hospital's CURRENT email address (proof of
 * account control). SMS is deferred — phone changes still OTP via email.
 */
export const initContactChange = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { newEmail, newPhone } = req.body || {};
    if (!newEmail === !newPhone) {
      return res.status(400).json({ success: false, message: "Provide exactly one of newEmail or newPhone" });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    let field, newValue;

    if (newEmail) {
      const normalized = String(newEmail).toLowerCase().trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
        return res.status(400).json({ success: false, message: "Invalid email format" });
      }
      if (normalized === hospital.email) {
        return res.status(400).json({ success: false, message: "New email is the same as current email" });
      }
      const taken = await Hospital.findOne({ email: normalized, _id: { $ne: hospitalId } }).select("_id").lean();
      if (taken) return res.status(409).json({ success: false, message: "This email is already in use" });
      field = "email";
      newValue = normalized;
    } else {
      const normalized = normalizeIndianPhone(newPhone);
      if (!normalized) {
        return res.status(400).json({ success: false, message: "Phone number must be 10 digits" });
      }
      if (normalized === hospital.phone) {
        return res.status(400).json({ success: false, message: "New phone is the same as current phone" });
      }
      const taken = await Hospital.findOne({ phone: normalized, _id: { $ne: hospitalId } }).select("_id").lean();
      if (taken) return res.status(409).json({ success: false, message: "This phone number is already in use" });
      field = "phone";
      newValue = normalized;
    }

    const otp = generateOtp6();
    await setContactChangeRequest(hospitalId, field, newValue, otp, CONTACT_OTP_TTL_SECONDS);

    // OTP delivery:
    //   • Email change → OTP is sent to the NEW email (proves the user
    //     controls the destination address — standard verification pattern).
    //   • Phone change → SMS is deferred, so the OTP falls back to the
    //     CURRENT email. This does NOT prove control of the new phone, but
    //     the session already proves account control; the unverified-phone
    //     gap is tracked under the SMS-provider work.
    const otpRecipient = field === "email" ? newValue : hospital.email;
    const otpChannel = field === "email" ? "new_email" : "current_email";
    try {
      await sendOTPEmail(otpRecipient, otp, "login");
    } catch (e) {
      console.error("[initContactChange] OTP email failed:", e.message);
    }

    AuditLog.create({
      userId: hospital._id,
      action: "CONTACT_CHANGE_INIT",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { field, otpChannel },
    }).catch((e) => console.error("AuditLog error (contact init):", e));

    const maskedRecipient = field === "email"
      ? newValue.replace(/(.{1,2}).*(@.*)/, "$1***$2")
      : hospital.email.replace(/(.{1,2}).*(@.*)/, "$1***$2");

    return res.status(200).json({
      success: true,
      message: field === "email"
        ? `OTP sent to the new email (${maskedRecipient}). Verify to complete the change.`
        : `OTP sent to your registered email (${maskedRecipient}). Verify to complete the change.`,
      data: { field, otpChannel, otpExpiresInSeconds: CONTACT_OTP_TTL_SECONDS },
    });
  } catch (error) {
    console.error("[initContactChange] error:", error);
    return res.status(500).json({ success: false, message: "Failed to initiate contact change" });
  }
};

/**
 * POST /api/hospitals/me/change-contact/verify
 * Body: { otp }
 * Commits the pending email/phone change stashed by /init.
 */
export const verifyContactChange = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const ipAddress = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { otp } = req.body || {};
    if (!otp || !/^\d{6}$/.test(String(otp))) {
      return res.status(400).json({ success: false, message: "OTP must be 6 digits" });
    }

    const result = await verifyContactChangeOtp(hospitalId, String(otp), CONTACT_OTP_MAX_ATTEMPTS);
    if (!result.valid) {
      AuditLog.create({
        userId: hospitalId,
        action: "CONTACT_CHANGE_FAILED",
        status: "FAILURE",
        ipAddress,
        userAgent,
        metadata: { failureReason: result.expired ? "expired" : "invalid_otp" },
      }).catch(() => {});
      if (result.expired) {
        return res.status(410).json({ success: false, message: "OTP expired or not found. Please start over." });
      }
      if (result.attemptsLeft === 0) {
        return res.status(400).json({ success: false, message: "Too many incorrect attempts. Please request a new OTP." });
      }
      return res.status(400).json({
        success: false,
        message: `Invalid OTP. ${result.attemptsLeft} attempt(s) remaining.`,
        data: { attemptsLeft: result.attemptsLeft },
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    const { field, newValue } = result.request;

    // Re-check uniqueness at commit time — another hospital may have claimed
    // the value during the OTP window.
    const collisionQuery = field === "email" ? { email: newValue } : { phone: newValue };
    const collision = await Hospital.findOne({ ...collisionQuery, _id: { $ne: hospitalId } }).select("_id").lean();
    if (collision) {
      await deleteContactChangeRequest(hospitalId);
      return res.status(409).json({
        success: false,
        message: `This ${field} is already in use. Please start over.`,
      });
    }

    const oldValue = hospital[field];
    hospital[field] = newValue;
    await hospital.save();

    AuditLog.create({
      userId: hospital._id,
      action: "CONTACT_CHANGED",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { field, oldValue, newValue },
    }).catch((e) => console.error("AuditLog error (contact changed):", e));

    // Security notice emails (fire-and-forget):
    //   • Email change: notify BOTH the old and the new address so a
    //     compromise is visible from either end.
    //   • Phone change: only the current email is reachable (SMS deferred),
    //     so just one notice goes to that address.
    if (field === "email") {
      sendContactChangedNoticeEmail(oldValue, { field, oldValue, newValue, recipient: "old" })
        .catch((e) => console.error("[contactChanged] old-addr email failed:", e.message));
      sendContactChangedNoticeEmail(newValue, { field, oldValue, newValue, recipient: "new" })
        .catch((e) => console.error("[contactChanged] new-addr email failed:", e.message));
    } else {
      sendContactChangedNoticeEmail(hospital.email, { field, oldValue, newValue, recipient: "current" })
        .catch((e) => console.error("[contactChanged] current-email notice failed:", e.message));
    }

    return res.status(200).json({
      success: true,
      message: `${field === "email" ? "Email" : "Phone number"} updated successfully.`,
      data: hospital,
    });
  } catch (error) {
    console.error("[verifyContactChange] error:", error);
    return res.status(500).json({ success: false, message: "Failed to verify contact change" });
  }
};

// ═══════════════════════════════════════════════════
// B6 — Notification Preferences
// ═══════════════════════════════════════════════════

const DEFAULT_NOTIFICATION_PREFS = {
  newLoginAlert: true,
  deletionUpdates: true,
  securityAlerts: true,
  marketing: false,
};

/** Merge any stored prefs over defaults so UI always sees a full object. */
function normalizePrefs(stored) {
  return { ...DEFAULT_NOTIFICATION_PREFS, ...(stored || {}) };
}

/** GET /api/hospitals/me/notification-preferences */
export const getNotificationPreferences = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const hospital = await Hospital.findById(hospitalId).select("notificationPrefs").lean();
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    return res.json({ success: true, data: normalizePrefs(hospital.notificationPrefs) });
  } catch (err) {
    console.error("[getNotificationPreferences] error:", err);
    return res.status(500).json({ success: false, message: "Failed to load preferences" });
  }
};

/** PUT /api/hospitals/me/notification-preferences */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) return res.status(401).json({ success: false, message: "Unauthorized" });

    // Only accept known boolean keys — silently drop anything else.
    const allowed = ["newLoginAlert", "deletionUpdates", "securityAlerts", "marketing"];
    const set = {};
    for (const k of allowed) {
      if (typeof req.body?.[k] === "boolean") {
        set[`notificationPrefs.${k}`] = req.body[k];
      }
    }
    if (Object.keys(set).length === 0) {
      return res.status(400).json({ success: false, message: "No valid preferences to update" });
    }

    // Use findByIdAndUpdate with dotted paths so we only touch the prefs
    // subtree — avoids re-running the full Hospital schema validators
    // (email/phone regexes) on every toggle.
    const updated = await Hospital.findByIdAndUpdate(
      hospitalId,
      { $set: set },
      { new: true, runValidators: false },
    ).select("notificationPrefs").lean();

    if (!updated) return res.status(404).json({ success: false, message: "Hospital not found" });

    AuditLog.create({
      userId: hospitalId,
      action: "PROFILE_PATCHED",
      status: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { notificationPrefs: set },
    }).catch(() => {});

    return res.json({ success: true, data: normalizePrefs(updated.notificationPrefs) });
  } catch (err) {
    console.error("[updateNotificationPreferences] error:", err);
    return res.status(500).json({ success: false, message: "Failed to update preferences" });
  }
};

// ═══════════════════════════════════════════════════
// B2 — Account Deletion Workflow
// ═══════════════════════════════════════════════════

const GRACE_DAYS = parseInt(process.env.ACCOUNT_DELETION_GRACE_DAYS || "30", 10);

/** POST /api/hospitals/me/account/deletion-request — user-initiated */
export const requestAccountDeletion = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const { password, reason } = req.body || {};

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });
    if (hospital.role === "admin") {
      return res.status(403).json({ success: false, message: "Admin accounts cannot self-delete" });
    }
    if (hospital.deletionStatus && hospital.deletionStatus !== "active") {
      return res.status(409).json({ success: false, message: "Deletion request already pending" });
    }
    if (!password) {
      return res.status(400).json({ success: false, message: "Password is required" });
    }

    const ok = await hospital.matchPassword(password);
    if (!ok) {
      AuditLog.create({
        userId: hospital._id,
        action: "PASSWORD_CHANGE_FAILED",
        status: "FAILURE",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        details: { context: "account_deletion_request" },
      }).catch(() => {});
      return res.status(401).json({ success: false, message: "Invalid password" });
    }

    hospital.deletionStatus = "deletion_pending";
    hospital.deletionRequestedAt = new Date();
    hospital.deletionScheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 60 * 60 * 1000);
    hospital.deletionReason = (reason || "").toString().slice(0, 1000);
    hospital.deletionRejectedReason = null;
    hospital.deletionApprovedBy = null;
    hospital.deletionApprovedAt = null;
    await hospital.save();

    AuditLog.create({
      userId: hospital._id,
      action: "PROFILE_PATCHED",
      status: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { action: "account_deletion_requested", scheduledFor: hospital.deletionScheduledFor },
    }).catch(() => {});

    // Notify admins who opted-in (notificationPrefs.deletionUpdates) via
    // email + FCM push. Fire and forget — request succeeds even if
    // email/push transport is down.
    (async () => {
      try {
        const admins = await Hospital.find({
          role: "admin",
          isActive: true,
          "notificationPrefs.deletionUpdates": { $ne: false },
        }).select("email").lean();
        for (const a of admins) {
          if (a.email) {
            sendDeletionRequestEmail(a.email, {
              hospitalName: hospital.hospitalName,
              email: hospital.email,
              reason: hospital.deletionReason,
              when: hospital.deletionRequestedAt,
              scheduledFor: hospital.deletionScheduledFor,
            }).catch((e) => console.error("[deletion admin email]", e.message));
          }
        }
      } catch (e) { console.error("[deletion admin notify]", e.message); }
      notifyAdminsOfDeletionRequest(hospital.hospitalName).catch((e) =>
        console.error("[deletion admin push]", e.message),
      );
    })();

    return res.json({
      success: true,
      data: {
        deletionStatus: hospital.deletionStatus,
        deletionRequestedAt: hospital.deletionRequestedAt,
        deletionScheduledFor: hospital.deletionScheduledFor,
        graceDays: GRACE_DAYS,
      },
    });
  } catch (err) {
    console.error("[requestAccountDeletion] error:", err);
    return res.status(500).json({ success: false, message: "Failed to request deletion" });
  }
};

/** POST /api/hospitals/me/account/deletion-cancel — user-initiated within grace window */
export const cancelAccountDeletion = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });
    if (hospital.deletionStatus !== "deletion_pending") {
      return res.status(409).json({ success: false, message: "No pending deletion to cancel" });
    }
    hospital.deletionStatus = "active";
    hospital.deletionRequestedAt = null;
    hospital.deletionScheduledFor = null;
    hospital.deletionReason = null;
    await hospital.save();

    AuditLog.create({
      userId: hospital._id,
      action: "PROFILE_PATCHED",
      status: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { action: "account_deletion_cancelled" },
    }).catch(() => {});

    return res.json({ success: true, data: { deletionStatus: "active" } });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to cancel deletion" });
  }
};

/** GET /api/hospitals/deletion-requests — admin */
export const listDeletionRequests = async (_req, res) => {
  try {
    const items = await Hospital.find({ deletionStatus: "deletion_pending" })
      .select("hospitalName email phone deletionStatus deletionRequestedAt deletionScheduledFor deletionReason createdAt")
      .sort({ deletionRequestedAt: -1 })
      .lean();
    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to list deletion requests" });
  }
};

/** POST /api/hospitals/:id/deletion/approve — admin; soft-delete (retains audit log) */
export const approveDeletion = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.hospital?.id;
    const hospital = await Hospital.findById(id);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });
    if (hospital.deletionStatus !== "deletion_pending") {
      return res.status(409).json({ success: false, message: "No pending deletion for this hospital" });
    }

    // Revoke all sessions for this hospital
    try {
      const Session = (await import("../models/Session.js")).default;
      await Session.updateMany(
        { hospitalId: hospital._id, isActive: true },
        { $set: { isActive: false, revokedReason: "ACCOUNT_DELETED" } },
      );
    } catch (e) { console.error("[approveDeletion] session revoke failed:", e.message); }

    // Soft-delete: preserve audit log via ObjectId; scrub PII.
    // Scrubbed values must still satisfy Hospital schema validators:
    //   email regex:  \w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+
    //   phone regex:  ^\+?[1-9]\d{1,14}$   (max 15 digits; first digit 1-9)
    hospital.deletionStatus = "deleted";
    hospital.deletedAt = new Date();
    hospital.deletionApprovedBy = adminId;
    hospital.deletionApprovedAt = new Date();
    hospital.isActive = false;

    const idHex = String(hospital._id);
    // Hex-only local part + TLD of 3 chars keeps the email regex happy.
    hospital.email = `deleted-${idHex}@del.dev`;
    // Phone: 15 digits max, first must be 1-9. Build "9" + 14 digits derived
    // from the ObjectId (hex → digits only, left-padded) so each scrubbed
    // record still satisfies the unique index.
    const digits = idHex.replace(/\D/g, "").padStart(14, "0").slice(-14);
    hospital.phone = `+9${digits}`;
    hospital.hospitalName = `[DELETED ${idHex.slice(-8)}]`;
    hospital.passwordHash = "deleted";
    hospital.fcmToken = undefined;
    hospital.biometricKeys = [];
    // Bypass validators on save as a belt-and-braces — deletion paths should
    // not be blocked by stricter future schema changes.
    await hospital.save({ validateBeforeSave: false });

    AuditLog.create({
      userId: hospital._id,
      action: "AUTO_DELETE",
      status: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { approvedBy: adminId, type: "admin_approved_deletion" },
    }).catch(() => {});

    return res.json({ success: true, message: "Hospital deleted" });
  } catch (err) {
    console.error("[approveDeletion] error:", err);
    return res.status(500).json({ success: false, message: "Failed to approve deletion" });
  }
};

/** POST /api/hospitals/:id/deletion/reject — admin */
export const rejectDeletion = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.hospital?.id;
    const { reason } = req.body || {};
    const hospital = await Hospital.findById(id);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });
    if (hospital.deletionStatus !== "deletion_pending") {
      return res.status(409).json({ success: false, message: "No pending deletion for this hospital" });
    }

    hospital.deletionStatus = "active";
    hospital.deletionRejectedReason = (reason || "").toString().slice(0, 1000);
    hospital.deletionApprovedBy = adminId;
    hospital.deletionApprovedAt = new Date();
    hospital.deletionRequestedAt = null;
    hospital.deletionScheduledFor = null;
    await hospital.save();

    AuditLog.create({
      userId: hospital._id,
      action: "PROFILE_PATCHED",
      status: "SUCCESS",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      details: { action: "deletion_rejected_by_admin", adminId, reason: hospital.deletionRejectedReason },
    }).catch(() => {});

    return res.json({ success: true, message: "Deletion request rejected" });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Failed to reject deletion" });
  }
};

export default {
  getAllHospitals,
  getCurrentHospital,
  getHospitalById,
  updateHospital,
  patchMe,
  initContactChange,
  verifyContactChange,
  getNotificationPreferences,
  updateNotificationPreferences,
  requestAccountDeletion,
  cancelAccountDeletion,
  listDeletionRequests,
  approveDeletion,
  rejectDeletion,
};
