/**
 * Hospitals Controller
 * Handles hospital management operations
 */

import crypto from "crypto";
import Hospital from "../models/Hospital.js";
import AuditLog from "../models/AuditLog.js";
import { hashPassword, comparePassword } from "../utils/hash.js";
import {
  sendWelcomeEmail,
  sendOTPEmail,
  sendContactChangedNoticeEmail,
  sendAccountDisabledEmail,
  sendAccountEnabledEmail,
  sendAccountDeletedEmail,
} from "../services/mail.service.js";
import {
  setContactChangeRequest,
  getContactChangeRequest,
  verifyContactChangeOtp,
  deleteContactChangeRequest,
} from "../services/redis.service.js";
import getClientIp from "../utils/clientIp.js";

/**
 * Get all hospitals (cursor-paginated, admin-only).
 *
 * Query params:
 *   ?limit=50        page size, capped at 100 (default 50)
 *   ?cursor=<_id>    _id of the last hospital from the previous page
 *   ?search=<str>    case-insensitive substring match against name / email /
 *                    phone / authCode (server-side — removes the old
 *                    in-memory filter in the admin UI)
 *
 * Sort: `_id` descending. ObjectIds are time-ordered so this matches the
 * previous `createdAt: -1` behaviour while giving a stable cursor field that
 * doesn't need a compound tie-breaker.
 *
 * First-page responses additionally include a `totals` block so the admin
 * dashboard's stat cards don't need a second request.
 *
 * GET /api/hospitals
 */
