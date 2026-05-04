# MediVault Compression Service

FastAPI service that merges and compresses medical PDFs on demand. Called exclusively by the Node backend via shared secret header (`X-Internal-Secret`).

Canonical project context: [../CLAUDE.md](../CLAUDE.md). Backend client: [../backend/src/services/compression.service.js](../backend/src/services/compression.service.js).

**Mandatory in production (TD-D4, 2026-04-25):** the backend's [config/env.js](../backend/src/config/env.js) refuses to boot when `NODE_ENV=production` AND `USE_COMPRESSION_SERVICE !== "true"`. The in-process pdf-lib fallback OOMs at scale on large patients; the sidecar is the only safe production path.

## Deployment

**Target:** DigitalOcean droplet under Docker Compose (production), with local MongoDB on the host and the backend as the only caller

### Required Environment Variables

| Variable                | Description                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `INTERNAL_API_SECRET`   | Shared secret for `X-Internal-Secret` header validation (matches backend `COMPRESSION_SERVICE_SECRET`) |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name                                                                                  |
| `CLOUDINARY_API_KEY`    | Cloudinary API key                                                                                     |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret                                                                                  |
| `MONGO_URI`             | MongoDB connection string (must include default database)                                              |
| `PORT`                  | Set automatically by the deployment environment                                                        |

### Docker Build

```bash
cd compression-service
docker build -t medivault-compression .
docker run -p 8000:8000 --env-file .env medivault-compression
```

## Endpoints

All routes are mounted under the `/api` prefix.

### `GET /api/health`

No auth. Returns `{"ok": true}`. Used by keepalive pings (cron-job.org / UptimeRobot).

### `POST /api/folder-download`

Merges and compresses all PDFs in a single folder.

### `POST /api/patient-download`

Merges and compresses all PDFs across all folders for a patient.

Both POST endpoints require `X-Internal-Secret` header. See [`app/schemas.py`](app/schemas.py) for request/response shapes. Backend hard timeout is 300 s — error bodies on timeout read `"Pipeline exceeded 300s limit"` (TD-014, 2026-04-21).

## Compression Tiers

| Tier | Preset   | DPI | Color | Use Case         |
| ---- | -------- | --- | ----- | ---------------- |
| 0    | /printer | 300 | Color | Highest quality  |
| 1    | /ebook   | 200 | Color | Good quality     |
| 2    | /ebook   | 150 | Color | Moderate         |
| 3    | /ebook   | 150 | Gray  | Smaller          |
| 4    | /screen  | 150 | Gray  | Smallest (floor) |

Tiers are tried top-down. First result that fits the target size wins. Digital PDFs (with real text layers) skip Ghostscript entirely and only get pikepdf stream compression.

## Caching

Content-hash based caching via Cloudinary, persisted to the `merged_pdf_cache` MongoDB collection (see [`app/merged_cache.py`](app/merged_cache.py)). Repeat downloads for the same set of source PDFs + target size return instantly from cache. Compression runs are also recorded in the `compression_audits` collection for observability — both are sidecar-only and not user-facing.

## Source-Fetch Concurrency

Cloudinary downloads are bounded by `_FETCH_CONCURRENCY = 10` ([`app/cloudinary_client.py`](app/cloudinary_client.py), TD-015 / 2026-04-21) — protects against connection-pool saturation and Cloudinary per-IP rate limits on patients with many files. Don't remove the `asyncio.Semaphore` guard.
