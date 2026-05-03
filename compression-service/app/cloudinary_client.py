import asyncio
import logging
import time
from pathlib import Path
from typing import Optional

import cloudinary
import cloudinary.api
import cloudinary.uploader
import cloudinary.utils
import httpx

from app.config import config
from app.schemas import SourcePdf

logger = logging.getLogger(__name__)

# Configure Cloudinary SDK once at module level
cloudinary.config(
    cloud_name=config.CLOUDINARY_CLOUD_NAME,
    api_key=config.CLOUDINARY_API_KEY,
    api_secret=config.CLOUDINARY_API_SECRET,
    secure=True,
)

_CACHE_PREFIX = "MediVault_compressed"


def _merged_url(public_id: str) -> str:
    """Plain public URL for a merged PDF — same as source documents (raw/upload)."""
    return f"https://res.cloudinary.com/{config.CLOUDINARY_CLOUD_NAME}/raw/upload/{public_id}"


def _source_delivery_url(
    public_id: str,
    resource_type: str = "image",
    access_mode: str = "signed",
) -> str:
    """Build a delivery URL for fetching a source PDF.

    Public files use a plain Cloudinary URL.
    Signed/authenticated files use expires_at + sign_url.
    """
    if access_mode == "public":
        url, _ = cloudinary.utils.cloudinary_url(
            public_id,
            resource_type=resource_type,
            secure=True,
        )
        return url

    # Authenticated / signed access
    expires_at = int(time.time()) + 300
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type=resource_type,
        type="authenticated",
        sign_url=True,
        secure=True,
        expires_at=expires_at,
    )
    return url


async def check_cache(content_hash: str, http_client: httpx.AsyncClient) -> str | None:
    """Check if a cached merged PDF exists via HEAD request."""
    public_id = f"{_CACHE_PREFIX}/{content_hash}.pdf"
    probe_url = _merged_url(public_id)

    try:
        resp = await http_client.head(probe_url, timeout=10.0)
        if resp.status_code == 200:
            return public_id
    except httpx.HTTPError:
        pass

    return None


def generate_delivery_url(content_hash: str) -> str:
    """Public URL for a merged PDF — no signing needed."""
    return _merged_url(f"{_CACHE_PREFIX}/{content_hash}.pdf")


async def fetch_merged_size(content_hash: str) -> Optional[int]:
    """Last-resort size recovery on cache hit when the sidecar meta row is
    missing (legacy caches / failed upsert). Calls the Cloudinary Admin API
    — one extra HTTPS round-trip, so only use when `merged_cache.get_meta`
    returned None. Returns `bytes` as int, or None on any error.
    `tier_used` cannot be recovered here — Cloudinary doesn't know which tier
    of our ladder produced the file, only our service does.
    """
    public_id = f"{_CACHE_PREFIX}/{content_hash}.pdf"

    def _blocking() -> Optional[int]:
        try:
            resource = cloudinary.api.resource(
                public_id,
                resource_type="raw",
                type="upload",
            )
            size = resource.get("bytes")
            return int(size) if size is not None else None
        except Exception:
            logger.warning(
                "Cloudinary resource fallback failed",
                extra={
                    "event": "cloudinary_resource_fallback_error",
                    "metrics": {"public_id": public_id},
                },
            )
            return None

    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _blocking)


class SourceFetchError(Exception):
    """Raised when a source PDF cannot be downloaded."""

    def __init__(self, public_id: str, detail: str) -> None:
        self.public_id = public_id
        self.detail = detail
        super().__init__(f"Failed to fetch {public_id}: {detail}")


_FETCH_CONCURRENCY = 10


async def fetch_source_pdfs(
    source_pdfs: list[SourcePdf],
    job_dir: Path,
    job_id: str,
    http_client: httpx.AsyncClient,
) -> list[Path]:
    """Download all source PDFs in parallel, streaming to disk.

    Returns list of local file paths in the same order as source_pdfs.
    Raises SourceFetchError on first failure.

    Parallelism is bounded by _FETCH_CONCURRENCY (10) so a patient with
    hundreds of files can't swamp the event loop, saturate the httpx
    connection pool, or trip Cloudinary per-IP rate limits (TD-015).
    """

    semaphore = asyncio.Semaphore(_FETCH_CONCURRENCY)

    async def _fetch_one(src: SourcePdf, index: int) -> Path:
        async with semaphore:
            url = _source_delivery_url(
                src.public_id, src.resource_type, src.access_mode
            )
            dest = job_dir / f"source_{index}.pdf"

            try:
                async with http_client.stream("GET", url, timeout=60.0) as resp:
                    if resp.status_code != 200:
                        raise SourceFetchError(
                            src.public_id,
                            f"HTTP {resp.status_code}",
                        )
                    with open(dest, "wb") as f:
                        async for chunk in resp.aiter_bytes(chunk_size=65536):
                            f.write(chunk)
            except httpx.HTTPError as e:
                raise SourceFetchError(src.public_id, str(e)) from e

            logger.info(
                "Fetched source PDF",
                extra={
                    "job_id": job_id,
                    "event": "source_fetched",
                    "metrics": {
                        "public_id": src.public_id,
                        "size_bytes": dest.stat().st_size,
                    },
                },
            )
            return dest

    tasks = [_fetch_one(src, i) for i, src in enumerate(source_pdfs)]
    return list(await asyncio.gather(*tasks))


def upload_merged(
    local_path: Path,
    content_hash: str,
    job_id: str,
) -> str:
    """Upload merged PDF to Cloudinary under MediVault_merged/{hash}.

    Uses type=upload + resource_type=raw — public delivery via plain URL.
    Returns the secure delivery URL.
    """
    public_id = f"{_CACHE_PREFIX}/{content_hash}.pdf"

    logger.info(
        "Uploading merged PDF",
        extra={
            "job_id": job_id,
            "event": "upload_start",
            "metrics": {
                "public_id": public_id,
                "size_bytes": local_path.stat().st_size,
            },
        },
    )

    result = cloudinary.uploader.upload(
        str(local_path),
        public_id=public_id,
        resource_type="raw",
        tags=["auto_delete_30d"],
        overwrite=True,
    )

    logger.info(
        "Upload complete",
        extra={"job_id": job_id, "event": "upload_done"},
    )

    return result.get("secure_url")
