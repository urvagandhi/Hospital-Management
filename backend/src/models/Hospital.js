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
  },
  {
    timestamps: true,
  },
);

// Index for faster queries
hospitalSchema.index({ email: 1 });
hospitalSchema.index({ phone: 1 });

// Virtual for full address
hospitalSchema.virtual("fullAddress").get(function () {
  return `${this.address}, ${this.city}, ${this.state} ${this.zipCode}`;
});

// Remove password from JSON responses
hospitalSchema.methods.toJSON = function () {
  const { passwordHash, ...rest } = this.toObject();
  return rest;
};

// Match user entered password to hashed password in database
hospitalSchema.methods.matchPassword = async function (enteredPassword) {
  const { comparePassword } = await import("../utils/hash.js");
  return await comparePassword(enteredPassword, this.passwordHash);
};

const Hospital = mongoose.model("Hospital", hospitalSchema);

export default Hospital;
