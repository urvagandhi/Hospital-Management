/**
 * Cloudinary -> DigitalOcean Spaces migration
 *
 * For every patient file with storageProvider !== "digitalocean":
 *   1. Mint a Cloudinary download URL (handles public + authenticated assets).
 *   2. Stream the bytes.
 *   3. Upload to Spaces using the SAME key as cloudinaryPublicId — buildSignedUrl()
 *      keys off cloudinaryPublicId, so reusing it means no DB key rewrite is needed.
 *   4. HeadObject verify (size match).
 *   5. Flip file.storageProvider = "digitalocean" and rewrite file.fileUrl to match
 *      what the live upload path produces (uploadToSpaces in storage.service.js).
 *   6. Save patient.
 *
 * Idempotent: re-running skips already-migrated files.
 * Does NOT delete from Cloudinary. Run a separate verify+delete pass after
 * this completes and the app is confirmed healthy on DO Spaces.
 *
 * Usage:
 *   node scripts/migrate-cloudinary-to-spaces.js [flags]
 *
 * Flags:
 *   --dry-run                 Plan only, no downloads/uploads/DB writes.
 *   --concurrency=<n>         Parallel files per patient (default 5).
 *   --hospital=<objectId>     Only migrate one hospital's patients.
 *   --patient=<objectId>      Only migrate one specific patient (overrides --hospital).
 *   --limit=<n>               Stop after migrating N files (across all patients).
 *   --manifest=<path>         Where to write the per-file result manifest
 *                             (default: backend/scripts/.migration-manifest-<timestamp>.json).
 */

import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import dotenv from "dotenv";

// ── Load env from backend/.env or repo-root .env ─────────────────────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];
const envPath = envCandidates.find((p) => fs.existsSync(p));
if (envPath) {
  dotenv.config({ path: envPath });
  console.log(`[env] Loaded ${envPath}`);
} else {
  console.warn(`[env] No .env file found in ${envCandidates.join(", ")} — relying on shell env`);
}

// ── CLI args ─────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { dryRun: false, concurrency: 5, hospital: null, patient: null, limit: Infinity, manifest: null };
  for (const a of argv.slice(2)) {
    if (a === "--dry-run") out.dryRun = true;
    else if (a.startsWith("--concurrency=")) out.concurrency = Math.max(1, parseInt(a.split("=")[1], 10) || 5);
    else if (a.startsWith("--hospital=")) out.hospital = a.split("=")[1];
    else if (a.startsWith("--patient=")) out.patient = a.split("=")[1];
    else if (a.startsWith("--limit=")) out.limit = Math.max(1, parseInt(a.split("=")[1], 10) || Infinity);
    else if (a.startsWith("--manifest=")) out.manifest = a.split("=")[1];
    else {
      console.error(`Unknown flag: ${a}`);
      process.exit(2);
    }
  }
  if (!out.manifest) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    out.manifest = path.resolve(__dirname, `.migration-manifest-${stamp}.json`);
  }
  return out;
}

const args = parseArgs(process.argv);

// ── Required env ─────────────────────────────────────────────────────────────
const required = [
  "MONGODB_URI",
  "CLOUDINARY_CLOUD_NAME",
  "CLOUDINARY_API_KEY",
  "CLOUDINARY_API_SECRET",
  "DO_SPACES_ENDPOINT",
  "DO_SPACES_ACCESS_KEY_ID",
  "DO_SPACES_SECRET_ACCESS_KEY",
];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`[env] Missing required vars: ${missing.join(", ")}`);
  process.exit(1);
}

// ── Dynamic imports (after env is loaded) ────────────────────────────────────
const { default: mongoose } = await import("mongoose");
const { v2: cloudinary } = await import("cloudinary");
const { S3Client, PutObjectCommand, HeadObjectCommand } = await import("@aws-sdk/client-s3");
const { default: Patient } = await import("../src/models/Patient.js");

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const DO_BUCKET = process.env.DO_SPACES_BUCKET || "spacesmymedivault";
const s3 = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT,
  region: process.env.DO_SPACES_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY_ID,
    secretAccessKey: process.env.DO_SPACES_SECRET_ACCESS_KEY,
  },
});

