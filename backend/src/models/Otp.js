/**
 * OTP Model
 * Stores OTP details with automatic expiry using MongoDB TTL index
 */

import mongoose from "mongoose";

const otpSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
    },
    otpHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index - auto-delete
    },
    attemptsCount: {
      type: Number,
      default: 0,
      max: [3, "Maximum OTP attempts exceeded"],
    },
    isUsed: {
      type: Boolean,
      default: false,
    },
    ipAddress: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for hospital and expiry
otpSchema.index({ hospitalId: 1, expiresAt: 1 });

// Auto-delete expired OTP documents
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Otp = mongoose.model("Otp", otpSchema);

export default Otp;