export const getAllHospitals = async (req, res) => {
  try {
    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 100)
      : 50;

    const cursor = typeof req.query.cursor === "string" ? req.query.cursor.trim() : "";
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";

    const query = {};

    if (cursor) {
      // Cursor validation: only pass Mongo ObjectIds; ignore garbage.
      if (/^[0-9a-fA-F]{24}$/.test(cursor)) {
        query._id = { $lt: cursor };
      }
    }

    if (search) {
      // Escape regex metachars so a search like "dr." doesn't blow up.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(escaped, "i");
      query.$or = [
        { hospitalName: rx },
        { email: rx },
        { phone: rx },
        { authCode: rx },
      ];
    }

    // Fetch one extra record to detect "more available" without a count query.
    const rows = await Hospital.find(query)
      .select("-passwordHash -fcmToken -biometricKeys -failedLoginAttempts -lockUntil -__v")
      .sort({ _id: -1 })
      .limit(limit + 1);

    const hasMore = rows.length > limit;
    const hospitals = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? String(hospitals[hospitals.length - 1]._id) : null;

    const response = {
      success: true,
      data: hospitals,
      count: hospitals.length,
      nextCursor,
      limit,
    };

    // Only compute + return totals on the unfiltered first page (no cursor and
    // no search). Totals are global and search-independent, so the frontend's
    // already-cached value from the initial mount stays valid across every
    // keystroke. This avoids 3 full-collection countDocuments per keystroke
    // and is the dominant fix for slow search UX.
    if (!cursor && !search) {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const [total, active, recentWeek] = await Promise.all([
        Hospital.countDocuments({}),
        Hospital.countDocuments({ isActive: true }),
        Hospital.countDocuments({ createdAt: { $gte: weekAgo } }),
      ]);
      response.totals = { total, active, recentWeek };
    }

    return res.status(200).json(response);
  } catch (error) {
    req.log.error({ event: "hospitals_list_error", err: error }, "Get hospitals error");
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
        errorCode: "TOKEN_INVALID",
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
    req.log.error({ event: "hospital_me_fetch_error", err: error }, "Get current hospital error");
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
    req.log.error({ event: "hospital_fetch_error", err: error }, "Get hospital error");
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

    // Validate inputs (address is optional)
    if (!hospitalName || !email || !phone) {
      return res.status(400).json({
        success: false,
        message: "Hospital name, email, and phone are required",
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

    // Snapshot pre-change values so the audit log can record a diff.
    const preChange = {
      hospitalName: hospital.hospitalName,
      email: hospital.email,
      phone: hospital.phone,
      address: hospital.address,
      isActive: hospital.isActive,
    };

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
    if (address !== undefined) hospital.address = address;

    // Only admins can change isActive status
    const wasActive = hospital.isActive;
    let activeTransition = null; // "disabled" | "enabled" | null
    if (!req.isSelf && isActive !== undefined) {
      hospital.isActive = isActive;
      if (wasActive && !isActive) activeTransition = "disabled";
      else if (!wasActive && isActive) activeTransition = "enabled";
    }

    // Handle logo upload if provided
    if (req.file) {
      const base64Logo = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
      hospital.logoUrl = base64Logo;
    }

    await hospital.save();

    // Always-on audit: record every successful update, noting which fields
    // actually changed so compliance can trace who edited what (TD-001).
    // The activeTransition PROFILE_PATCHED entries below remain as richer,
    // purpose-specific records.
    const changedFields = [];
    if (preChange.hospitalName !== hospital.hospitalName) changedFields.push("hospitalName");
    if (preChange.email !== hospital.email) changedFields.push("email");
    if (preChange.phone !== hospital.phone) changedFields.push("phone");
    if ((preChange.address || "") !== (hospital.address || "")) changedFields.push("address");
    if (preChange.isActive !== hospital.isActive) changedFields.push("isActive");
    if (req.file) changedFields.push("logoUrl");

    AuditLog.create({
      userId: hospital._id,
      action: "HOSPITAL_UPDATED",
      status: "SUCCESS",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      details: {
        targetHospitalId: String(hospital._id),
        initiatedBy: req.hospital?.id ? String(req.hospital.id) : null,
        selfUpdate: Boolean(req.isSelf),
        changedFields,
        activeTransition,
      },
    }).catch((e) => req.log.error({ event: "audit_log_hospital_updated_failed", err: e }, "AuditLog error (hospital updated)"));

    // On isActive transition, revoke sessions (if disabled) and notify via email.
    // Fire-and-forget — do not block the response.
    if (activeTransition === "disabled") {
      try {
        const Session = (await import("../models/Session.js")).default;
        await Session.updateMany(
          { hospitalId: hospital._id, isActive: true },
          { $set: { isActive: false, revokedReason: "ACCOUNT_DISABLED" } },
        );
      } catch (e) { req.log.error({ event: "update_hospital_session_revoke_failed", err: e }, "[updateHospital] session revoke failed"); }
      if (hospital.email) {
        sendAccountDisabledEmail(hospital.email, { hospitalName: hospital.hospitalName })
          .catch((e) => req.log.error({ event: "update_hospital_disabled_email_failed", err: e }, "[updateHospital] disabled email"));
      }
      AuditLog.create({
        userId: hospital._id,
        action: "PROFILE_PATCHED",
        status: "SUCCESS",
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        details: { action: "account_disabled_by_admin", adminId: req.hospital?.id },
      }).catch(() => {});
    } else if (activeTransition === "enabled") {
      if (hospital.email) {
        sendAccountEnabledEmail(hospital.email, { hospitalName: hospital.hospitalName })
          .catch((e) => req.log.error({ event: "update_hospital_enabled_email_failed", err: e }, "[updateHospital] enabled email"));
      }
      AuditLog.create({
        userId: hospital._id,
        action: "PROFILE_PATCHED",
        status: "SUCCESS",
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        details: { action: "account_enabled_by_admin", adminId: req.hospital?.id },
      }).catch(() => {});
    }

    return res.status(200).json({
      success: true,
      message: "Hospital updated successfully",
      data: hospital,
    });
  } catch (error) {
    req.log.error({ event: "update_hospital_error", err: error }, "Update hospital error");

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

    // Two resend modes based on account state:
    //  • Admin-provisioned (mustChangePassword=true): rotate temp password
    //    and email both (password + authCode).
    //  • Self-registered (mustChangePassword=false): DON'T touch the password
    //    — the user chose it. Just re-deliver the authCode.
    let newTempPassword = null;
    if (hospital.mustChangePassword) {
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
      newTempPassword = generate();

      hospital.passwordHash = await hashPassword(newTempPassword);
      hospital.failedLoginAttempts = 0;
      hospital.lockUntil = undefined;
      await hospital.save();
    }

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
      req.log.error({ event: "resend_welcome_email_failed", err: mailErr }, "[resendWelcomeEmail] mail send failed");
      return res.status(502).json({
        success: false,
        message: "The welcome email could not be delivered. Please try again.",
      });
    }

    AuditLog.create({
      userId: req.hospital?.id,
      action: "HOSPITAL_RESEND_WELCOME",
      status: "SUCCESS",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      details: {
        targetHospitalId: id,
        targetEmail: hospital.email,
        resetPassword: Boolean(newTempPassword),
      },
    }).catch((e) => req.log.error({ event: "audit_log_resend_welcome_failed", err: e }, "[AuditLog] resendWelcome"));

    return res.status(200).json({
      success: true,
      message: newTempPassword
        ? "Welcome email resent with a new temporary password."
        : "Auth Code re-sent to the hospital's registered email.",
    });
  } catch (error) {
    req.log.error({ event: "resend_welcome_email_error", err: error }, "[resendWelcomeEmail] error");
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
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

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
    }).catch((e) => req.log.error({ event: "audit_log_profile_patch_failed", err: e }, "AuditLog error (profile patch)"));

    return res.status(200).json({ success: true, message: "Profile updated", data: hospital });
  } catch (error) {
    req.log.error({ event: "patch_me_error", err: error }, "[patchMe] error");
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
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

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
      await sendOTPEmail(otpRecipient, otp, "contact_change");
    } catch (e) {
      req.log.error({ event: "contact_change_otp_email_failed", err: e }, "[initContactChange] OTP email failed");
    }

    AuditLog.create({
      userId: hospital._id,
      action: "CONTACT_CHANGE_INIT",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { field, otpChannel },
    }).catch((e) => req.log.error({ event: "audit_log_contact_init_failed", err: e }, "AuditLog error (contact init)"));

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
    req.log.error({ event: "init_contact_change_error", err: error }, "[initContactChange] error");
    return res.status(500).json({ success: false, message: "Failed to initiate contact change" });
  }
};

