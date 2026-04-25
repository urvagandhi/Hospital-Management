/**
 * Compression Service Client
 * Proxies PDF merge+compress requests to the Python compression service on Render.
 * Used when USE_COMPRESSION_SERVICE=true.
 */

import config from "../config/env.js";
import logger from "../utils/logger.js";

// ── Error Classes ──────────────────────────────────────────

export class SizeFloorError extends Error {
  constructor(minAchievableMb) {
    super(`Minimum achievable size: ${minAchievableMb} MB`);
    this.name = "SizeFloorError";
    this.minAchievableMb = minAchievableMb;
  }
}

export class SourceFetchError extends Error {
  constructor(failedPublicId, detail) {
    super(`Failed to fetch source: ${failedPublicId}`);
    this.name = "SourceFetchError";
    this.failedPublicId = failedPublicId;
    this.detail = detail;
  }
}

export class ServiceTimeoutError extends Error {
  constructor() {
    super("Compression service timed out");
    this.name = "ServiceTimeoutError";
  }
}

export class ServiceUnavailableError extends Error {
  constructor(detail) {
    super(detail || "Compression service unavailable");
    this.name = "ServiceUnavailableError";
  }
}

// ── Config ─────────────────────────────────────────────────

const SERVICE_URL = config.COMPRESSION_SERVICE_URL;
const SERVICE_SECRET = config.COMPRESSION_SERVICE_SECRET;
const TIMEOUT_MS = 300_000;

// ── Internal helper ────────────────────────────────────────

async function postToService(endpoint, body) {
  const url = `${SERVICE_URL}${endpoint}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": SERVICE_SECRET,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") throw new ServiceTimeoutError();
    throw new ServiceUnavailableError(err.message);
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return res.json();

  const errBody = await res.json().catch(() => ({}));

  if (res.status === 413) throw new SizeFloorError(errBody.min_achievable_mb);
  if (res.status === 502) throw new SourceFetchError(errBody.failed_public_id, errBody.detail);
  if (res.status === 504) throw new ServiceTimeoutError();
  logger.error(
    { event: "sidecar_503", status: res.status, body: errBody },
    `Compression service returned ${res.status}`,
  );
  throw new ServiceUnavailableError(`Compression service returned ${res.status}`);
}

// ── Public API ─────────────────────────────────────────────

/**
 * Compress a single folder's PDFs.
 * Returns { merged_url, content_hash, final_size_bytes, tier_used, cache_hit }
 */
export async function compressFolder({
  folderId,
  userId,
  patientId,
  patientName,
  displayName,
  filesInfo,
  sourcePdfs,
  targetSizeMb = 5,
}) {
  return postToService("/api/folder-download", {
    folder_id: folderId,
    user_id: userId,
    patient_id: patientId,
    patient_name: patientName || "",
    display_name: displayName || "",
    files_info: filesInfo || [],
    target_size_mb: targetSizeMb,
    source_pdfs: sourcePdfs.map((s) => ({
      public_id: s.public_id,
      uploaded_at: s.uploaded_at,
      resource_type: s.resource_type || "image",
      access_mode: s.access_mode || "signed",
    })),
  });
}

/**
 * Compress all folders for a patient (merged mode with cover pages).
 * Returns { merged_url, content_hash, final_size_bytes, tier_used, cache_hit }
 */
export async function compressPatient({
  patientId,
  userId,
  patientName,
  folderMap,
  targetSizeMb = 10,
}) {
  return postToService("/api/patient-download", {
    patient_id: patientId,
    user_id: userId,
    target_size_mb: targetSizeMb,
    folder_map: folderMap,
  });
}

/**
 * Fetch the merged PDF from the public Cloudinary URL returned by the
 * compression service. Merged PDFs are uploaded as raw/upload (public),
 * same as source documents — no signing needed.
 */
export async function fetchMergedStream(mergedUrl) {
  const res = await fetch(mergedUrl);
  if (!res.ok) {
    throw new ServiceUnavailableError(`Failed to fetch merged PDF: HTTP ${res.status}`);
  }
  return res;
}
