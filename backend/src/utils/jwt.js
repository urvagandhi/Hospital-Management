/**
 * JWT Utility Functions
 * Handles creation and verification of JWT tokens
 */

import jwt from "jsonwebtoken";
import config from "../config/env.js";

/**
 * Generate JWT access token
 * @param {string} hospitalId - Hospital ID
 * @returns {string} JWT token
 */
export const generateAccessToken = (hospitalId) => {
  try {
    const token = jwt.sign({ id: hospitalId, type: "access" }, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRY });
    return token;
  } catch (error) {
    throw new Error(`Token generation failed: ${error.message}`);
  }
};

/**
 * Generate JWT refresh token
 * @param {string} hospitalId - Hospital ID
 * @returns {string} Refresh token
 */
export const generateRefreshToken = (hospitalId) => {
  try {
    const token = jwt.sign({ id: hospitalId, type: "refresh" }, config.REFRESH_TOKEN_SECRET, { expiresIn: config.REFRESH_TOKEN_EXPIRY });
    return token;
  } catch (error) {
    throw new Error(`Refresh token generation failed: ${error.message}`);
  }
};

/**
 * Generate temporary token for OTP verification
 * 🔑 [SECURITY] Purpose-Scoped Temp Tokens
 *
 * @param {string} hospitalId - Hospital ID
 * @param {string} purpose - Token purpose (e.g., 'TOTP_LOGIN')
 * @returns {string} Temporary token valid for 10 minutes
 */
export const generateTempToken = (hospitalId, purpose = "TOTP_LOGIN") => {
  try {
    const token = jwt.sign(
      {
        id: hospitalId,
        type: "temp",
        purpose: purpose  // Single-purpose token
      },
      config.JWT_SECRET,
      { expiresIn: "10m" }
    );
    return token;
  } catch (error) {
    throw new Error(`Temporary token generation failed: ${error.message}`);
  }
};

/**
 * Verify temp token and check purpose
 * 🔑 [SECURITY] Rejects tokens with mismatched purpose
 *
 * @param {string} token - Temp token to verify
 * @param {string} expectedPurpose - Expected token purpose
 * @returns {object} Decoded token payload
 * @throws {Error} If token is invalid or purpose doesn't match
 */
export const verifyTempTokenPurpose = (token, expectedPurpose = "TOTP_LOGIN") => {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Verify token type
    if (decoded.type !== "temp") {
      throw new Error("Invalid token type");
    }

    // Verify purpose matches
    if (decoded.purpose !== expectedPurpose) {
      throw new Error(`Token purpose mismatch: expected ${expectedPurpose}, got ${decoded.purpose}`);
    }

    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw error;
  }
};

/**
 * Verify JWT token
 * @param {string} token - Token to verify
 * @param {string} secret - Secret key (uses JWT_SECRET by default)
 * @returns {object} Decoded token payload
 */
export const verifyToken = (token, secret = config.JWT_SECRET) => {
  try {
    const decoded = jwt.verify(token, secret);
    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      throw new Error("Token has expired");
    }
    if (error.name === "JsonWebTokenError") {
      throw new Error("Invalid token");
    }
    throw new Error(`Token verification failed: ${error.message}`);
  }
};

/**
 * Verify refresh token
 * @param {string} token - Refresh token
 * @returns {object} Decoded token payload
 */
export const verifyRefreshToken = (token) => {
  return verifyToken(token, config.REFRESH_TOKEN_SECRET);
};

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Token or null
 */
export const extractTokenFromHeader = (authHeader) => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7); // Remove "Bearer " prefix
};

export default {
  generateAccessToken,
  generateRefreshToken,
  generateTempToken,
  verifyTempTokenPurpose,
  verifyToken,
  verifyRefreshToken,
  extractTokenFromHeader,
};

