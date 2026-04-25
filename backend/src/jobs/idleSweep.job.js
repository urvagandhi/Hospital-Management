/**
 * Idle Session Sweep Job
 *
 * Server-side enforcement of the 15-min inactivity rule. The frontend's
 * useInactivityTimeout hook only fires while a tab is open — close the tab
 * and the session lingers in Mongo until the refresh-token TTL (365 days).
 * This job retires those abandoned rows on a 5-min cadence so:
 *   - Sessions list UI stays accurate.
 *   - The 2-mobile-session limit doesn't get blocked by ghosts.
 *   - Audit log records when each idle revoke happened.
 *
 * Threshold matches the client-side hook (15 min) so the two layers agree.
 */

import cron from "node-cron";
import Session from "../models/Session.js";
import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

const IDLE_MS = 15 * 60 * 1000;

const sweepIdleSessions = async () => {
  const cutoff = new Date(Date.now() - IDLE_MS);
  const now = new Date();

  // Pick up the rows first so we can audit-log per session before bulk update.
  const stale = await Session.find({
    isActive: true,
    revokedAt: null,
    lastSeenAt: { $lt: cutoff },
  })
    .select("_id hospitalId ipAddress userAgent lastSeenAt")
    .lean();

  if (stale.length === 0) return 0;

  await Session.updateMany(
    { _id: { $in: stale.map((s) => s._id) } },
    { isActive: false, revokedAt: now, revokedReason: "IDLE_TIMEOUT" },
  );

  // Fire-and-forget audit entries — never block the sweep on log write errors.
  for (const s of stale) {
    AuditLog.create({
      userId: s.hospitalId,
      action: "SESSION_IDLE_REVOKED",
      status: "SUCCESS",
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      details: {
        sessionId: String(s._id),
        lastSeenAt: s.lastSeenAt,
        idleMs: Date.now() - new Date(s.lastSeenAt).getTime(),
      },
    }).catch((e) =>
      logger.error(
        { event: "idle_sweep_audit_failed", sessionId: String(s._id), err: e },
        "[Idle Sweep] audit log failed",
      ),
    );
  }

  return stale.length;
};

const scheduleIdleSweep = () => {
  // Every 5 minutes. Cheap query (indexed on lastSeenAt via { isActive }+default
  // or a full collscan over typically-small Session collection).
  cron.schedule("*/5 * * * *", async () => {
    try {
      const revoked = await sweepIdleSessions();
      if (revoked > 0) {
        logger.info(
          { event: "idle_sweep_run", revokedCount: revoked },
          `[Idle Sweep] revoked ${revoked} idle session(s)`,
        );
      }
    } catch (error) {
      logger.error({ event: "idle_sweep_failed", err: error }, "[Idle Sweep] error");
    }
  });

  logger.info({ event: "idle_sweep_scheduled", intervalMin: 5, idleMin: 15 }, "[Idle Sweep] scheduled");
};

export default scheduleIdleSweep;
export { sweepIdleSessions };
