/**
 * Rate Limiting Middleware
 * Prevents abuse and brute force attacks
 */

import rateLimit from "express-rate-limit";
import config from "../config/env.js";

/**
 * General API rate limiter
 */
export const generalLimiter = rateLimit({
  windowMs: config.RATE_LIMIT_WINDOW_MS,
  max: config.RATE_LIMIT_MAX_REQUESTS,
  message: "Too many requests from this IP, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.NODE_ENV === "development",
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 requests per windowMs
  message: "Too many login attempts, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.NODE_ENV === "development",
});

/**
 * Rate limiter for OTP endpoints
 */
export const otpLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Limit each IP to 3 OTP requests per minute
  message: "Too many OTP requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.NODE_ENV === "development",
});

/**
 * Rate limiter for patient download endpoints
 */
export const patientLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Limit each IP to 10 download requests per minute
  message: "Too many download requests, please try again later.",
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => config.NODE_ENV === "development",
});

export default {
  generalLimiter,
  authLimiter,
  otpLimiter,
  patientLimiter,
};
