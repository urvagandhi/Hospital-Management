/**
 * Backfill `storageKey` on every patient file.
 *
 * Why: the schema field used to be called `cloudinaryPublicId` even for files
 * uploaded to DigitalOcean Spaces. After the rename to provider-neutral
 * `storageKey`, existing rows fall into one of three states:
 *
 *   A. New rows (post-rename)     → `storageKey` already set, nothing to do.
 *   B. Cloudinary-era rows        → only `cloudinaryPublicId` set; just copy
 *                                    it across.
 *   C. Spaces rows uploaded via a
 *      direct-presigned PUT path
 *      that never stamped the key  → both fields missing; reconstruct the key
 *                                    from the file URL by stripping the
 *                                    leading `<scheme>://<host>/<bucket>/`.
 *
 * State C is what was producing 400 "File has no cloud storage ID" / "No
 * files in folder" on the Android client when opening or downloading
 * documents.
 *
 * Defaults to dry-run. Pass --apply to write changes.
 *
 * Usage:
 *   node scripts/backfill-storage-keys.js                     # dry-run report
 *   node scripts/backfill-storage-keys.js --apply             # actually write
 *   node scripts/backfill-storage-keys.js --apply --cleanup   # also $unset legacy field
 *   node scripts/backfill-storage-keys.js --patient=<oid>     # scope to one patient
 */

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envCandidates = [
  path.resolve(__dirname, "../.env"),
  path.resolve(__dirname, "../../.env"),
];
for (const p of envCandidates) {
  dotenv.config({ path: p, override: false });
}

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(?:=(.*))?$/);
    return m ? [m[1], m[2] ?? true] : [a, true];
  }),
);

const APPLY = !!args.apply;
const CLEANUP = !!args.cleanup;
const PATIENT_FILTER = args.patient || null;
const BUCKET = process.env.DO_SPACES_BUCKET || "spacesmymedivault";

const { default: mongoose } = await import("mongoose");
const { default: Patient } = await import("../src/models/Patient.js");

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("MONGODB_URI not set");
  process.exit(1);
}

await mongoose.connect(MONGO_URI);

// Strip "https://<host>/<bucket>/" → returns the S3 key, or null if the URL
// doesn't fit the Spaces shape we know how to parse.
function deriveKeyFromUrl(fileUrl) {
  if (!fileUrl) return null;
  try {
    const u = new URL(fileUrl);
    const pathname = decodeURIComponent(u.pathname).replace(/^\/+/, "");
    // Path-style URL: <bucket>/<key>
    if (pathname.startsWith(`${BUCKET}/`)) {
      return pathname.substring(BUCKET.length + 1);
    }
    // Virtual-hosted URL: bucket is in the host, pathname is just the key.
    if (u.hostname.startsWith(`${BUCKET}.`)) {
      return pathname;
    }
    // Cloudinary fallback: /<cloud>/raw/upload/<public_id> — rare; the public
    // id is everything after `/upload/`.
    const idx = pathname.indexOf("/upload/");
    if (idx !== -1) return pathname.substring(idx + "/upload/".length);
    return null;
  } catch {
    return null;
  }
}

const filter = PATIENT_FILTER ? { _id: PATIENT_FILTER } : {};
const cursor = Patient.find(filter).cursor();

let scanned = 0;
let alreadyOk = 0;
let copiedFromLegacy = 0;
let derivedFromUrl = 0;
let unfixable = 0;
const unfixableSamples = [];

for await (const patient of cursor) {
  let dirty = false;

  for (const folder of patient.folders || []) {
    for (const file of folder.files || []) {
      scanned += 1;

      // The post-init hook on fileSchema already populated storageKey from
      // cloudinaryPublicId at read time, so `file.storageKey` here reflects
      // the effective value. We still need to PERSIST that value back to
      // disk for downstream paths that read raw documents (`.lean()` etc.).
      if (file.storageKey) {
        // Need to persist if it came from the post-init hook (i.e. was only
        // in cloudinaryPublicId on disk). Cheapest signal: if storageKey is
        // set but cloudinaryPublicId is also set and equal, it came from
        // the hook. Mark dirty so save() persists it.
        if (file.cloudinaryPublicId && file.cloudinaryPublicId === file.storageKey) {
          // storageKey is virtual-from-hook; persist it.
          file.markModified("storageKey");
          dirty = true;
          copiedFromLegacy += 1;
        } else {
          alreadyOk += 1;
        }
        continue;
      }

      // No storageKey from any source — try to derive from fileUrl.
      const derived = deriveKeyFromUrl(file.fileUrl);
      if (derived) {
        file.storageKey = derived;
        dirty = true;
        derivedFromUrl += 1;
      } else {
        unfixable += 1;
        if (unfixableSamples.length < 10) {
          unfixableSamples.push({
            patientId: patient._id.toString(),
            folder: folder.name,
            fileName: file.fileName,
            fileUrl: file.fileUrl,
          });
        }
      }
    }
  }

  if (CLEANUP && dirty) {
    // Remove the legacy field so the schema can drop it later.
    for (const folder of patient.folders || []) {
      for (const file of folder.files || []) {
        if (file.cloudinaryPublicId) {
          file.cloudinaryPublicId = undefined;
        }
      }
    }
  }

  if (dirty && APPLY) {
    await patient.save();
  }
}

const summary = {
  mode: APPLY ? "APPLY" : "DRY-RUN",
  cleanup: CLEANUP,
  scanned,
  alreadyOk,
  copiedFromLegacy,
  derivedFromUrl,
  unfixable,
  unfixableSamples,
};
console.log(JSON.stringify(summary, null, 2));

await mongoose.disconnect();
