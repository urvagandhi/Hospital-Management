/**
 * Token Service
 * Manages session tokens and refresh token logic
 */

import mongoose from "mongoose";
import Session from "../models/Session.js";
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from "../utils/jwt.js";
import config from "../config/env.js";
import logger from "../utils/logger.js";
import { notifySessionRevoked, notifyNewLogin } from "./push.service.js";
import { sendSessionRevokedEmail, sendNewLoginAlertEmail } from "./mail.service.js";
import { geolocateIp } from "./geoip.service.js";
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
    // MOBILE SESSION LIMIT: N concurrent mobile sessions per user (env-driven,
    // defaults to 2; demos may bump to 10–15 via MOBILE_SESSION_LIMIT).
    //   → If the hospital already has N+ active mobile sessions, revoke the
    //     OLDEST (by createdAt) so there's room for this new one — leaving
    //     the previous device logged in alongside the new one.
    //   Web: multiple concurrent sessions allowed (read-only portal).
    const MOBILE_SESSION_LIMIT = config.MOBILE_SESSION_LIMIT;
    // Pre-create eviction: makes the common path produce 2 sessions.
    // A second post-create sweep below catches the race where two logins
    // both pass this check at the same time.
    if (isMobile) {
      const activeMobile = await Session.find({
        hospitalId,
        isMobile: true,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        // _id tie-break so identical createdAt values produce a stable order.
        .sort({ createdAt: 1, _id: 1 })
        .select("_id userAgent")
        .lean();

      const toRevokeCount = Math.max(0, activeMobile.length - (MOBILE_SESSION_LIMIT - 1));
      if (toRevokeCount > 0) {
        const victims = activeMobile.slice(0, toRevokeCount);
        const idsToRevoke = victims.map((s) => s._id);
        const oldDeviceUA = victims[0]?.userAgent || null;

        await Session.updateMany(
          { _id: { $in: idsToRevoke } },
          { isActive: false, revokedReason: "SESSION_LIMIT_EXCEEDED" },
        );
        notifySessionRevoked(hospitalId).catch((err) =>
          logger.error({ event: "push_session_revoked_failed", err }, "[Token] session-revoked push failed"),
        );
        Hospital.findById(hospitalId).select("email").lean()
          .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
            oldDevice: oldDeviceUA,
            newDevice: userAgent,
            reason: "SESSION_LIMIT_EXCEEDED",
          }))
          .catch((e) => logger.error({ event: "mail_failed", reason: "session_revoked", err: e }, "[Token] session-revoked email failed"));
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

    // Fire-and-forget geolocation so login latency isn't blocked on an
    // external HTTP call. Updates the session record once resolved.
    geolocateIp(ipAddress)
      .then((location) =>
        Session.updateOne({ _id: session._id }, { $set: { location } }),
      )
      .catch((err) =>
        logger.warn(
          { event: "geoip_lookup_failed", sessionId: session._id, err },
          "[token.service] geo lookup failed",
        ),
      );

    // Race-safety sweep: if two simultaneous mobile logins both passed the
    // pre-create check, both Session.create calls succeeded and we may now
    // have > LIMIT active mobile sessions. Re-check and evict the oldest
    // surplus, never the session we just created.
    if (isMobile) {
      const activeAfter = await Session.find({
        hospitalId,
        isMobile: true,
        isActive: true,
        expiresAt: { $gt: new Date() },
      })
        .sort({ createdAt: 1, _id: 1 })
        .select("_id userAgent")
        .lean();

      const surplus = activeAfter.length - MOBILE_SESSION_LIMIT;
      if (surplus > 0) {
        const victims = activeAfter
          .filter((s) => String(s._id) !== String(session._id))
          .slice(0, surplus);
        if (victims.length > 0) {
          const ids = victims.map((s) => s._id);
          await Session.updateMany(
            { _id: { $in: ids } },
            { isActive: false, revokedReason: "SESSION_LIMIT_EXCEEDED" },
          );
          notifySessionRevoked(hospitalId).catch((err) =>
            logger.error({ event: "push_session_revoked_failed", err }, "[Token] race-sweep push failed"),
          );
          Hospital.findById(hospitalId).select("email").lean()
            .then((h) => h?.email && sendSessionRevokedEmail(h.email, {
              oldDevice: victims[0]?.userAgent || null,
              newDevice: userAgent,
              reason: "SESSION_LIMIT_EXCEEDED",
            }))
            .catch((e) => logger.error({ event: "mail_failed", reason: "race_sweep", err: e }, "[Token] race-sweep email failed"));
        }
      }
    }

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
          }).catch((e) => logger.error({ event: "mail_failed", reason: "new_login", err: e }, "[new-login email]"));
        }
        notifyNewLogin(hospitalId, userAgent || "a new device").catch(() => {});
      } catch (e) {
        logger.error({ event: "new_login_notify_failed", err: e }, "[new-login notify]");
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
 * Handle a refresh-token presentation that decoded successfully but matched no
 * active session. Two possibilities:
 *   (a) Legitimate post-logout retry — the session was hard-deleted by logout
 *       and the client sent one more refresh before its cookie cleared.
 *   (b) Replay of a rotated token — an attacker (or a stale tab) is using an
 *       old refresh token that has since been rotated out.
 *
 * Heuristic: if the hospital has ANY other active sessions, assume (b) and
 * revoke ALL sessions for that hospital + send a security-alert email. This
 * protects the common attack surface while tolerating the benign (a) case
 * when no sessions remain (nothing to protect).
 *
 * @param {string} hospitalId
 */
const handlePossibleRefreshReuse = async (hospitalId) => {
  try {
    const activeCount = await Session.countDocuments({
      hospitalId,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });
    if (activeCount === 0) return; // nothing to protect — likely logout retry

    await Session.updateMany(
      { hospitalId, isActive: true },
      { isActive: false, revokedReason: "REFRESH_TOKEN_REUSE" },
    );

    logger.warn(
      { event: "refresh_reuse_detected", hospitalId },
      "[Token] refresh token reuse detected — revoking all sessions",
    );
    logger.warn(
      { event: "token_revoked_all", hospitalId, reason: "REFRESH_TOKEN_REUSE" },
      "[Token] all sessions revoked",
    );

    notifySessionRevoked(hospitalId).catch((e) =>
      logger.error({ event: "push_session_revoked_failed", err: e }, "[Token] reuse push failed"),
    );

    Hospital.findById(hospitalId)
      .select("email")
      .lean()
      .then(
        (h) =>
          h?.email &&
          sendSessionRevokedEmail(h.email, {
            oldDevice: null,
            newDevice: null,
            reason: "REFRESH_TOKEN_REUSE",
          }),
      )
      .catch((e) =>
        logger.error({ event: "mail_failed", reason: "refresh_reuse", err: e }, "[Token] reuse email failed"),
      );
  } catch (e) {
    logger.error({ event: "refresh_reuse_handler_failed", err: e }, "[Token] reuse handler failed");
  }
};

/**
 * Refresh access token using refresh token — ROTATES the refresh token.
 *
 * Each successful refresh issues a brand-new refresh token and persists it on
 * the session doc, invalidating the old one. Presenting an old (rotated-out)
 * refresh token hits `handlePossibleRefreshReuse` which may revoke all
 * sessions for the hospital if reuse is detected.
 *
 * @param {string} refreshToken - Refresh token (from cookie or body)
 * @returns {Promise<object>} { accessToken, refreshToken (new), expiresIn, tokenType, sessionId, hospitalId }
 */
export const refreshAccessToken = async (refreshToken) => {
  // Verify JWT signature / type FIRST. On signature failure, bail out without
  // touching the DB — that's just an invalid token, not a replay signal.
  let decoded;
  try {
    decoded = verifyRefreshToken(refreshToken);
    if (decoded.type !== "refresh") {
      throw new Error("Invalid token type");
    }
  } catch (error) {
    throw new Error(`Failed to refresh token: ${error.message}`);
  }

  try {
    // Find session with refresh token
    const session = await Session.findOne({
      refreshToken,
      isActive: true,
      expiresAt: { $gt: new Date() },
    });

    if (!session) {
      // Distinguish two scenarios that both produce "no active session":
      //   (a) Rotation reuse — refresh token was rotated out and OVERWRITTEN
      //       in the DB. Presented token now appears in NO session row at
      //       all → genuine replay → run reuse defense, revoke siblings.
      //   (b) Explicit revoke — refresh token still exists in a session row,
      //       but that row is `isActive: false` (idle sweep, admin revoke,
      //       session-conflict eviction, etc.). The token was NEVER rotated;
      //       the session was killed. Don't punish other devices for this.
      //
      // Without this distinction the idle sweep cascades: device A goes
      // idle → its row flips inactive → device A's next refresh hits this
      // path → reuse defense revokes device B too. Cross-device logout from
      // a single user closing one tab.
      // No `.select().lean()` chain — the unit-test mock for Session.findOne
      // returns a plain Promise (not a Mongoose Query), so chaining breaks
      // CI. The row is one document; reading the full thing is cheap.
      const revokedRow = await Session.findOne({ refreshToken });

      if (revokedRow && !revokedRow.isActive) {
        // Explicitly revoked — clean failure, no cascade.
        throw new Error("Session was revoked. Please log in again.");
      }

      // Truly rotated out (or token forged) — run reuse defense.
      await handlePossibleRefreshReuse(decoded.id);
      throw new Error("Invalid or expired refresh token");
    }

    // ROTATE: issue a new refresh token and persist it atomically.
    const newAccessToken = generateAccessToken(session.hospitalId, session._id);
    const newRefreshToken = generateRefreshToken(session.hospitalId);

    session.refreshToken = newRefreshToken;
    session.lastAccessedAt = new Date();
    await session.save();

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: config.JWT_EXPIRY,
      tokenType: "Bearer",
      sessionId: session._id,
      hospitalId: session.hospitalId,
    };
  } catch (error) {
    throw new Error(`Failed to refresh token: ${error.message}`);
  }
};

/**
 * Invalidate session (manual logout) — HARD delete.
 *
 * Manual logout removes the row entirely so it never counts toward the mobile
 * session limit and never leaves a "ghost" entry. Forced/admin revocations
 * use Session.updateMany({ isActive:false, revokedReason }) instead so the
 * old device's next API call gets a 401 with a useful reason.
 *
 * Idempotent: returns true if anything was deleted, false if nothing matched
 * (already gone) — caller should treat both as success.
 *
 * @param {string} refreshToken
 * @returns {Promise<boolean>} true if a session was deleted
 */
export const invalidateSession = async (refreshToken) => {
  try {
    const result = await Session.deleteOne({ refreshToken });
    return result.deletedCount > 0;
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

export default {
  createSession,
  refreshAccessToken,
  invalidateSession,
  invalidateAllSessions,
  getActiveSessions,
};
