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
import boto3
from botocore.config import Config as BotoConfig

from app.config import config
from app.schemas import SourcePdf

logger = logging.getLogger(__name__)

CLOUDINARY_CONFIGURED = all(
    [
        config.CLOUDINARY_CLOUD_NAME,
        config.CLOUDINARY_API_KEY,
        config.CLOUDINARY_API_SECRET,
    ]
)
DO_CONFIGURED = all(
    [
        config.DO_SPACES_ENDPOINT,
        config.DO_SPACES_ACCESS_KEY_ID,
        config.DO_SPACES_SECRET_ACCESS_KEY,
        config.DO_SPACES_BUCKET,
    ]
)

if CLOUDINARY_CONFIGURED:
    cloudinary.config(
        cloud_name=config.CLOUDINARY_CLOUD_NAME,
        api_key=config.CLOUDINARY_API_KEY,
        api_secret=config.CLOUDINARY_API_SECRET,
        secure=True,
    )

# Reusable S3 client for DO Spaces when configured
s3_client = None
if DO_CONFIGURED:
    try:
        s3_client = boto3.client(
            "s3",
            endpoint_url=config.DO_SPACES_ENDPOINT,
            aws_access_key_id=config.DO_SPACES_ACCESS_KEY_ID,
            aws_secret_access_key=config.DO_SPACES_SECRET_ACCESS_KEY,
            region_name=getattr(config, "DO_SPACES_REGION", None) or "sfo3",
            config=BotoConfig(signature_version="s3v4"),
        )
    except Exception:
        s3_client = None

_CACHE_PREFIX = "MyMediVault_compressed"


def _merged_url(public_id: str) -> str:
    """Plain public URL for a merged PDF — same as source documents (raw/upload)."""
    # Prefer DO Spaces when it's configured and either explicitly opted-in
    # or Cloudinary is not configured (DO-only deployments).
    prefer_do = DO_CONFIGURED and (
        config.USE_DIGITALOCEAN_AS_PRIMARY or not CLOUDINARY_CONFIGURED
    )
    if prefer_do and s3_client:
        # Construct Spaces public URL using endpoint + bucket + key
        # If endpoint already includes bucket host, fall back to endpoint/bucket/key form.
        endpoint = config.DO_SPACES_ENDPOINT.rstrip("/")
        return f"{endpoint}/{config.DO_SPACES_BUCKET}/{public_id}"

    return f"https://res.cloudinary.com/{config.CLOUDINARY_CLOUD_NAME}/raw/upload/{public_id}"


def _source_delivery_url(
    public_id: str,
    resource_type: str = "image",
    access_mode: str = "signed",
    storage_provider: str = "cloudinary",
) -> str:
    """Build a delivery URL for fetching a source PDF.

    Public files use a plain Cloudinary URL.
    Signed/authenticated files use expires_at + sign_url.
    DigitalOcean uses boto3 S3 presigned URLs.
    """
    # Route by file's storage_provider; the global flag is only a default for
    # files that don't carry one. Cloudinary fallback is for files that lived
    # there before DO was added.
    use_do = storage_provider == "digitalocean"
    if use_do and not DO_CONFIGURED:
        raise SourceFetchError(public_id, "DigitalOcean Spaces not configured")

    if use_do:
        try:
            s3 = boto3.client(
                "s3",
                endpoint_url=config.DO_SPACES_ENDPOINT,
                aws_access_key_id=config.DO_SPACES_ACCESS_KEY_ID,
                aws_secret_access_key=config.DO_SPACES_SECRET_ACCESS_KEY,
                region_name=config.DO_SPACES_REGION or "sfo3",
                config=BotoConfig(signature_version="s3v4"),
            )
            return s3.generate_presigned_url(
                ClientMethod="get_object",
                Params={"Bucket": config.DO_SPACES_BUCKET, "Key": public_id},
                ExpiresIn=300,
            )
        except Exception as e:
            logger.error(f"DO Presigned URL failed for {public_id}: {e}")
            raise SourceFetchError(public_id, str(e)) from e

    if not CLOUDINARY_CONFIGURED:
        raise SourceFetchError(public_id, "Cloudinary not configured")

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
    # If Spaces is preferred (or Cloudinary absent) probe DO first using head_object
    prefer_do = DO_CONFIGURED and (
        config.USE_DIGITALOCEAN_AS_PRIMARY or not CLOUDINARY_CONFIGURED
    )
    if prefer_do and s3_client:
        try:
            s3_client.head_object(Bucket=config.DO_SPACES_BUCKET, Key=public_id)
            return public_id
        except Exception:
            pass

    # Fallback: probe Cloudinary public URL via HEAD
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

    # If DO is configured and preferred (or Cloudinary absent) try head_object
    prefer_do = DO_CONFIGURED and (
        config.USE_DIGITALOCEAN_AS_PRIMARY or not CLOUDINARY_CONFIGURED
    )
    if prefer_do and s3_client:
        try:
            resp = s3_client.head_object(Bucket=config.DO_SPACES_BUCKET, Key=public_id)
            size = resp.get("ContentLength")
            return int(size) if size is not None else None
        except Exception:
            logger.warning(
                "DO head_object fallback failed",
                extra={
                    "event": "do_head_object_error",
                    "metrics": {"public_id": public_id},
                },
            )

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
                src.public_id, src.resource_type, src.access_mode, src.storage_provider
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
    """Upload merged PDF to Cloudinary under MyMediVault_merged/{hash}.

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

    # If DO is configured and either explicitly chosen or Cloudinary is absent,
    # upload the merged PDF to Spaces as a public object for direct delivery.
    prefer_do = DO_CONFIGURED and (
        config.USE_DIGITALOCEAN_AS_PRIMARY or not CLOUDINARY_CONFIGURED
    )
    if prefer_do and s3_client:
        try:
            s3_client.upload_file(
                Filename=str(local_path),
                Bucket=config.DO_SPACES_BUCKET,
                Key=public_id,
                ExtraArgs={
                    "ACL": "public-read",
                    "ContentType": "application/pdf",
                },
            )
            logger.info(
                "Upload complete (DO Spaces)",
                extra={"job_id": job_id, "event": "upload_done"},
            )
            endpoint = config.DO_SPACES_ENDPOINT.rstrip("/")
            return f"{endpoint}/{config.DO_SPACES_BUCKET}/{public_id}"
        except Exception as e:
            logger.error("DO upload failed", exc_info=e)

    # Fallback to Cloudinary upload
    result = cloudinary.uploader.upload(
        str(local_path),
        public_id=public_id,
        resource_type="raw",
        tags=["auto_delete_30d"],
        overwrite=True,
    )

    logger.info(
        "Upload complete (Cloudinary)",
        extra={"job_id": job_id, "event": "upload_done"},
    )

    return result.get("secure_url")