// ── Helpers ──────────────────────────────────────────────────────────────────
/**
 * Mint a fetchable Cloudinary URL for a file regardless of access mode.
 * - public assets: stored fileUrl works directly
 * - signed/authenticated assets: must mint a fresh signed URL
 */
function cloudinaryDownloadUrl(file) {
  if (file.accessMode !== "signed") {
    return file.fileUrl;
  }
  const expiresAt = Math.floor(Date.now() / 1000) + 600; // 10 min, plenty
  return cloudinary.url(file.cloudinaryPublicId, {
    resource_type: file.resourceType || "raw",
    type: "authenticated",
    sign_url: true,
    secure: true,
    expires_at: expiresAt,
  });
}

/** Build the same fileUrl format the live upload path produces. */
function spacesUrlFor(key) {
  return `${process.env.DO_SPACES_ENDPOINT}/${DO_BUCKET}/${key}`;
}

async function downloadBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Cloudinary fetch failed (${res.status} ${res.statusText}): ${url}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function putToSpaces(key, buffer, contentType) {
  await s3.send(
    new PutObjectCommand({
      Bucket: DO_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType || "application/octet-stream",
      ACL: "private",
    }),
  );
}

async function headSize(key) {
  const out = await s3.send(new HeadObjectCommand({ Bucket: DO_BUCKET, Key: key }));
  return out.ContentLength ?? null;
}

/**
 * Fixed-size async pool: maps `worker(item)` over `items` with at most `n` in flight.
 * Avoids adding a p-limit dependency.
 */
