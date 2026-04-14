/**
 * Audit Log Controller — read-only, scoped to the caller's hospital.
 *
 * Security invariant: every query is forced to `userId = req.hospital.id`.
 * We never trust a client-supplied userId — doing so would let any hospital
 * admin read another hospital's logs.
 */

import AuditLog from "../models/AuditLog.js";

const MAX_LIMIT = 100;
const DEFAULT_LIMIT = 50;

export const listAudits = async (req, res) => {
  try {
    const hospitalId = req.hospital?.id;
    if (!hospitalId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { action, status, from, to, cursor } = req.query;
    const limit = Math.min(parseInt(req.query.limit, 10) || DEFAULT_LIMIT, MAX_LIMIT);

    // Validate date range
    let fromDate, toDate;
    if (from) {
      fromDate = new Date(from);
      if (isNaN(fromDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid 'from' date" });
      }
    }
    if (to) {
      toDate = new Date(to);
      if (isNaN(toDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid 'to' date" });
      }
    }
    if (fromDate && toDate && fromDate > toDate) {
      return res.status(400).json({ success: false, message: "'from' must be before 'to'" });
    }

    // Hospital-scoped query — this is the critical security line.
    const query = { userId: hospitalId };
    if (action) query.action = action;
    if (status) query.status = status;

    // createdAt range (combines with cursor below)
    const createdAt = {};
    if (fromDate) createdAt.$gte = fromDate;
    if (toDate) createdAt.$lte = toDate;

    // Cursor-based pagination: cursor = ISO timestamp of the last item returned.
    // We fetch records strictly older than the cursor.
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return res.status(400).json({ success: false, message: "Invalid cursor" });
      }
      createdAt.$lt = cursorDate;
    }
    if (Object.keys(createdAt).length > 0) query.createdAt = createdAt;

    const items = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();

    let nextCursor = null;
    if (items.length > limit) {
      items.pop();
      nextCursor = items[items.length - 1].createdAt.toISOString();
    }

    return res.json({ success: true, data: { items, nextCursor } });
  } catch (err) {
    console.error("[audit.controller] listAudits error:", err);
    return res.status(500).json({ success: false, message: "Failed to fetch audit logs" });
  }
};

export const listActions = async (_req, res) => {
  // Pull the enum directly from the schema so the frontend never drifts
  // from the backend's source of truth.
  const actions = AuditLog.schema.path("action").enumValues;
  return res.json({ success: true, data: actions });
};
