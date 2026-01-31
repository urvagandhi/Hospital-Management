/**
 * Session Model
 * Manages user sessions with device fingerprinting for single-device login
 */

import mongoose from "mongoose";

const sessionSchema = new mongoose.Schema(
  {
    hospitalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Hospital",
      required: true,
    },
    refreshToken: {
      type: String,
      required: true,
      unique: true,
    },
    deviceId: {
      type: String,
      required: true,
      // Unique combination of hospital + device for single-device enforcement
    },
    ipAddress: {
      type: String,
      required: true,
    },
    userAgent: {
      type: String,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // TTL index
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index for enforcing single device login per hospital
sessionSchema.index({ hospitalId: 1, deviceId: 1 });

// TTL index for automatic session cleanup
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Update last accessed timestamp on each access
sessionSchema.methods.updateLastAccess = async function () {
  this.lastAccessedAt = Date.now();
  return this.save();
};

const Session = mongoose.model("Session", sessionSchema);

export default Session;
