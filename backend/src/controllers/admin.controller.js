/**
 * Admin Controller
 * Cloudinary orphan cleanup — scans for files stored in Cloudinary that have
 * no matching storageKey in any Patient document.
 *
 * Two endpoints:
 *   GET  /api/admin/cloudinary/orphans        — dry run: list orphans
 *   DELETE /api/admin/cloudinary/orphans      — actually delete them (requires confirm:true in body)
 */

import AuditLog from '../models/AuditLog.js';
import Patient from '../models/Patient.js';
import { deleteFile, listCloudinaryResources } from '../services/storage.service.js';
import getClientIp from '../utils/clientIp.js';

// Prefixes to scan — all resource types that have ever been used.
// Cloudinary keeps raw and image in separate buckets; both must be checked.
const SCAN_PREFIXES = [
  { prefix: 'MyMediVault', resourceType: 'raw' },
  { prefix: 'MyMediVault', resourceType: 'image' },
  { prefix: 'hospital/documents', resourceType: 'raw' },
  { prefix: 'hospital/documents', resourceType: 'image' },
  { prefix: 'hospital/uploads', resourceType: 'raw' },
  { prefix: 'hospital/uploads', resourceType: 'image' },
  { prefix: 'HospitALL', resourceType: 'raw' },
  { prefix: 'HospitALL', resourceType: 'image' },
];

/**
 * Build a Set of all storage keys stored in MongoDB across all patients.
 * Reads both `storageKey` (new) and `cloudinaryPublicId` (legacy, pre-migration)
 * so the orphan scan never deletes a file that's still referenced under either name.
 */
async function getAllStoredPublicIds() {
  const patients = await Patient.find({})
    .select('folders.files.storageKey folders.files.cloudinaryPublicId')
    .lean();
  const ids = new Set();
  for (const patient of patients) {
    for (const folder of patient.folders || []) {
      for (const file of folder.files || []) {
        if (file.storageKey) ids.add(file.storageKey);
        if (file.cloudinaryPublicId) ids.add(file.cloudinaryPublicId);
      }
    }
  }
  return ids;
}

/**
 * GET /api/admin/cloudinary/orphans
 * Lists Cloudinary files not referenced by any patient record.
 * Safe read-only operation.
 */
export const scanOrphans = async (req, res) => {
  try {
    req.log.info({ event: "orphan_scan_started" }, "[Admin] Starting orphan scan...");

    const storedIds = await getAllStoredPublicIds();
    req.log.info({ event: "orphan_scan_db_ids", count: storedIds.size }, `[Admin] DB has ${storedIds.size} storage keys`);

    const orphans = [];
    let cloudinaryTotal = 0;

    for (const { prefix, resourceType } of SCAN_PREFIXES) {
      let resources;
      try {
        resources = await listCloudinaryResources(prefix, resourceType);
      } catch (err) {
        // Prefix may not exist yet — skip silently
        req.log.warn({ event: "orphan_scan_prefix_list_failed", prefix, err }, `[Admin] Could not list prefix "${prefix}": ${err.message}`);
        continue;
      }
      cloudinaryTotal += resources.length;

      for (const resource of resources) {
        if (!storedIds.has(resource.public_id)) {
          orphans.push({
            publicId: resource.public_id,
            resourceType,
            bytes: resource.bytes,
            createdAt: resource.created_at,
            url: resource.secure_url,
          });
        }
      }
    }

    const totalOrphanBytes = orphans.reduce((sum, o) => sum + (o.bytes || 0), 0);

    req.log.info(
      { event: "orphan_scan_complete", cloudinary_total: cloudinaryTotal, orphan_count: orphans.length },
      `[Admin] Scan complete. Cloudinary total: ${cloudinaryTotal}, orphans: ${orphans.length}`,
    );

    return res.json({
      success: true,
      data: {
        cloudinaryTotal,
        dbReferencedCount: storedIds.size,
        orphanCount: orphans.length,
        orphanTotalMB: (totalOrphanBytes / 1024 / 1024).toFixed(2),
        orphans,
      },
    });
  } catch (err) {
    req.log.error({ event: "orphan_scan_error", err }, "[Admin] Orphan scan error");
    return res.status(500).json({ success: false, message: 'Orphan scan failed', error: err.message });
  }
};

/**
 * DELETE /api/admin/cloudinary/orphans
 * Deletes all Cloudinary files not referenced by any patient record.
 *
 * Body: { confirm: true }   — required safety gate
 *
 * Without confirm:true the endpoint refuses to delete anything.
 */
export const deleteOrphans = async (req, res) => {
  try {
    const { confirm } = req.body || {};

    if (confirm !== true) {
      return res.status(400).json({
        success: false,
        message: 'Set { "confirm": true } in the request body to proceed with deletion.',
      });
    }

    req.log.info({ event: "orphan_delete_started" }, "[Admin] Starting orphan deletion (confirmed)...");

    const storedIds = await getAllStoredPublicIds();

    const deleted = [];
    const failed = [];
    let cloudinaryTotal = 0;

    for (const { prefix, resourceType } of SCAN_PREFIXES) {
      let resources;
      try {
        resources = await listCloudinaryResources(prefix, resourceType);
      } catch (err) {
        req.log.warn({ event: "orphan_delete_prefix_list_failed", prefix, err }, `[Admin] Could not list prefix "${prefix}": ${err.message}`);
        continue;
      }
      cloudinaryTotal += resources.length;

      for (const resource of resources) {
        if (!storedIds.has(resource.public_id)) {
          const result = await deleteFile(resource.public_id, resourceType);
          if (result.success) {
            deleted.push({ publicId: resource.public_id, bytes: resource.bytes });
          } else {
            failed.push({ publicId: resource.public_id, error: result.error });
          }
        }
      }
    }

    const deletedBytes = deleted.reduce((sum, d) => sum + (d.bytes || 0), 0);

    req.log.info(
      { event: "orphan_delete_complete", deleted_count: deleted.length, failed_count: failed.length },
      `[Admin] Deletion complete. Deleted: ${deleted.length}, Failed: ${failed.length}`,
    );

    // Fire-and-forget audit log — admin-initiated bulk Cloudinary cleanup.
    AuditLog.create({
      userId: req.hospital?.id,
      action: "ORPHAN_CLEANUP",
      status: failed.length === 0 ? "SUCCESS" : "FAILURE",
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"],
      details: {
        cloudinaryTotal,
        dbReferencedCount: storedIds.size,
        deletedCount: deleted.length,
        deletedBytes,
        failedCount: failed.length,
      },
    }).catch((e) => req.log.error({ event: "audit_log_orphan_cleanup_failed", err: e }, "[AuditLog] orphan cleanup"));

    return res.json({
      success: true,
      data: {
        cloudinaryTotal,
        deletedCount: deleted.length,
        deletedMB: (deletedBytes / 1024 / 1024).toFixed(2),
        failedCount: failed.length,
        deleted,
        failed,
      },
    });
  } catch (err) {
    req.log.error({ event: "orphan_delete_error", err }, "[Admin] Orphan deletion error");
    return res.status(500).json({ success: false, message: 'Orphan deletion failed', error: err.message });
  }
};
