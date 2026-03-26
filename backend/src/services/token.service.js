/**
 * Token Service
 * Manages session tokens and refresh token logic
 */

import mongoose from "mongoose";
import Session from "../models/Session.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import config from "../config/env.js";
import { notifySessionRevoked } from "./push.service.js";

/**
 * Create new session
 * @param {string} hospitalId - Hospital ID
 * @param {string} deviceId - Device identifier (fingerprint)
 * @param {string} ipAddress - Client IP address
 * @param {string} userAgent - User agent string
 * @param {boolean} isMobile - Whether the client is a mobile device
 * @returns {Promise<object>} Session with tokens
 */
export const createSession = async (hospitalId, deviceId, ipAddress, userAgent, isMobile = false, { forceCreate = false } = {}) => {
  try {
    // SINGLE DEVICE POLICY:
    // Mobile (Android): only ONE active mobile session per user.
    //   → Invalidate all other mobile sessions on new mobile login.
    // Web: multiple concurrent sessions allowed (read-only portal).
    if (isMobile) {
      const revoked = await Session.updateMany(
        { hospitalId, isMobile: true, isActive: true },
        { isActive: false, revokedReason: "SESSION_CONFLICT" },
      );

      // If sessions were revoked, send push notification (fire-and-forget)
      if (revoked.modifiedCount > 0) {
        notifySessionRevoked(hospitalId).catch(console.error);
      }
    }

    // Generate session ID
    const sessionId = new mongoose.Types.ObjectId();

    // Generate tokens
    const accessToken = generateAccessToken(hospitalId, sessionId);
    const refreshToken = generateRefreshToken(hospitalId);

    // Calculate expiry (7 days for refresh token)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // Determine platform
    const platform = isMobile ? "android" : "web";

    // Create session
    const session = await Session.create({
      _id: sessionId,
      hospitalId,
      refreshToken,
      deviceId,
      ipAddress,
      userAgent,
      isMobile,
      platform,
      expiresAt,
      isActive: true,
      lastSeenAt: new Date(),
      lastSeenIp: ipAddress,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: config.JWT_EXPIRY,
      tokenType: "Bearer",
      sessionId: session._id,
    };
  } catch (error) {
    throw new Error(`Failed to create session: ${error.message}`);
  }
};

/**
 * Refresh access token using refresh token
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<object>} New tokens
 */
export const refreshAccessToken = async (refreshToken) => {
  try {
    // Verify JWT signature before DB lookup
    const decoded = verifyRefreshToken(refreshToken);
    if (decoded.type !== "refresh") {
      throw new Error("Invalid token type");
    }

    // Find session with refresh token
    const session = await Session.findOne({
      refreshToken,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      throw new Error("Invalid or expired refresh token");
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(session.hospitalId, session._id);

    // Update last accessed
    session.lastAccessedAt = new Date();
    await session.save();

    return {
      accessToken: newAccessToken,
      refreshToken: session.refreshToken,
      expiresIn: config.JWT_EXPIRY,
      tokenType: "Bearer",
    };
  } catch (error) {
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
};

/**
 * Invalidate session (logout)
 * @param {string} refreshToken - Refresh token
 * @returns {Promise<boolean>} Success status
 */
export const invalidateSession = async (refreshToken) => {
  try {
    const result = await Session.updateOne({ refreshToken }, { isActive: false });

    return result.modifiedCount > 0;
  } catch (error) {
    throw new Error(`Failed to invalidate session: ${error.message}`);
  }
};

/**
 * Invalidate all sessions for a hospital (logout all devices)
 * @param {string} hospitalId - Hospital ID
 * @returns {Promise<object>} Update result
 */
export const invalidateAllSessions = async (hospitalId) => {
  try {
    const result = await Session.updateMany({ hospitalId }, { isActive: false });

    return result;
  } catch (error) {
    throw new Error(`Failed to invalidate all sessions: ${error.message}`);
  }
};

/**
 * Get active sessions for a hospital
 * @param {string} hospitalId - Hospital ID
 * @returns {Promise<array>} Active sessions
 */
export const getActiveSessions = async (hospitalId) => {
  try {
    const sessions = await Session.find({
      hospitalId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    }).select("-refreshToken");

    return sessions;
  } catch (error) {
    throw new Error(`Failed to get active sessions: ${error.message}`);
  }
};

/**
 * Clean up expired sessions (manual cleanup)
 * @returns {Promise<object>} Deletion result
 */
export const cleanupExpiredSessions = async () => {
  try {
    const result = await Session.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    return result;
  } catch (error) {
    throw new Error(`Failed to cleanup sessions: ${error.message}`);
  }
};

export default {
  createSession,
  refreshAccessToken,
  invalidateSession,
  invalidateAllSessions,
  getActiveSessions,
  cleanupExpiredSessions,
};
