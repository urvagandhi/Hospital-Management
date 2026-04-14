/**
 * Hospitals Controller
 * Handles hospital management operations
 */

import crypto from "crypto";
import Hospital from "../models/Hospital.js";
import AuditLog from "../models/AuditLog.js";
import { hashPassword } from "../utils/hash.js";
import { sendWelcomeEmail } from "../services/mail.service.js";

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

export default {
  getAllHospitals,
  getCurrentHospital,
  getHospitalById,
  updateHospital,
};
