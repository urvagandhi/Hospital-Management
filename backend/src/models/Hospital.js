/**
 * Hospital Model
 * Stores hospital credentials and profile information
 */

import mongoose from "mongoose";

const hospitalSchema = new mongoose.Schema(
  {
    hospitalName: {
      type: String,
      required: [true, "Hospital name is required"],
      trim: true,
      minlength: [3, "Hospital name must be at least 3 characters"],
    },
    username: {
      type: String,
      unique: true,
      sparse: true, // Allow null for legacy records
      lowercase: true,
      trim: true,
      minlength: [4, "Username must be at least 4 characters"],
      maxlength: [30, "Username must be at most 30 characters"],
      match: [/^[a-z0-9_]+$/, "Username may only contain letters, numbers, and underscores"],
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, "Invalid email format"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      unique: true,
      match: [/^\+?[1-9]\d{1,14}$/, "Invalid phone number format"],
    },
    passwordHash: {
      type: String,
      required: [true, "Password is required"],
      minlength: [6, "Password must be at least 6 characters"],
    },
    logoUrl: {
      type: String,
      default: "https://via.placeholder.com/150?text=Hospital",
    },
    role: {
      type: String,
      enum: ["admin", "hospital"],
      default: "hospital",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
    },
    lockUntil: {
      type: Date,
    },
    department: {
      type: String,
      default: "General",
    },
    address: {
      type: String,
      trim: true,
    },
    city: {
      type: String,
      trim: true,
    },
    state: {
      type: String,
      trim: true,
    },
    zipCode: {
      type: String,
      trim: true,
    },

    // ========================================
    // TOTP 2FA Fields
    // ========================================
    totpEnabled: {
      type: Boolean,
      default: false,
    },
    totpSecretEncrypted: {
      type: String, // AES-256-GCM encrypted TOTP secret
    },
    totpVerified: {
      type: Boolean,
      default: false, // True after first OTP verification during setup
    },
    totpPendingSecret: {
      type: String, // Temporary secret during rotation/reset
    },

    // 🔐 [SECURITY] TOTP Timestamps for audit compliance & dormancy detection
    totpSetupAt: {
      type: Date, // Set on successful /2fa/verify
    },
    totpLastUsedAt: {
      type: Date, // Updated on each successful /login/totp
    },

    // 🚫 [SECURITY] TOTP Attempt Counters for brute-force protection
    totpFailedAttempts: {
      type: Number,
      default: 0,
    },
    totpLockedUntil: {
      type: Date, // Lock for 5 min after 5 failed attempts
    },

    // 🧠 [ENTERPRISE] Optional future-proofing fields
    totpSecretVersion: {
      type: Number,
      default: 1, // Allows crypto rotation later
    },
    totpIssuer: {
      type: String, // White-labeling: "HospitalName (YourApp)"
    },
    // Force hospital admin to change password on first login (set by super-admin)
    mustChangePassword: {
      type: Boolean,
      default: false,
    },

    // FCM push notification token
    fcmToken: {
      token: { type: String },
      updatedAt: { type: Date },
    },

    // Biometric binding — stores public keys per device
    biometricKeys: [{
      deviceId: { type: String, required: true },
      publicKey: { type: String, required: true },
      createdAt: { type: Date, default: Date.now },
    }],
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
hospitalSchema.index({ email: 1 });
hospitalSchema.index({ phone: 1 });
hospitalSchema.index({ username: 1 });

// Virtual for full address
hospitalSchema.virtual("fullAddress").get(function () {
  return `${this.address}, ${this.city}, ${this.state} ${this.zipCode}`;
});

// Remove sensitive fields from JSON responses
hospitalSchema.methods.toJSON = function () {
  const {
    passwordHash,
    totpSecretEncrypted,
    totpPendingSecret,
    fcmToken,
    biometricKeys,
    totpFailedAttempts,
    totpLockedUntil,
    failedLoginAttempts,
    lockUntil,
    ...rest
  } = this.toObject();
  return rest;
};

// Match user entered password to hashed password in database
hospitalSchema.methods.matchPassword = async function (enteredPassword) {
  const { comparePassword } = await import("../utils/hash.js");
  return await comparePassword(enteredPassword, this.passwordHash);
};

const Hospital = mongoose.model("Hospital", hospitalSchema);

export default Hospital;
