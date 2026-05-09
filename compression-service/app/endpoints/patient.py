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

from app.admission import AdmissionFull, heavy_gate
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
from app.pipeline import pipeline
from app.compression.adaptive_loop import CompressionResult, SizeFloorBreached
from app.compression.hasher import compute_content_hash
from app.compression.cover_page import generate_cover_page
from app.merged_cache import (
    get_meta as get_cache_meta,
    upsert_meta as upsert_cache_meta,
)
from app.schemas import DownloadResponse, PatientDownloadRequest, SourcePdf
from app.metrics import CACHE_HITS_TOTAL, CACHE_META_MISSING_TOTAL

logger = logging.getLogger(__name__)
router = APIRouter()

_PIPELINE_TIMEOUT = 600.0


@router.post("/api/patient-download")
async def patient_download(body: PatientDownloadRequest, request: Request):
    job_id = str(uuid.uuid4())
    start = time.monotonic()
    job_dir = Path(config.JOB_TMP_DIR) / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    db = request.app.state.mongo_db

    # Flatten all source PDFs across folders
    all_source_pdfs: list[SourcePdf] = []
    folder_ids: list[str] = []
    for entry in body.folder_map:
        folder_ids.append(entry.folder_id)
        all_source_pdfs.extend(entry.source_pdfs)

    target_bytes = int(body.target_size_mb * 1_048_576)
    content_hash = compute_content_hash(
        all_source_pdfs, 
        body.target_size_mb, 
        has_cover=True
    )

    log_extra = {
        "job_id": job_id,
        "user_id": body.user_id,
        "patient_id": body.patient_id,
    }

    logger.info(
        "Patient download started",
        extra={
            **log_extra,
            "event": "patient_download_start",
            "metrics": {
                "folder_count": len(body.folder_map),
                "source_count": len(all_source_pdfs),
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

                # Same sidecar recovery pattern as /api/folder-download:
                # sidecar row first, Cloudinary Admin API for size-only
                # fallback on legacy blobs, tier_used stays -1 in that case.
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
                    folder_ids=folder_ids,
                    request_type="patient",
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
                # Fetch all source PDFs in parallel
                local_paths = await fetch_source_pdfs(
                    all_source_pdfs, job_dir, job_id, http_client
                )
                input_size = sum(p.stat().st_size for p in local_paths)

                # Open all source PDFs and count pages
                source_pdfs_opened = []
                for lp in local_paths:
                    src = pikepdf.open(lp)
                    source_pdfs_opened.append(src)

                # ── Phase 1: Generate cover pages & merge ONLY content ──
                # Cover pages are kept separate so pdfimages (which only
                # extracts bitmap images) never touches them.
                merged_path = job_dir / "merged.pdf"
                merged = pikepdf.Pdf.new()

                # Track cover page paths and content page counts per folder
                # so we can interleave them back after compression.
                cover_paths: list[Path] = []
                folder_page_counts: list[int] = []

                pdf_idx = 0
                for fi, entry in enumerate(body.folder_map):
                    from app.schemas import FileInfo

                    folder_files_info = []
                    for i, finfo in enumerate(entry.files_info):
                        src_idx = pdf_idx + i
                        if src_idx < len(source_pdfs_opened):
                            folder_files_info.append(
                                FileInfo(
                                    file_name=finfo.file_name,
                                    page_count=len(source_pdfs_opened[src_idx].pages),
                                )
                            )
                        else:
                            folder_files_info.append(finfo)

                    # Generate cover page (saved to disk, NOT added to merged)
                    cover_path = generate_cover_page(
                        title=entry.display_name,
                        patient_name=entry.patient_name,
                        files_info=folder_files_info,
                        job_dir=job_dir,
                        folder_index=fi,
                        remarks=entry.remarks,
                    )
                    cover_paths.append(cover_path)

                    # Append ONLY source content PDFs to merged
                    folder_pages = 0
                    for _ in entry.source_pdfs:
                        if pdf_idx < len(source_pdfs_opened):
                            page_count = len(source_pdfs_opened[pdf_idx].pages)
                            merged.pages.extend(source_pdfs_opened[pdf_idx].pages)
                            folder_pages += page_count
                            pdf_idx += 1
                    folder_page_counts.append(folder_pages)

                merged.save(merged_path)
                merged.close()

                # Close source PDFs to free memory
                for src in source_pdfs_opened:
                    src.close()

                if len(local_paths) > 50:
                    logger.warning(
                        "Large input",
                        extra={
                            **log_extra,
                            "event": "large_input_warning",
                            "metrics": {"source_count": len(local_paths)},
                        },
                    )

                # ── Phase 2: Compress content-only PDF ──
                result = await pipeline.run(merged_path, target_bytes, job_id)

                # ── Phase 3: Interleave cover pages back into compressed output ──
                final_path = job_dir / "final_with_covers.pdf"
                compressed = pikepdf.open(result.output_path)
                final_pdf = pikepdf.Pdf.new()

                content_offset = 0
                for fi in range(len(cover_paths)):
                    # Insert cover page
                    cover = pikepdf.open(cover_paths[fi])
                    final_pdf.pages.extend(cover.pages)

                    # Insert this folder's compressed content pages
                    n_pages = folder_page_counts[fi]
                    for pi in range(content_offset, content_offset + n_pages):
                        if pi < len(compressed.pages):
                            final_pdf.pages.append(compressed.pages[pi])
                    content_offset += n_pages

                final_pdf.save(final_path)
                final_pdf.close()
                compressed.close()

                # Update result to point to the final PDF with covers
                result.output_path = final_path
                result.output_size_bytes = final_path.stat().st_size

                # Upload
                loop = asyncio.get_running_loop()
                url = await loop.run_in_executor(
                    None,
                    partial(upload_merged, result.output_path, content_hash, job_id),
                )

                # Persist cache metadata BEFORE the audit log so a future
                # cache-hit for this hash reports accurate size + tier_used.
                await upsert_cache_meta(
                    db,
                    content_hash=content_hash,
                    size_bytes=result.output_size_bytes,
                    tier_used=result.tier_used,
                    request_type="patient",
                    job_id=job_id,
                )

                elapsed_ms = int((time.monotonic() - start) * 1000)

                await write_audit_log(
                    db,
                    user_id=body.user_id,
                    patient_id=body.patient_id,
                    folder_ids=folder_ids,
                    request_type="patient",
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

            # Admission gate keeps concurrent CPU jobs <= ADMISSION_CAPACITY.
            # Cache-hit path above is intentionally outside the gate.
            async with heavy_gate.acquire_or_raise():
                return await asyncio.wait_for(_pipeline(), timeout=_PIPELINE_TIMEOUT)

    except AdmissionFull:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.warning(
            "Admission rejected — sidecar busy",
            extra={
                **log_extra,
                "event": "admission_rejected",
                "metrics": {"in_flight": heavy_gate.in_flight},
            },
        )
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=folder_ids,
            request_type="patient",
            target_size_bytes=target_bytes,
            input_size_bytes=0,
            output_size_bytes=0,
            tier_used=None,
            duration_ms=elapsed_ms,
            cache_hit=False,
            content_hash=content_hash,
            error_reason="admission_rejected",
            job_id=job_id,
        )
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "30"},
            content={
                "error": "busy",
                "detail": "Compression service at capacity, retry shortly",
            },
        )

    except asyncio.TimeoutError:
        elapsed_ms = int((time.monotonic() - start) * 1000)
        logger.error("Pipeline timeout", extra={**log_extra, "event": "timeout"})
        await write_audit_log(
            db,
            user_id=body.user_id,
            patient_id=body.patient_id,
            folder_ids=folder_ids,
            request_type="patient",
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
            folder_ids=folder_ids,
            request_type="patient",
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
            folder_ids=folder_ids,
            request_type="patient",
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
            folder_ids=folder_ids,
            request_type="patient",
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
