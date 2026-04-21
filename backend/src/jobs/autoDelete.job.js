/**
 * Auto-Delete Job
 * Deletes patient records older than 90 days
 */

import cron from "node-cron";
import { deleteOldPatients } from "../services/patient.service.js";
import AuditLog from "../models/AuditLog.js";
import logger from "../utils/logger.js";

const scheduleAutoDelete = () => {
  // Run every day at midnight (00:00)
  cron.schedule("0 0 * * *", async () => {
    logger.info({ event: "auto_delete_run_start" }, "[Auto-Delete Job] Starting daily cleanup...");
    try {
      const result = await deleteOldPatients(90);

      if (result.deletedCount > 0) {
        // Log to audit log
        await AuditLog.create({
          action: "AUTO_DELETE",
          status: "SUCCESS",
          details: {
            deletedPatients: result.deletedCount,
            deletedFiles: result.filesDeleted,
          },
          metadata: {
            job: "90-day-cleanup",
          },
        });
        logger.info(
          {
            event: "auto_delete_run_complete",
            deletedPatients: result.deletedCount,
            deletedFiles: result.filesDeleted,
          },
          `[Auto-Delete Job] Cleanup complete. Deleted ${result.deletedCount} patients.`
        );
      } else {
        logger.info({ event: "auto_delete_nothing_to_do" }, "[Auto-Delete Job] No patients to delete.");
      }
    } catch (error) {
      logger.error({ event: "auto_delete_failed", err: error }, "[Auto-Delete Job] Error");

      // Log failure
      await AuditLog.create({
        action: "AUTO_DELETE",
        status: "FAILURE",
        details: {
          error: error.message,
        },
        metadata: {
          job: "90-day-cleanup",
        },
      });
    }
  });

  logger.info({ event: "auto_delete_scheduled", cron: "0 0 * * *" }, "[Auto-Delete Job] Scheduled for 00:00 daily.");
};

export default scheduleAutoDelete;
