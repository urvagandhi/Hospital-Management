# HospitALL Compression Service

FastAPI service that merges and compresses medical PDFs on demand. Called exclusively by the Node backend via shared secret header.

## Deployment

**Target:** Render (free tier, Singapore region, Docker runtime, 512 MB RAM)

### Required Environment Variables

| Variable | Description |
|---|---|
| `INTERNAL_API_SECRET` | Shared secret for `X-Internal-Secret` header validation |
| `CLOUDINARY_CLOUD_NAME` | Cloudinary cloud name |
| `CLOUDINARY_API_KEY` | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | Cloudinary API secret |
| `MONGO_URI` | MongoDB connection string (must include default database) |
| `PORT` | Set automatically by Render |

### Docker Build

```bash
cd compression-service
docker build -t hospitall-compression .
docker run -p 8000:8000 --env-file .env hospitall-compression
```

## Endpoints

### `GET /health`
No auth. Returns `{"ok": true}`. Used by keepalive pings (cron-job.org / UptimeRobot).

### `POST /folder-download`
Merges and compresses all PDFs in a single folder.

### `POST /patient-download`
Merges and compresses all PDFs across all folders for a patient.

Both POST endpoints require `X-Internal-Secret` header. See `app/schemas.py` for request/response shapes.

## Compression Tiers

| Tier | Preset | DPI | Color | Use Case |
|------|---------|-----|-------|----------|
| 0 | /printer | 300 | Color | Highest quality |
| 1 | /ebook | 200 | Color | Good quality |
| 2 | /ebook | 150 | Color | Moderate |
| 3 | /ebook | 150 | Gray | Smaller |
| 4 | /screen | 150 | Gray | Smallest (floor) |

Tiers are tried top-down. First result that fits the target size wins. Digital PDFs (with real text layers) skip Ghostscript entirely and only get pikepdf stream compression.

## Caching

Content-hash based caching via Cloudinary. Repeat downloads for the same set of source PDFs + target size return instantly from cache.
