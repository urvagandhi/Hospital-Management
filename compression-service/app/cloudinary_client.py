import asyncio
import logging
import time
from pathlib import Path

import cloudinary
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

_CACHE_PREFIX = "HospitALL_merged"


def _signed_url(public_id: str, expiry_seconds: int = 3600) -> str:
    """Generate a signed Cloudinary URL for an authenticated PDF."""
    ts = int(time.time()) + expiry_seconds
    url, _ = cloudinary.utils.cloudinary_url(
        public_id,
        resource_type="image",
        type="authenticated",
        format="pdf",
        sign_url=True,
        auth_token={"key": config.CLOUDINARY_API_SECRET, "expiration": ts},
    )
    return url


def _source_delivery_url(public_id: str) -> str:
    """Build a signed delivery URL for fetching a source PDF."""
    return _signed_url(public_id, expiry_seconds=300)


async def check_cache(content_hash: str, http_client: httpx.AsyncClient) -> str | None:
    """Check if a cached merged PDF exists via HEAD request.

    Returns the public_id if cached, None otherwise.
    """
    public_id = f"{_CACHE_PREFIX}/{content_hash}"
    probe_url = _signed_url(public_id, expiry_seconds=60)

    try:
        resp = await http_client.head(probe_url, timeout=10.0)
        if resp.status_code == 200:
            return public_id
    except httpx.HTTPError:
        pass

    return None


def generate_delivery_url(content_hash: str) -> str:
    """Generate a 1-hour signed URL for a cached/uploaded merged PDF."""
    return _signed_url(f"{_CACHE_PREFIX}/{content_hash}", expiry_seconds=3600)


class SourceFetchError(Exception):
    """Raised when a source PDF cannot be downloaded."""

    def __init__(self, public_id: str, detail: str) -> None:
        self.public_id = public_id
        self.detail = detail
        super().__init__(f"Failed to fetch {public_id}: {detail}")


async def fetch_source_pdfs(
    source_pdfs: list[SourcePdf],
    job_dir: Path,
    job_id: str,
    http_client: httpx.AsyncClient,
) -> list[Path]:
    """Download all source PDFs in parallel, streaming to disk.

    Returns list of local file paths in the same order as source_pdfs.
    Raises SourceFetchError on first failure.
    """

    async def _fetch_one(src: SourcePdf, index: int) -> Path:
        url = _source_delivery_url(src.public_id)
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
) -> None:
    """Upload merged PDF to Cloudinary under HospitALL_merged/{hash}.

    Uses the sync SDK uploader (called from async context via run_in_executor
    by the caller if needed — kept sync here for simplicity since upload is
    a single blocking call at the end of the pipeline).
    """
    public_id = f"{_CACHE_PREFIX}/{content_hash}"

    logger.info(
        "Uploading merged PDF",
        extra={
            "job_id": job_id,
            "event": "upload_start",
            "metrics": {"public_id": public_id, "size_bytes": local_path.stat().st_size},
        },
    )

    cloudinary.uploader.upload(
        str(local_path),
        public_id=public_id,
        resource_type="image",
        type="authenticated",
        format="pdf",
        tags=["auto_delete_30d"],
        overwrite=True,
    )

    logger.info(
        "Upload complete",
        extra={"job_id": job_id, "event": "upload_done"},
    )
