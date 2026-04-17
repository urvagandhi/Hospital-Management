/**
 * Admin Routes
 * Protected by verifyAccessToken + verifyAdmin.
 */

import express from 'express';
import { verifyAccessToken, verifyAdmin } from '../middleware/auth.js';
import { scanOrphans, deleteOrphans } from '../controllers/admin.controller.js';

const router = express.Router();

router.use(verifyAccessToken);
router.use(verifyAdmin);

/**
 * GET /api/admin/cloudinary/orphans
 * Dry-run: list Cloudinary files with no matching patient DB record.
 */
router.get('/cloudinary/orphans', scanOrphans);

/**
 * DELETE /api/admin/cloudinary/orphans
 * Delete orphaned Cloudinary files. Requires { confirm: true } in body.
 */
router.delete('/cloudinary/orphans', deleteOrphans);

export default router;
