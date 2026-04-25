"""
Sidecar metadata for the Cloudinary merged-PDF cache.

Cloudinary is the authoritative store for the merged PDF blob, but it does NOT
know which compression tier produced the file — that's our business data. On a
cache hit we need `{size_bytes, tier_used}` to report back to the client and
to the audit log; without this collection the response falls back to stale
defaults (0 / -1) and the audit log loses tier attribution on every repeat
download.

Write path: call `upsert_meta` right after `upload_merged()` on cache-miss.
Read path:  call `get_meta`    in the cache-hit branch before building the
            response and the audit log entry.

The collection is keyed by `content_hash` (SHA-256) — same key space as the
Cloudinary `public_id`, so a row either exists alongside the blob or not. Both
writes are best-effort and never raise; caller uses `get_meta() is None` as the
signal to fall back to Cloudinary's resource API for size-only recovery.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

COLLECTION = "merged_pdf_cache"


async def upsert_meta(
    db: AsyncIOMotorDatabase,
    *,
    content_hash: str,
    size_bytes: int,
    tier_used: int,
    request_type: str,
    job_id: str,
) -> None:
    """Record `{size_bytes, tier_used}` for the merged PDF keyed by content_hash.

    Idempotent — re-running the pipeline on the same hash overwrites. Never
    raises; a failed write only costs us cache-hit metadata fidelity until
    the next successful pipeline run for that hash.
    """
    doc = {
        "content_hash": content_hash,
        "size_bytes": int(size_bytes),
        "tier_used": int(tier_used),
        "request_type": request_type,
        "updated_at": datetime.now(timezone.utc),
    }
    try:
        await db[COLLECTION].update_one(
            {"content_hash": content_hash},
            {
                "$set": doc,
                "$setOnInsert": {"created_at": datetime.now(timezone.utc)},
            },
            upsert=True,
        )
    except Exception:
        logger.exception(
            "merged_pdf_cache upsert failed",
            extra={"job_id": job_id, "event": "cache_meta_write_error"},
        )


async def get_meta(
    db: AsyncIOMotorDatabase,
    content_hash: str,
    *,
    job_id: str,
) -> Optional[dict]:
    """Return `{size_bytes, tier_used}` for the cached merged PDF, or None.

    `None` signals one of:
      (a) this cache entry predates the sidecar collection — legacy blob,
      (b) the write failed earlier and no retry has overwritten it,
      (c) someone manually uploaded a blob without going through our pipeline.
    Caller is expected to fall back to Cloudinary's resource API for `size_bytes`
    and log a warning so the migration gap is visible.
    """
    try:
        doc = await db[COLLECTION].find_one(
            {"content_hash": content_hash},
            {"size_bytes": 1, "tier_used": 1, "_id": 0},
        )
    except Exception:
        logger.exception(
            "merged_pdf_cache read failed",
            extra={"job_id": job_id, "event": "cache_meta_read_error"},
        )
        return None

    if not doc:
        return None

    size = doc.get("size_bytes")
    tier = doc.get("tier_used")
    if size is None or tier is None:
        return None

    return {"size_bytes": int(size), "tier_used": int(tier)}
