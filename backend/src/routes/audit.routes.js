/**
 * Audit Log Routes — admin only, hospital-scoped.
 */

import express from "express";
import { listActions, listAudits } from "../controllers/audit.controller.js";
import { verifyAccessToken, verifyAdmin } from "../middleware/auth.js";

const router = express.Router();

router.get("/actions", verifyAccessToken, verifyAdmin, listActions);
router.get("/", verifyAccessToken, verifyAdmin, listAudits);

export default router;
