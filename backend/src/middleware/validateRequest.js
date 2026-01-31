/**
 * Request Validation Middleware
 * Handles request validation using express-validator
 */

import { validationResult } from "express-validator";

/**
 * Middleware to handle validation errors
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: errors.array().map((err) => ({
        field: err.param,
        message: err.msg,
      })),
    });
  }

  next();
};

/**
 * Middleware to sanitize request data
 */
export const sanitizeRequest = (req, res, next) => {
  // Remove extra whitespace from strings
  const sanitize = (obj) => {
    if (typeof obj === "string") {
      return obj.trim();
    }
    if (typeof obj === "object" && obj !== null) {
      Object.keys(obj).forEach((key) => {
        obj[key] = sanitize(obj[key]);
      });
    }
    return obj;
  };

  req.body = sanitize(req.body);
  req.query = sanitize(req.query);
  req.params = sanitize(req.params);

  next();
};

export default {
  handleValidationErrors,
  sanitizeRequest,
};
