/**
 * Hospital Model
 * Stores hospital credentials and profile information
 */

import mongoose from "mongoose";
import crypto from "crypto";

const hospitalSchema = new mongoose.Schema(
  {
    hospitalName: {
      type: String,
      required: [true, "Hospital name is required"],
      trim: true,
      minlength: [3, "Hospital name must be at least 3 characters"],
    },
    authCode: {
      type: String,
      unique: true,
      trim: true,
      match: [/^\d{6}$/, "Auth code must be exactly 6 digits"],
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

    // Auto-incrementing counter for patient ID generation (per hospital)
    patientIdCounter: {
      type: Number,
      default: 0,
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
// authCode already has a unique index via field definition

// Virtual for full address
hospitalSchema.virtual("fullAddress").get(function () {
  return `${this.address}, ${this.city}, ${this.state} ${this.zipCode}`;
});

// Remove sensitive fields from JSON responses
hospitalSchema.methods.toJSON = function () {
  const {
    passwordHash,
    fcmToken,
    biometricKeys,
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

/**
 * Derive hospital initials from name for Patient/Folder ID generation.
 * Multi-word: first letter of each word, e.g. "Sunrise Hospital" → "SH"
 * Single-word: first two letters, e.g. "Apollo" → "AP"
 */
hospitalSchema.methods.getInitials = function () {
  const words = this.hospitalName.trim().split(/\s+/);
  if (words.length >= 2) {
    return words.map((w) => w[0]).join("").toUpperCase();
  }
  return this.hospitalName.slice(0, 2).toUpperCase();
};

/**
 * Generate a random 6-digit numeric auth code (OTP-style), e.g. "041326".
 * Leading zeros are preserved (returned as a zero-padded string).
 * Uses crypto.randomInt for a uniform distribution.
 */
hospitalSchema.statics.generateAuthCode = function () {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
};

/**
 * Generate a unique authCode that doesn't collide with any existing hospital.
 * Retries up to 10 times in the unlikely case of collision.
 */
hospitalSchema.statics.generateUniqueAuthCode = async function () {
  const Hospital = this;
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = Hospital.generateAuthCode();
    const exists = await Hospital.findOne({ authCode: code }).select("_id").lean();
    if (!exists) return code;
  }
  throw new Error("Failed to generate unique auth code after 10 attempts");
};

// Auto-generate authCode on creation if not explicitly set
hospitalSchema.pre("validate", async function (next) {
  if (this.isNew && !this.authCode) {
    try {
      this.authCode = await this.constructor.generateUniqueAuthCode();
    } catch (err) {
      return next(err);
    }
  }
  next();
});

const Hospital = mongoose.model("Hospital", hospitalSchema);

export default Hospital;
