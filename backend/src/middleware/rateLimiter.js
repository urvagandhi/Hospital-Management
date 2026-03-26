/**
 * Rate Limiting Middleware
 * Prevents abuse and brute force attacks
 */

import rateLimit from "express-rate-limit";
import config from "../config/env.js";

/**
 * General API rate limiter (relaxed in dev)
 */
export const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.NODE_ENV === "development" ? 200 : config.RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: config.NODE_ENV === "development" ? 50 : 5,
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for OTP/TOTP endpoints
 */
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.NODE_ENV === "development" ? 20 : 3,
  message: "Too many OTP requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for patient download endpoints
 */
export const patientLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.NODE_ENV === "development" ? 50 : 10,
  message: "Too many download requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
});

export default {
  generalLimiter,
  authLimiter,
  otpLimiter,
  patientLimiter,
};
