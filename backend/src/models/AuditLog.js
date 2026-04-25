/**
 * Audit Log Model
 * Tracks all security-related events for HIPAA compliance
 */

import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: false, // Can be null if login fails and user is unknown/not found
    },
    action: {
      type: String,
      required: true,
      enum: [
        // Auth
        "LOGIN_ATTEMPT",
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "OTP_SENT",
        "OTP_VERIFIED",
        "LOGOUT",
        "SESSION_IDLE_REVOKED",
        "AUTH_CODE_REVERIFIED",
        "AUTH_CODE_REVERIFY_FAILED",
        "AUTH_CODE_RESEND",
        "BIOMETRIC_REGISTERED",
        // Password
        "PASSWORD_CHANGE",
        "PASSWORD_CHANGED",
        "PASSWORD_CHANGE_FAILED",
        "PASSWORD_RESET_INIT",
        "PASSWORD_RESET_VERIFIED",
        "PASSWORD_RESET_COMPLETED",
        "PASSWORD_RESET_FAILED",
        // Profile / contact
        "PROFILE_UPDATE",
        "PROFILE_PATCHED",
        "CONTACT_CHANGE_INIT",
        "CONTACT_CHANGE_RESEND",
        "CONTACT_CHANGED",
        "CONTACT_CHANGE_FAILED",
        // Registration / admin hospital management
        "HOSPITAL_REGISTRATION",
        "HOSPITAL_REGISTRATION_VERIFIED",
        "HOSPITAL_UPDATED",
        "HOSPITAL_RESEND_WELCOME",
        // Background / data
        "AUTO_DELETE",
        "ORPHAN_CLEANUP",
        "PATIENT_VIEW",
        "PATIENT_CREATED",
        "PATIENT_UPDATED",
        "PATIENT_EXPORT_PDF",
        "PATIENT_EXPORT_ZIP",
        "PATIENT_FILE_DELETE",
        // Patient mutations
        "FOLDER_CREATED",
        "FILE_UPLOADED",
        "FILE_RENAMED",
      ],
    },
    status: {
      type: String,
      enum: ["SUCCESS", "FAILURE"],
      required: true,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
    details: {
      type: mongoose.Schema.Types.Mixed, // Flexible field for extra info
    },
    metadata: {
      email: String, // Store email even if user not found
      failureReason: String,
    },
  },
  {
    timestamps: true, // createdAt serves as the timestamp of the event
  },
);

// Index for querying logs by user or time
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