async function asyncPool(n, items, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { ok: true, value: await worker(items[i], i) };
      } catch (err) {
        results[i] = { ok: false, error: err };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("──────────────────────────────────────────────");
  console.log("Cloudinary -> DigitalOcean Spaces migration");
  console.log("──────────────────────────────────────────────");
  console.log(`Mode:        ${args.dryRun ? "DRY RUN" : "LIVE"}`);
  console.log(`Concurrency: ${args.concurrency} files/patient`);
  console.log(`Bucket:      ${DO_BUCKET}`);
  console.log(`Endpoint:    ${process.env.DO_SPACES_ENDPOINT}`);
  if (args.hospital) console.log(`Hospital:    ${args.hospital}`);
  if (args.patient) console.log(`Patient:     ${args.patient}`);
  if (args.limit !== Infinity) console.log(`Limit:       ${args.limit} files`);
  console.log(`Manifest:    ${args.manifest}`);
  console.log("──────────────────────────────────────────────\n");

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("[db] connected");

  const query = {};
  if (args.patient) query._id = args.patient;
  else if (args.hospital) query.hospitalId = args.hospital;

  const total = await Patient.countDocuments(query);
  console.log(`[db] ${total} patient(s) match scope\n`);

  const manifest = [];
  const stats = { patientsTouched: 0, filesTotal: 0, migrated: 0, skipped: 0, failed: 0 };
  const cursor = Patient.find(query).cursor();

  outer: for await (const patient of cursor) {
    const candidates = [];
    for (const folder of patient.folders || []) {
      for (const file of folder.files || []) {
        stats.filesTotal++;
        if (!file.cloudinaryPublicId) {
          stats.skipped++;
          manifest.push({
            patientId: String(patient._id),
            fileId: String(file._id),
            fileName: file.fileName,
            status: "skip",
            reason: "no_public_id",
          });
          continue;
        }
        if (file.storageProvider === "digitalocean") {
          stats.skipped++;
          continue; // already migrated
        }
        candidates.push({ folder, file });
      }
    }

    if (candidates.length === 0) continue;

    console.log(
      `[patient ${patient.patientId} / ${patient._id}] ${candidates.length} file(s) to migrate`,
    );

    let patientChanged = false;
    const results = await asyncPool(args.concurrency, candidates, async ({ folder, file }) => {
      if (stats.migrated >= args.limit) {
        return { skipped: true, reason: "limit_reached" };
      }

      const key = file.cloudinaryPublicId;
      const downloadUrl = cloudinaryDownloadUrl(file);

      if (args.dryRun) {
        return { dryRun: true, key, contentType: file.mimeType, size: file.size };
      }

      // Download from Cloudinary
      const buffer = await downloadBuffer(downloadUrl);

      // Upload to Spaces with same key
      await putToSpaces(key, buffer, file.mimeType);

      // Verify
      const remoteSize = await headSize(key);
      if (remoteSize == null || remoteSize !== buffer.length) {
        throw new Error(
          `Verify failed for ${key}: head=${remoteSize}, downloaded=${buffer.length}`,
        );
      }

      // Mutate the embedded subdoc in place; save patient once after the pool finishes
      file.storageProvider = "digitalocean";
      file.fileUrl = spacesUrlFor(key);
      // thumbnailUrl was a Cloudinary transformation URL — DO has no equivalent.
      // Clear it so the FE treats the file like other DO uploads (no thumb).
      if (file.thumbnailUrl) file.thumbnailUrl = null;
      patientChanged = true;

      return { key, size: buffer.length, fileUrl: file.fileUrl };
    });

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const { folder, file } = candidates[i];
      const base = {
        patientId: String(patient._id),
        folder: folder.name,
        fileId: String(file._id),
        fileName: file.fileName,
        publicId: file.cloudinaryPublicId,
      };
      if (!r.ok) {
        stats.failed++;
        manifest.push({ ...base, status: "fail", error: String(r.error?.message || r.error) });
        console.error(`  ✗ ${file.fileName}: ${r.error?.message || r.error}`);
      } else if (r.value?.skipped) {
        stats.skipped++;
        manifest.push({ ...base, status: "skip", reason: r.value.reason });
      } else if (r.value?.dryRun) {
        stats.migrated++;
        manifest.push({ ...base, status: "dryrun", key: r.value.key });
      } else {
        stats.migrated++;
        manifest.push({ ...base, status: "ok", key: r.value.key, size: r.value.size });
        console.log(`  ✓ ${file.fileName} (${r.value.size} bytes)`);
      }
    }

    if (patientChanged && !args.dryRun) {
      try {
        await patient.save();
      } catch (err) {
        // Roll the patient's manifest entries to a save-failed status — the bytes
        // are on Spaces but the DB still says cloudinary. Re-running will overwrite
        // the same keys (idempotent) and re-attempt the save.
        console.error(`  [patient save failed] ${err.message}`);
        stats.failed++;
        manifest.push({
          patientId: String(patient._id),
          status: "patient_save_failed",
          error: err.message,
        });
      }
    }

    stats.patientsTouched++;
    if (stats.migrated >= args.limit) break outer;
  }

  fs.writeFileSync(args.manifest, JSON.stringify({ stats, args, manifest }, null, 2));

  console.log("\n──────────────────────────────────────────────");
  console.log(`Patients touched: ${stats.patientsTouched}`);
  console.log(`Files seen:       ${stats.filesTotal}`);
  console.log(`Migrated:         ${stats.migrated}`);
  console.log(`Skipped:          ${stats.skipped}`);
  console.log(`Failed:           ${stats.failed}`);
  console.log(`Manifest:         ${args.manifest}`);
  console.log("──────────────────────────────────────────────");

  await mongoose.disconnect();
  process.exit(stats.failed > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("Migration aborted:", err);
  try {
    await mongoose.disconnect();
  } catch {}
  process.exit(1);
});
