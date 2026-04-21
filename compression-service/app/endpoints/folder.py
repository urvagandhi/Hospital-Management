import asyncio
import logging
import shutil
import time
import uuid
from functools import partial
from pathlib import Path

import httpx
import pikepdf
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.audit import write_audit_log
from app.cloudinary_client import (
    SourceFetchError,
    check_cache,
    fetch_merged_size,
    fetch_source_pdfs,
    generate_delivery_url,
    upload_merged,
)
from app.compression.classifier import PdfType, classify_for_processing
from app.compression.hasher import compute_content_hash
from app.compression.tier_ladder import (
    CompressionResult,
    SizeFloorBreached,
    compress_digital_pdf,
    run_tier_ladder,
)
from app.compression.cover_page import generate_cover_page
from app.merged_cache import get_meta as get_cache_meta, upsert_meta as upsert_cache_meta
from app.schemas import DownloadResponse, FolderDownloadRequest

logger = logging.getLogger(__name__)
router = APIRouter()

_PIPELINE_TIMEOUT = 300.0


@router.post("/api/folder-download")
async def folder_download(body: FolderDownloadRequest, request: Request):
    job_id = str(uuid.uuid4())
    start = time.monotonic()
    job_dir = Path(f"/tmp/jobs/{job_id}")
    job_dir.mkdir(parents=True, exist_ok=True)
    db = request.app.state.mongo_db
    target_bytes = int(body.target_size_mb * 1_048_576)
    content_hash = compute_content_hash(body.source_pdfs, body.target_size_mb)

    log_extra = {
        "job_id": job_id,
        "user_id": body.user_id,
        "patient_id": body.patient_id,
    }

    logger.info(
        "Folder download started",
        extra={
            **log_extra,
            "event": "folder_download_start",
            "metrics": {
                "folder_id": body.folder_id,
                "source_count": len(body.source_pdfs),
                "target_mb": body.target_size_mb,
            },
        },
    )

    try:
        async with httpx.AsyncClient() as http_client:
            # Cache check
            cached_id = await check_cache(content_hash, http_client)
            if cached_id is not None:
                url = generate_delivery_url(content_hash)
                elapsed_ms = int((time.monotonic() - start) * 1000)

                # Recover real size + tier from our sidecar row. If the row is
                # missing (legacy blob / failed prior upsert), fall back to
                # Cloudinary's Admin API for size only — tier stays -1 because
                # Cloudinary doesn't know which tier produced the file.
                meta = await get_cache_meta(db, content_hash, job_id=job_id)
                if meta is not None:
                    cached_size = meta["size_bytes"]
                    cached_tier = meta["tier_used"]
                else:
                    fallback_size = await fetch_merged_size(content_hash)
                    cached_size = fallback_size if fallback_size is not None else 0
                    cached_tier = -1
                    logger.warning(
                        "merged_pdf_cache sidecar missing on cache-hit; used Cloudinary fallback",
                        extra={
                            **log_extra,
                            "event": "cache_meta_missing",
                            "metrics": {
                                "content_hash": content_hash,
                                "recovered_size": cached_size,
                            },
                        },
                    )

                await write_audit_log(
                    db,
                    user_id=body.user_id,
                    patient_id=body.patient_id,
                    folder_ids=[body.folder_id],
                    request_type="folder",
                    target_size_bytes=target_bytes,
                    input_size_bytes=0,
                    output_size_bytes=cached_size,
                    tier_used=cached_tier,
                    duration_ms=elapsed_ms,
                    cache_hit=True,
                    content_hash=content_hash,
                    job_id=job_id,
                )
                logger.info(
                    "Cache hit",
                    extra={
                        **log_extra,
                        "event": "cache_hit",
                        "metrics": {"size_bytes": cached_size, "tier_used": cached_tier},
                    },
                )
                return DownloadResponse(
                    merged_url=url,
                    content_hash=content_hash,
                    final_size_bytes=cached_size,
                    tier_used=cached_tier,
                    cache_hit=True,
                )

            # Pipeline with timeout
            async def _pipeline() -> DownloadResponse:
                # Fetch
                local_paths = await fetch_source_pdfs(
                    body.source_pdfs, job_dir, job_id, http_client
                )
                input_size = sum(p.stat().st_size for p in local_paths)

                # Open all source PDFs and count pages
                source_pdfs_opened = []
                for lp in local_paths:
                    src = pikepdf.open(lp)
                    source_pdfs_opened.append(src)

                # Build files_info with real page counts
                files_info = body.files_info
                if files_info and len(files_info) == len(source_pdfs_opened):
                    from app.schemas import FileInfo
                    files_info = [
                        FileInfo(
                            file_name=fi.file_name,
                            page_count=len(src.pages),
                        )
                        for fi, src in zip(files_info, source_pdfs_opened)
                    ]

                # Merge (with optional cover page)
                merged_path = job_dir / "merged.pdf"
                merged = pikepdf.Pdf.new()

                if body.display_name:
                    cover_path = generate_cover_page(
                        title=body.display_name,
                        patient_name=body.patient_name,
                        files_info=files_info,
                        job_dir=job_dir,
                    )
                    cover_pdf = pikepdf.open(cover_path)
                    merged.pages.extend(cover_pdf.pages)

                for src in source_pdfs_opened:
                    merged.pages.extend(src.pages)
                merged.save(merged_path)
                merged.close()

                if len(local_paths) > 50:
                    logger.warning(
                        "Large input",
                        extra={
                            **log_extra,
                            "event": "large_input_warning",
                            "metrics": {"page_count": len(local_paths)},
                        },
                    )

                # Classify + compress
                pdf_type = classify_for_processing(local_paths)
                result: CompressionResult

                if pdf_type == PdfType.DIGITAL:
                    compressed = await compress_digital_pdf(
                        merged_path, job_dir, job_id
                    )
                    output_size = compressed.stat().st_size
                    result = CompressionResult(
                        output_path=compressed, tier_used=0, output_size_bytes=output_size
                    )
                else:
                    result = await run_tier_ladder(
                        merged_path, target_bytes, job_dir, job_id
                    )

                # Upload
                loop = asyncio.get_running_loop()
                await loop.run_in_executor(
                    None,
                    partial(upload_merged, result.output_path, content_hash, job_id),
                )

                # Persist cache metadata BEFORE the audit log — a future
                # cache-hit for this hash needs this row to report accurate
                # size + tier_used. Best-effort: upsert_meta never raises.
                await upsert_cache_meta(
                    db,
                    content_hash=content_hash,
                    size_bytes=result.output_size_bytes,
                    tier_used=result.tier_used,
                    request_type="folder",
                    job_id=job_id,
                )

                url = generate_delivery_url(content_hash)
                elapsed_ms = int((time.monotonic() - start) * 1000)

                await write_audit_log(
                    db,
                    user_id=body.user_id,
                    patient_id=body.patient_id,
                    folder_ids=[body.folder_id],
                    request_type="folder",
                    target_size_bytes=target_bytes,
                    input_size_bytes=input_size,
                    output_size_bytes=result.output_size_bytes,
                    tier_used=result.tier_used,
                    duration_ms=elapsed_ms,
                    cache_hit=False,
                    content_hash=content_hash,
                    job_id=job_id,
                )

                return DownloadResponse(
                    merged_url=url,
                    content_hash=content_hash,
                    final_size_bytes=result.output_size_bytes,
                    tier_used=result.tier_used,
                    cache_hit=False,
                )

            return await asyncio.wait_for(_pipeline(), timeout=_PIPELINE_TIMEOUT)

    except asyncio.TimeoutError:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.error("Pipeline timeout", extra={**log_extra, "event": "timeout"})
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=[body.folder_id],
            request_type="folder",
            target_size_bytes=target_bytes,
            input_size_bytes=0,
            output_size_bytes=0,
            tier_used=None,
            duration_ms=elapsed_ms,
            cache_hit=False,
            content_hash=content_hash,
            error_reason="processing_timeout",
            job_id=job_id,
        )
        return JSONResponse(
            status_code=504,
            content={"error": "processing_timeout", "detail": "Pipeline exceeded 100s limit"},
        )

    except SizeFloorBreached as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=[body.folder_id],
            request_type="folder",
            target_size_bytes=target_bytes,
            input_size_bytes=0,
            output_size_bytes=e.min_achievable_bytes,
            tier_used=None,
            duration_ms=elapsed_ms,
            cache_hit=False,
            content_hash=content_hash,
            error_reason="size_floor_breached",
            job_id=job_id,
        )
        return JSONResponse(
            status_code=413,
            content={
                "error": "size_floor_breached",
                "min_achievable_mb": round(e.min_achievable_bytes / 1_048_576, 2),
            },
        )

    except SourceFetchError as e:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=[body.folder_id],
            request_type="folder",
            target_size_bytes=target_bytes,
            input_size_bytes=0,
            output_size_bytes=0,
            tier_used=None,
            duration_ms=elapsed_ms,
            cache_hit=False,
            content_hash=content_hash,
            error_reason=f"source_fetch_failed:{e.public_id}",
            job_id=job_id,
        )
        return JSONResponse(
            status_code=502,
            content={
                "error": "source_fetch_failed",
                "failed_public_id": e.public_id,
                "detail": e.detail,
            },
        )

    except Exception:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.exception("Unhandled error", extra={**log_extra, "event": "error"})
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=[body.folder_id],
            request_type="folder",
            target_size_bytes=target_bytes,
            input_size_bytes=0,
            output_size_bytes=0,
            tier_used=None,
            duration_ms=elapsed_ms,
            cache_hit=False,
            content_hash=content_hash,
            error_reason="internal_error",
            job_id=job_id,
        )
        return JSONResponse(
            status_code=500,
            content={"error": "internal_error"},
        )

    finally:
        shutil.rmtree(job_dir, ignore_errors=True)
