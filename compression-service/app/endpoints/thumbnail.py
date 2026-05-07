import asyncio
import logging
import os
import shutil
import time
import uuid
import httpx
from pathlib import Path

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import config
from app.cloudinary_client import (
    SourceFetchError,
    fetch_source_pdfs,
    CLOUDINARY_CONFIGURED,
    DO_CONFIGURED,
    s3_client,
)
import cloudinary.uploader
from app.schemas import ThumbnailRequest, ThumbnailResponse

logger = logging.getLogger(__name__)
router = APIRouter()

async def generate_pdf_thumbnail(pdf_path: Path, thumb_path: Path) -> bool:
    """Uses Ghostscript to extract the first page as a 120dpi JPEG."""
    cmd = [
        "gs",
        "-q",
        "-dNOPAUSE",
        "-dBATCH",
        "-sDEVICE=jpeg",
        "-dFirstPage=1",
        "-dLastPage=1",
        "-r120",
        f"-sOutputFile={str(thumb_path)}",
        str(pdf_path)
    ]
    process = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    stdout, stderr = await process.communicate()
    if process.returncode != 0:
        logger.error(f"Ghostscript failed: {stderr.decode()}")
        return False
    return True

def upload_thumbnail_sync(local_path: Path, thumb_id: str) -> str:
    public_id = f"MyMediVault_thumbnails/{thumb_id}.jpg"
    
    prefer_do = DO_CONFIGURED and (config.USE_DIGITALOCEAN_AS_PRIMARY or not CLOUDINARY_CONFIGURED)
    if prefer_do and s3_client:
        try:
            s3_client.upload_file(
                Filename=str(local_path),
                Bucket=config.DO_SPACES_BUCKET,
                Key=public_id,
                ExtraArgs={
                    "ACL": "public-read",
                    "ContentType": "image/jpeg",
                    "CacheControl": "public, max-age=31536000, immutable"
                },
            )
            endpoint = config.DO_SPACES_ENDPOINT.rstrip("/")
            return f"{endpoint}/{config.DO_SPACES_BUCKET}/{public_id}"
        except Exception as e:
            logger.error("DO upload failed", exc_info=e)

    # Fallback
    result = cloudinary.uploader.upload(
        str(local_path),
        public_id=public_id,
        resource_type="image",
        overwrite=True,
    )
    return result.get("secure_url")

@router.post("/api/generate-thumbnail")
async def generate_thumbnail(body: ThumbnailRequest, request: Request):
    job_id = str(uuid.uuid4())
    job_dir = Path(config.JOB_TMP_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    
    try:
        async with httpx.AsyncClient() as http_client:
            local_paths = await fetch_source_pdfs([body.source_pdf], job_dir, job_id, http_client)
            if not local_paths:
                return JSONResponse(status_code=400, content={"error": "failed_fetch"})
            
            pdf_path = local_paths[0]
            thumb_path = job_dir / "thumb.jpg"
            
            success = await generate_pdf_thumbnail(pdf_path, thumb_path)
            if not success or not thumb_path.exists():
                return JSONResponse(status_code=500, content={"error": "thumbnail_generation_failed"})
            
            thumb_id = str(uuid.uuid4())
            loop = asyncio.get_running_loop()
            url = await loop.run_in_executor(None, upload_thumbnail_sync, thumb_path, thumb_id)
            
            return ThumbnailResponse(thumbnail_url=url)
            
    except SourceFetchError as e:
        return JSONResponse(status_code=502, content={"error": "source_fetch_failed", "detail": e.detail})
    except Exception as e:
        logger.exception("Thumbnail error")
        return JSONResponse(status_code=500, content={"error": "internal_error"})
    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