/**
 * POST /api/hospitals/me/change-contact/resend
 *
 * Re-sends the OTP for the currently pending contact change. Requires an
 * existing pending request in Redis (created by /init). Generates a fresh
 * OTP (invalidating the previous one) and resets the 10-minute TTL.
 *
 * Rate-limited in-memory to once per 60 s per hospital — mirrors the
 * `resendLoginAuthCode` pattern so no Redis round-trip for the cooldown.
 */
const RESEND_CONTACT_OTP_COOLDOWN_SECONDS = 60;
const resendContactOtpCooldown = new Map(); // hospitalId → timestamp(ms)

export const resendContactChangeOtp = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

    // Cooldown
    const last = resendContactOtpCooldown.get(hospitalId);
    if (last) {
      const elapsed = Date.now() - last;
      const remaining = Math.ceil(
        (RESEND_CONTACT_OTP_COOLDOWN_SECONDS * 1000 - elapsed) / 1000,
      );
      if (remaining > 0) {
        return res.status(429).json({
          success: false,
          message: `Please wait ${remaining} second(s) before requesting another code.`,
          data: { retryAfterSeconds: remaining },
        });
      }
    }

    // Must have a pending contact change
    const pending = await getContactChangeRequest(hospitalId);
    if (!pending) {
      return res.status(410).json({
        success: false,
        message: "No pending contact change. Please start over.",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    // Fresh OTP, reset TTL
    const otp = generateOtp6();
    await setContactChangeRequest(
      hospitalId,
      pending.field,
      pending.newValue,
      otp,
      CONTACT_OTP_TTL_SECONDS,
    );

    const otpRecipient = pending.field === "email" ? pending.newValue : hospital.email;
    const otpChannel = pending.field === "email" ? "new_email" : "current_email";
    try {
      await sendOTPEmail(otpRecipient, otp, "contact_change");
    } catch (e) {
      req.log.error({ event: "contact_change_resend_otp_email_failed", err: e }, "[resendContactChangeOtp] OTP email failed");
    }

    resendContactOtpCooldown.set(hospitalId, Date.now());

    AuditLog.create({
      userId: hospital._id,
      action: "CONTACT_CHANGE_RESEND",
      status: "SUCCESS",
      ipAddress,
      userAgent,
      details: { field: pending.field, otpChannel },
    }).catch((e) => req.log.error({ event: "audit_log_contact_resend_failed", err: e }, "AuditLog error (contact resend)"));

    const maskedRecipient = otpRecipient.replace(/(.{1,2}).*(@.*)/, "$1***$2");
    return res.status(200).json({
      success: true,
      message: pending.field === "email"
        ? `A new code was sent to the new email (${maskedRecipient}).`
        : `A new code was sent to your registered email (${maskedRecipient}).`,
      data: {
        field: pending.field,
        otpChannel,
        otpExpiresInSeconds: CONTACT_OTP_TTL_SECONDS,
        retryAfterSeconds: RESEND_CONTACT_OTP_COOLDOWN_SECONDS,
      },
    });
  } catch (error) {
    req.log.error({ event: "resend_contact_change_otp_error", err: error }, "[resendContactChangeOtp] error");
    return res.status(500).json({ success: false, message: "Failed to resend OTP" });
  }
};

/**
 * POST /api/hospitals/me/change-contact/verify
 * Body: { otp }
 * Commits the pending email/phone change stashed by /init.
 */
export const verifyContactChange = async (req, res) => {
  const hospitalId = req.hospital?.id;
  const ipAddress = getClientIp(req);
  const userAgent = req.headers["user-agent"];

  try {
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

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
    }).catch((e) => req.log.error({ event: "audit_log_contact_changed_failed", err: e }, "AuditLog error (contact changed)"));

    // Security notice emails (fire-and-forget):
    //   • Email change: notify BOTH the old and the new address so a
    //     compromise is visible from either end.
    //   • Phone change: only the current email is reachable (SMS deferred),
    //     so just one notice goes to that address.
    if (field === "email") {
      sendContactChangedNoticeEmail(oldValue, { field, oldValue, newValue, recipient: "old" })
        .catch((e) => req.log.error({ event: "contact_changed_old_addr_email_failed", err: e }, "[contactChanged] old-addr email failed"));
      sendContactChangedNoticeEmail(newValue, { field, oldValue, newValue, recipient: "new" })
        .catch((e) => req.log.error({ event: "contact_changed_new_addr_email_failed", err: e }, "[contactChanged] new-addr email failed"));
    } else {
      sendContactChangedNoticeEmail(hospital.email, { field, oldValue, newValue, recipient: "current" })
        .catch((e) => req.log.error({ event: "contact_changed_current_email_failed", err: e }, "[contactChanged] current-email notice failed"));
    }

    return res.status(200).json({
      success: true,
      message: `${field === "email" ? "Email" : "Phone number"} updated successfully.`,
      data: hospital,
    });
  } catch (error) {
    req.log.error({ event: "verify_contact_change_error", err: error }, "[verifyContactChange] error");
    return res.status(500).json({ success: false, message: "Failed to verify contact change" });
  }
};

