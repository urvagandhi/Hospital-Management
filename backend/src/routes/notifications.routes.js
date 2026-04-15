/**
 * Notifications Routes
 * Test and preview push notification payloads.
 */

import express from "express";
import { body } from "express-validator";
import { verifyAccessToken } from "../middleware/auth.js";
import { handleValidationErrors } from "../middleware/validateRequest.js";
import { sendTestNotification, previewNotifications, sampleNotifications } from "../controllers/notifications.controller.js";

const router = express.Router();

/**
 * GET /api/notifications/sample
 * Renders a visual HTML mockup of all notification types in a phone shell.
 * No auth required — same concept as GET /api/export/sample-cover.
 * Pass ?userAgent=<string> to test the UA parser with a specific device string.
 */
router.get("/sample", sampleNotifications);

/**
 * GET /api/notifications/preview
 * Returns all notification templates as JSON — no push sent, no auth required.
 */
router.get("/preview", previewNotifications);

/**
 * POST /api/notifications/test
 * Sends a real push notification to the authenticated user's registered device.
 * Body: { type, userAgent?, title?, body? }
 */
router.post(
  "/test",
  verifyAccessToken,
  [
    body("type")
      .optional()
      .isIn(["NEW_LOGIN", "SESSION_REVOKED", "PASSWORD_CHANGED", "CUSTOM"])
      .withMessage("type must be one of: NEW_LOGIN, SESSION_REVOKED, PASSWORD_CHANGED, CUSTOM"),
    body("title")
      .if(body("type").equals("CUSTOM"))
      .notEmpty()
      .withMessage("title is required for CUSTOM type"),
    body("body")
      .if(body("type").equals("CUSTOM"))
      .notEmpty()
      .withMessage("body is required for CUSTOM type"),
  ],
  handleValidationErrors,
  sendTestNotification
);

export default router;
