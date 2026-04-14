/**
 * Token Service
 * Manages session tokens and refresh token logic
 */

import mongoose from "mongoose";
import Session from "../models/Session.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import config from "../config/env.js";
import { notifySessionRevoked, notifyNewLogin } from "./push.service.js";
import { sendSessionRevokedEmail, sendNewLoginAlertEmail } from "./mail.service.js";
import Hospital from "../models/Hospital.js";

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
    // MOBILE SESSION LIMIT: 2 concurrent mobile sessions per user.
    //   → If the hospital already has 2+ active mobile sessions, revoke the
    //     OLDEST (by createdAt) so there's room for this new one — leaving
    //     the previous device logged in alongside the new one.
    //   Web: multiple concurrent sessions allowed (read-only portal).
    const MOBILE_SESSION_LIMIT = 2;
    if (isMobile) {
      const activeMobile = await Session.find({
        hospitalId,
        isMobile: true,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: 1 })
        .select("_id")
        .lean();

      // Before inserting the new one, keep at most (LIMIT - 1) existing sessions.
      const toRevokeCount = Math.max(0, activeMobile.length - (MOBILE_SESSION_LIMIT - 1));
      if (toRevokeCount > 0) {
        // Re-fetch the session docs we're about to kick so we can show the
        // actual old-device UA in the revocation email (not the new UA).
        const idsToRevoke = activeMobile.slice(0, toRevokeCount).map((s) => s._id);
        const revokedDocs = await Session.find({ _id: { $in: idsToRevoke } })
          .select("userAgent")
          .lean();
        const oldDeviceUA = revokedDocs[0]?.userAgent || null;

        await Session.updateMany(
          { _id: { $in: idsToRevoke } },
          { isActive: false, revokedReason: "SESSION_LIMIT_EXCEEDED" },
        );
        notifySessionRevoked(hospitalId).catch(console.error);
        Hospital.findById(hospitalId).select("email").lean()
          .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
            oldDevice: oldDeviceUA,
            newDevice: userAgent,
            reason: "SESSION_LIMIT_EXCEEDED",
          }))
          .catch((e) => console.error("[Token] session-revoked email failed:", e.message));
      }
    }

    // Generate session ID
    const sessionId = new mongoose.Types.ObjectId();

    // Generate tokens
    const accessToken = generateAccessToken(hospitalId, sessionId);
    const refreshToken = generateRefreshToken(hospitalId);

    // Refresh-token / DB session lifetime: 365 days. Security on mobile is
    // enforced by the 7-day Auth Code re-verification in middleware/auth.js,
    // not by forcing a full re-login.
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

    const platform = isMobile ? "android" : "web";
    const now = new Date();

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
      lastSeenAt: now,
      lastSeenIp: ipAddress,
      // Fresh login through password+AuthCode (or biometric) counts as an
      // Auth Code verification — reset the 7-day clock.
      authCodeVerifiedAt: now,
    });

    // B6 — Fire new-login notification (email + push), gated by user prefs.
    // Fire-and-forget; never blocks login. Skips if this is the first session
    // (account creation) by detecting no other active sessions at time of create.
    (async () => {
      try {
        const otherActive = await Session.countDocuments({
          hospitalId,
          isActive: true,
          _id: { $ne: session._id },
        });
        if (otherActive === 0) return; // first login after registration; skip alert
        const hospital = await Hospital.findById(hospitalId)
          .select("email notificationPrefs")
          .lean();
        if (!hospital) return;
        const optedIn = !hospital.notificationPrefs || hospital.notificationPrefs.newLoginAlert !== false;
        if (!optedIn) return;
        if (hospital.email) {
          sendNewLoginAlertEmail(hospital.email, {
            userAgent,
            ipAddress,
            when: now,
          }).catch((e) => console.error("[new-login email]", e.message));
        }
        notifyNewLogin(hospitalId, userAgent || "a new device").catch(() => {});
      } catch (e) {
        console.error("[new-login notify]", e.message);
      }
    })();

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
