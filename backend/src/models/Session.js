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
    isMobile: {
      type: Boolean,
      default: false,
    },
    platform: {
      type: String,
      default: "web", // "web", "android", "ios"
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    lastSeenIp: {
      type: String,
    },
    // Populated fire-and-forget after session creation via geoip.service.
    // Null until the lookup completes or if the IP is private/LAN.
    location: {
      city: { type: String, default: null },
      region: { type: String, default: null },
      country: { type: String, default: null },
      countryCode: { type: String, default: null },
      isPrivate: { type: Boolean, default: false },
      displayName: { type: String, default: null },
    },
    revokedReason: {
      type: String, // "SESSION_CONFLICT", "ADMIN_REVOKE", "SUSPICIOUS_ACTIVITY", "SESSION_LIMIT_EXCEEDED"
    },
    lastAccessedAt: {
      type: Date,
      default: Date.now,
    },
    // Last time the user re-verified their 6-digit hospital Auth Code on
    // THIS session. Mobile sessions are required to re-verify every 7 days
    // (see middleware/auth.js) so the device keeps proving it's the same
    // user holding the hospital code — without forcing a full re-login.
    // Biometric verification counts as a refresh too.
    authCodeVerifiedAt: {
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

// TTL index is already defined inline on the expiresAt field

// Update last accessed timestamp on each access
sessionSchema.methods.updateLastAccess = async function () {
  this.lastAccessedAt = Date.now();
  return this.save();
};

const Session = mongoose.model("Session", sessionSchema);

export default Session;
