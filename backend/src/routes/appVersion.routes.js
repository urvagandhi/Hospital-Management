/**
 * App Version Routes
 * Public GET for clients; admin writes for version management.
 */

import express from "express";
import { getVersion } from "../controllers/appVersion.controller.js";

const router = express.Router();

// Public — Android clients call this on launch for force-update check.
// Admin write endpoints removed: version rows are managed via
// `backend/scripts/manage-app-version.js` (dev-only tool).
router.get("/", getVersion);

export default router;