// ═══════════════════════════════════════════════════
// B6 — Notification Preferences
// ═══════════════════════════════════════════════════

const DEFAULT_NOTIFICATION_PREFS = {
  newLoginAlert: true,
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
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

    const hospital = await Hospital.findById(hospitalId).select("notificationPrefs").lean();
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });

    return res.json({ success: true, data: normalizePrefs(hospital.notificationPrefs) });
  } catch (err) {
    req.log.error({ event: "get_notification_prefs_error", err }, "[getNotificationPreferences] error");
    return res.status(500).json({ success: false, message: "Failed to load preferences" });
  }
};

/** PUT /api/hospitals/me/notification-preferences */
export const updateNotificationPreferences = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });

    // Only accept known boolean keys — silently drop anything else.
    const allowed = ["newLoginAlert", "securityAlerts", "marketing"];
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
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      details: { notificationPrefs: set },
    }).catch(() => {});

    return res.json({ success: true, data: normalizePrefs(updated.notificationPrefs) });
  } catch (err) {
    req.log.error({ event: "update_notification_prefs_error", err }, "[updateNotificationPreferences] error");
    return res.status(500).json({ success: false, message: "Failed to update preferences" });
  }
};

/**
 * DELETE /api/hospitals/:id — admin-initiated forced deletion.
 * Body: { password, reason }
 *
 * Admin re-authenticates with their own password. Cannot delete self or
 * another admin. Hard-deletes the record; audit log retains ObjectId +
 * snapshot for accountability. Sends a notification email to the deleted
 * hospital's address before the row is removed.
 */
