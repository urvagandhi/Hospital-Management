/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches hospital data to request
 */

import Hospital from "../models/Hospital.js";
import Session from "../models/Session.js";
import { extractTokenFromHeader, verifyToken } from "../utils/jwt.js";

/**
 * Verify JWT token middleware
 */
export const verifyAccessToken = async (req, res, next) => {
  try {
    // Try to get token from cookie first, then fall back to Authorization header
    let token = req.cookies?.accessToken;

    if (!token) {
      token = extractTokenFromHeader(req.headers.authorization);
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = verifyToken(token);

    if (decoded.type !== "access") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type",
      });
    }

    // CHECK SESSION VALIDITY (Enforce Single Device Logic)
    // 1. Enforce sessionId presence (invalidates all old tokens)
    if (!decoded.sessionId) {
       return res.status(401).json({
         success: false,
         message: "Invalid token format. Please login again.",
       });
    }

    // 2. Check DB status
    const session = await Session.findById(decoded.sessionId);
    if (!session || !session.isActive) {
      const reason = session?.revokedReason || "SESSION_EXPIRED";
      const message =
        reason === "SESSION_CONFLICT"   ? "You were logged out because you signed in on another device." :
        reason === "ACCOUNT_DISABLED"   ? "ACCOUNT_DISABLED: Your account has been disabled by the administrator." :
                                          "Session expired or invalid. Please login again.";
      return res.status(401).json({
        success: false,
        message,
        reason,
      });
    }

    // 3. Mobile-only: enforce 7-day Auth Code re-verification. Users stay
    //    logged in indefinitely via long-lived refresh cookie, but every 7
    //    days they must prove same-device by re-entering the hospital's
    //    6-digit Auth Code. Biometric login and /session/reverify-auth-code
    //    both refresh this timestamp.
    //
    //    The reverify endpoint itself bypasses this check so the user can
    //    actually satisfy it.
    const AUTH_CODE_FRESH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const reverifyPath = "/session/reverify-auth-code";
    const isReverifyCall = (req.originalUrl || "").includes(reverifyPath);
    if (session.isMobile && !isReverifyCall) {
      const lastVerified = session.authCodeVerifiedAt || session.createdAt;
      const age = Date.now() - new Date(lastVerified).getTime();
      if (age > AUTH_CODE_FRESH_WINDOW_MS) {
        return res.status(401).json({
          success: false,
          code: "AUTH_CODE_REQUIRED",
          reason: "AUTH_CODE_STALE",
          message: "Please re-verify your 6-digit Auth Code to continue.",
        });
      }
    }

    // Update lastSeenAt on every authenticated request (non-blocking)
    const ipAddress = req.ip || req.connection.remoteAddress;
    Session.updateOne(
      { _id: session._id },
      { lastSeenAt: new Date(), lastSeenIp: ipAddress },
    ).exec().catch(() => {});

    req.hospital = { id: decoded.id };
    req.sessionId = decoded.sessionId;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Verify temporary token (for 2nd-factor Auth Code verification).
 * 🔑 [SECURITY] Validates purpose scope for single-use tokens.
 *
 * Tokens minted by POST /login for the Auth Code step have purpose=AUTH_CODE.
 * (Legacy purposes like TOTP_LOGIN are rejected — TOTP has been removed.)
 */
export const verifyTempToken = (req, res, next) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "No token provided",
      });
    }

    const decoded = verifyToken(token);

    if (decoded.type !== "temp") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type.",
      });
    }

    if (decoded.purpose !== "AUTH_CODE") {
      return res.status(401).json({
        success: false,
        message: "Token purpose mismatch. Invalid token for this operation.",
      });
    }

    req.hospital = { id: decoded.id };
    req.tokenPurpose = decoded.purpose;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Middleware to attach hospital data to request
 */
export const attachHospitalData = async (req, res, next) => {
  try {
    const hospitalId = req.hospital?.id;
    req.log.debug({ event: "middleware_auth_attach_hospital", hospitalId }, "[Auth Middleware] attachHospitalData - hospitalId from token");

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Hospital ID not found in token",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    req.log.debug(
      { event: "middleware_auth_hospital_lookup", hospitalId: hospital?._id, hospitalName: hospital?.hospitalName },
      "[Auth Middleware] Hospital found",
    );

    if (!hospital) {
      return res.status(404).json({
        success: false,
        message: "Hospital not found",
      });
    }

    if (!hospital.isActive) {
      return res.status(403).json({
        success: false,
        message: "Hospital account is inactive",
      });
    }

    req.hospital = hospital;
    next();
  } catch (error) {
    req.log.error({ event: "middleware_auth_failed", err: error }, "[Auth Middleware] attachHospitalData error");
    return res.status(500).json({
      success: false,
      message: `Failed to fetch hospital data: ${error.message}`,
    });
  }
};

/**
 * Admin-only middleware (must follow verifyAccessToken)
 * Checks that the authenticated hospital has role === "admin"
 */
export const verifyAdmin = async (req, res, next) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const hospital = await Hospital.findById(hospitalId).select("role");
    if (!hospital || hospital.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden. Admin access required.",
      });
    }

    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Authorization check failed" });
  }
};

/**
 * Admin-or-self middleware (must follow verifyAccessToken)
 * Allows access if user is admin OR if the :id param matches the authenticated hospital
 */
export const verifyAdminOrSelf = async (req, res, next) => {
  try {
    const hospitalId = req.hospital?.id;
    const targetId = req.params.id;

    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    // Allow if updating own record
    if (hospitalId.toString() === targetId) {
      req.isSelf = true;
      return next();
    }

    // Otherwise, must be admin
    const hospital = await Hospital.findById(hospitalId).select("role");
    if (!hospital || hospital.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Forbidden. You can only access your own data.",
      });
    }

    req.isSelf = false;
    next();
  } catch (error) {
    return res.status(500).json({ success: false, message: "Authorization check failed" });
  }
};

export default {
  verifyAccessToken,
  verifyTempToken,
  attachHospitalData,
  verifyAdmin,
  verifyAdminOrSelf,
};
