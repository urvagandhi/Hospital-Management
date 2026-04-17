import logging
from datetime import datetime, timezone
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)


async def write_audit_log(
    db: AsyncIOMotorDatabase,
    *,
    user_id: str,
    patient_id: str,
    folder_ids: list[str],
    request_type: str,
    target_size_bytes: int,
    input_size_bytes: int,
    output_size_bytes: int,
    tier_used: Optional[int],
    duration_ms: int,
    cache_hit: bool,
    content_hash: str,
    error_reason: Optional[str] = None,
    job_id: str,
) -> None:
    """Write one audit document to compression_audit collection.

    Never raises — audit failure must not block the response.
    """
    doc = {
        "user_id": user_id,
        "patient_id": patient_id,
        "folder_ids": folder_ids,
        "request_type": request_type,
        "target_size_bytes": target_size_bytes,
        "input_size_bytes": input_size_bytes,
        "output_size_bytes": output_size_bytes,
        "tier_used": tier_used,
        "duration_ms": duration_ms,
        "cache_hit": cache_hit,
        "error_reason": error_reason,
        "timestamp": datetime.now(timezone.utc),
        "content_hash": content_hash,
    }

    try:
        await db.compression_audit.insert_one(doc)
        logger.info(
            "Audit log written",
            extra={"job_id": job_id, "event": "audit_written"},
        )
    except Exception:
        logger.exception(
            "Failed to write audit log",
            extra={"job_id": job_id, "event": "audit_error"},
        )
