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
from app.config import config
from app.cloudinary_client import (
    SourceFetchError,
    check_cache,
    fetch_merged_size,
    fetch_source_pdfs,
    generate_delivery_url,
    upload_merged,
)
from app.compression.classifier import PdfType
from app.pipeline import pipeline, _merge_pdfs_worker, _merge_pdfs_with_cover_worker
from app.compression.adaptive_loop import CompressionResult, SizeFloorBreached
from app.cpu_executor import get_cpu_pool
from app.compression.hasher import compute_content_hash
from app.compression.cover_page import generate_cover_page
from app.merged_cache import (
    get_meta as get_cache_meta,
    upsert_meta as upsert_cache_meta,
)
from app.schemas import DownloadResponse, FolderDownloadRequest
from app.metrics import CACHE_HITS_TOTAL, CACHE_META_MISSING_TOTAL

logger = logging.getLogger(__name__)
router = APIRouter()

_PIPELINE_TIMEOUT = 600.0


def _count_pdf_pages(paths):
    """Count pages in each PDF using pdfinfo (poppler-utils).

    pdfinfo reads only PDF headers — no full parse, no Python object graph.
    ~10x faster than pikepdf.open() and uses negligible memory.
    Falls back to pikepdf if pdfinfo fails for any file.
    """
    import subprocess

    counts = []
    for p in paths:
        try:
            result = subprocess.run(
                ["pdfinfo", str(p)],
                capture_output=True, text=True, timeout=10,
            )
            for line in result.stdout.splitlines():
                if line.startswith("Pages:"):
                    counts.append(int(line.split(":")[1].strip()))
                    break
            else:
                # pdfinfo didn't report pages — fall back to pikepdf
                with pikepdf.open(p) as src:
                    counts.append(len(src.pages))
        except Exception:
            # Any failure (timeout, corrupt, etc.) — fall back to pikepdf
            with pikepdf.open(p) as src:
                counts.append(len(src.pages))
    return counts


def _count_pages_and_generate_cover(paths, files_info_raw, display_name, patient_name, job_dir, remarks):
    """Combined page counting + cover generation in a single off-thread call.

    Eliminates sequential event_loop→cpu_pool round-trips by batching
    both CPU-bound operations (pdfinfo page counting + fpdf2 cover rendering)
    into one executor submission. Returns (page_counts, cover_path).
    """
    from app.schemas import FileInfo

    page_counts = _count_pdf_pages(paths)

    # Update files_info with real page counts
    files_info = files_info_raw
    if files_info and len(files_info) == len(paths):
        files_info = [
            FileInfo(file_name=fi.file_name, page_count=pc)
            for fi, pc in zip(files_info, page_counts)
        ]

    cover_path = None
    if display_name:
        cover_path = generate_cover_page(
            title=display_name,
            patient_name=patient_name,
            files_info=files_info,
            job_dir=job_dir,
            remarks=remarks,
        )

    return page_counts, cover_path


@router.post("/api/folder-download")
async def folder_download(body: FolderDownloadRequest, request: Request):
    job_id = str(uuid.uuid4())
    start = time.monotonic()
    job_dir = Path(config.JOB_TMP_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    db = request.app.state.mongo_db
    target_bytes = int(body.target_size_mb * 1_048_576)
    content_hash = compute_content_hash(
        body.source_pdfs, 
        body.target_size_mb, 
        has_cover=bool(body.display_name)
    )

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
                    CACHE_META_MISSING_TOTAL.inc()

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
                        "metrics": {
                            "size_bytes": cached_size,
                            "tier_used": cached_tier,
                        },
                    },
                )
                CACHE_HITS_TOTAL.labels(hit="true").inc()
                return DownloadResponse(
                    merged_url=url,
                    content_hash=content_hash,
                    final_size_bytes=cached_size,
                    tier_used=cached_tier,
                    cache_hit=True,
                )

            # Pipeline with timeout
            async def _pipeline() -> DownloadResponse:
                loop = asyncio.get_running_loop()
                cpu_pool = get_cpu_pool()

                # Fetch
                local_paths = await fetch_source_pdfs(
                    body.source_pdfs, job_dir, job_id, http_client
                )
                input_size = sum(p.stat().st_size for p in local_paths)

                # ── Page counting + cover generation (single off-thread call) ──
                # Batches pdfinfo page counting + fpdf2 cover rendering into one
                # executor submission — eliminates sequential round-trip overhead
                # and keeps all CPU-bound work off the event loop.
                cover_path = None
                needs_cover = bool(body.display_name)

                if (body.files_info and len(body.files_info) == len(local_paths)) or needs_cover:
                    _, cover_path = await loop.run_in_executor(
                        cpu_pool,
                        _count_pages_and_generate_cover,
                        local_paths,
                        body.files_info,
                        body.display_name,
                        body.patient_name,
                        job_dir,
                        body.remarks,
                    )

                # ── Merge + prepare input for compression ──
                # Three cases, ordered by frequency:
                #   A) 1 file, no cover → skip merge entirely (just pass through)
                #   B) N files + cover  → single merge with cover prepended
                #   C) N files, no cover → standard merge
                #
                # All merges run OFF the event loop via cpu_pool.

                if len(local_paths) == 1 and cover_path is None:
                    # Case A: Single file, no cover — zero-copy passthrough
                    merged_path = local_paths[0]
                    logger.info(
                        "Single file, no cover — skipping merge",
                        extra={**log_extra, "event": "merge_skip"},
                    )
                elif cover_path is not None:
                    # Case B: Prepend cover during first merge — eliminates
                    # the post-compression re-open + re-save cycle entirely.
                    merged_path = job_dir / "merged.pdf"
                    await loop.run_in_executor(
                        cpu_pool,
                        _merge_pdfs_with_cover_worker,
                        cover_path,
                        local_paths,
                        merged_path,
                    )
                    logger.info(
                        "Merged with cover prepended in single pass",
                        extra={**log_extra, "event": "merge_with_cover"},
                    )
                else:
                    # Case C: Multi-file, no cover — standard merge
                    merged_path = job_dir / "merged.pdf"
                    await loop.run_in_executor(
                        cpu_pool,
                        _merge_pdfs_worker,
                        local_paths,
                        merged_path,
                    )

                if len(local_paths) > 50:
                    logger.warning(
                        "Large input",
                        extra={
                            **log_extra,
                            "event": "large_input_warning",
                            "metrics": {"page_count": len(local_paths)},
                        },
                    )

                # ── Compress ──
                # Cover (if any) is already baked into merged_path, so
                # compression sees the full document in one shot.
                result = await pipeline.run(merged_path, target_bytes, job_id)

                # Upload
                url = await loop.run_in_executor(
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

                CACHE_HITS_TOTAL.labels(hit="false").inc()
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
            content={
                "error": "processing_timeout",
                "detail": "Pipeline exceeded 300s limit",
            },
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
                "min_achievable_mb": round(e.min_achievable_bytes / 1_048_576, 2),
                "ram_constrained": e.ram_constrained,
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