export const adminForceDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const adminId = req.hospital?.id;
    const { password, reason } = req.body || {};

    if (!password || typeof password !== "string") {
      return res.status(400).json({ success: false, message: "Admin password is required" });
    }
    const trimmedReason = (reason || "").toString().trim();
    if (trimmedReason.length < 10) {
      return res.status(400).json({ success: false, message: "Reason is required (min 10 characters)" });
    }

    if (String(adminId) === String(id)) {
      return res.status(403).json({ success: false, message: "Admin cannot delete their own account" });
    }

    const admin = await Hospital.findById(adminId);
    if (!admin || !admin.passwordHash) {
      return res.status(401).json({ success: false, errorCode: "TOKEN_INVALID", message: "Unauthorized" });
    }
    const ok = await comparePassword(password, admin.passwordHash);
    if (!ok) {
      AuditLog.create({
        userId: adminId,
        action: "AUTO_DELETE",
        status: "FAILURE",
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"],
        details: { targetId: id, type: "admin_forced_deletion", reason: "bad_admin_password" },
      }).catch(() => {});
      return res.status(401).json({ success: false, errorCode: "INVALID_CREDENTIALS", message: "Admin password is incorrect" });
    }

    const hospital = await Hospital.findById(id);
    if (!hospital) return res.status(404).json({ success: false, message: "Hospital not found" });
    if (hospital.role === "admin") {
      return res.status(403).json({ success: false, message: "Cannot force-delete an admin account" });
    }

    // Snapshot identifying fields for the audit log before the row is gone.
    const snapshot = {
      hospitalName: hospital.hospitalName,
      email: hospital.email,
      phone: hospital.phone,
    };

    try {
      const Session = (await import("../models/Session.js")).default;
      await Session.updateMany(
        { hospitalId: hospital._id, isActive: true },
        { $set: { isActive: false, revokedReason: "ACCOUNT_DELETED" } },
      );
    } catch (e) { req.log.error({ event: "admin_force_delete_session_revoke_failed", err: e }, "[adminForceDelete] session revoke failed"); }

    // Hard delete: admin-initiated takedowns should remove the record entirely.
    // The audit log still references the ObjectId + snapshot for accountability.
    await Hospital.deleteOne({ _id: hospital._id });

    // Notify the now-deleted hospital via email (fire and forget).
    if (snapshot.email) {
      sendAccountDeletedEmail(snapshot.email, {
        hospitalName: snapshot.hospitalName,
        reason: trimmedReason,
      }).catch((e) => req.log.error({ event: "admin_force_delete_notify_email_failed", err: e }, "[adminForceDelete] notify email failed"));
    }

    AuditLog.create({
      userId: hospital._id,
      action: "AUTO_DELETE",
      status: "SUCCESS",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      details: {
        approvedBy: adminId,
        type: "admin_forced_deletion",
        reason: trimmedReason.slice(0, 1000),
        snapshot,
      },
    }).catch(() => {});

    return res.json({ success: true, message: "Hospital deleted" });
  } catch (err) {
    req.log.error({ event: "admin_force_delete_error", err }, "[adminForceDelete] error");
    return res.status(500).json({ success: false, message: "Failed to delete hospital" });
  }
};

export default {
  getAllHospitals,
  getCurrentHospital,
  getHospitalById,
  updateHospital,
  patchMe,
  initContactChange,
  resendContactChangeOtp,
  verifyContactChange,
  getNotificationPreferences,
  updateNotificationPreferences,
  adminForceDelete,
};
