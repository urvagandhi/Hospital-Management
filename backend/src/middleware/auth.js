/**
 * Authentication Middleware
 * Verifies JWT tokens and attaches hospital data to request
 */

import Hospital from "../models/Hospital.js";
import { extractTokenFromHeader, verifyToken } from "../utils/jwt.js";

/**
 * Verify JWT token middleware
 */
export const verifyAccessToken = (req, res, next) => {
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

    req.hospital = { id: decoded.id };
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Verify temporary token (for TOTP verification)
 * 🔑 [SECURITY] Validates purpose scope for single-use tokens
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

    // Verify token type
    if (decoded.type !== "temp") {
      return res.status(401).json({
        success: false,
        message: "Invalid token type. Use temporary token for TOTP verification.",
      });
    }

    // 🔑 [SECURITY] Verify purpose scope
    // Temp tokens must have purpose=TOTP_LOGIN for login/totp and login/recovery routes
    if (decoded.purpose && decoded.purpose !== "TOTP_LOGIN") {
      return res.status(401).json({
        success: false,
        message: "Token purpose mismatch. Invalid token for this operation.",
      });
    }

    req.hospital = { id: decoded.id };
    req.tokenPurpose = decoded.purpose || "TOTP_LOGIN"; // For backward compatibility
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
    console.log("[Auth Middleware] attachHospitalData - hospitalId from token:", hospitalId);

    if (!hospitalId) {
      return res.status(401).json({
        success: false,
        message: "Hospital ID not found in token",
      });
    }

    const hospital = await Hospital.findById(hospitalId);
    console.log("[Auth Middleware] Hospital found:", hospital?._id, hospital?.hospitalName);

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
    console.error("[Auth Middleware] attachHospitalData error:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to fetch hospital data: ${error.message}`,
    });
  }
};

export default {
  verifyAccessToken,
  verifyTempToken,
  attachHospitalData,
};
