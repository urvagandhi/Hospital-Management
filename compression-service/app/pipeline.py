import asyncio
import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Union

import pikepdf

from app.compression.classifier import classify_pdf, PdfType
from app.compression.digital_path import compress_digital_pdf_enhanced
from app.compression.adaptive_loop import run_adaptive_compression_loop, CompressionResult
from app.cpu_executor import get_cpu_pool

logger = logging.getLogger(__name__)


def _merge_pdfs_worker(paths: List[Path], output_path: Path) -> None:
    """Top-level merge helper so it pickles cleanly into the process pool."""
    with pikepdf.open(paths[0]) as pdf:
        for other_path in paths[1:]:
            with pikepdf.open(other_path) as other:
                pdf.pages.extend(other.pages)
        pdf.save(output_path, linearize=True)


def _merge_pdfs_with_cover_worker(
    cover_path: Path, source_paths: List[Path], output_path: Path
) -> None:
    """Merge cover page + source PDFs in a single save (avoids double merge).

    Prepends the cover page so compression sees [cover, page1, page2, ...].
    The cover is a lightweight vector page — GS preserves it without bloating.
    """
    final = pikepdf.Pdf.new()
    with pikepdf.open(cover_path) as cover:
        final.pages.extend(cover.pages)
    for src_path in source_paths:
        with pikepdf.open(src_path) as src:
            final.pages.extend(src.pages)
    final.save(output_path, linearize=True)
    final.close()

class CompressionPipeline:
    """Orchestrates the multi-stage compression process.
    
    1. Merge (if multiple)
    2. Classify (Digital vs Scanned)
    3. Route to specialized compression path
    4. Adaptive loop (if scanned)
    """
    
    def __init__(self, base_temp_dir: str | None = None):
        from app.config import config
        self.base_temp_dir = Path(base_temp_dir or config.JOB_TMP_DIR)
        self.base_temp_dir.mkdir(parents=True, exist_ok=True)

    async def run(
        self, 
        pdf_paths: Union[List[Path], Path], 
        target_size_bytes: int, 
        job_id: str
    ) -> CompressionResult:
        # Use the provided job_id as the work directory name
        # This aligns with the directory created by the endpoints
        work_dir = self.base_temp_dir / job_id
        work_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            loop = asyncio.get_running_loop()
            cpu_pool = get_cpu_pool()

            # 1. Merge if necessary (if passed a list)
            if isinstance(pdf_paths, list):
                if len(pdf_paths) > 1:
                    merged_path = work_dir / "merged_source.pdf"
                    # Off-process: pikepdf merge holds the GIL on big files
                    await loop.run_in_executor(cpu_pool, _merge_pdfs_worker, pdf_paths, merged_path)
                    source_pdf = merged_path
                else:
                    source_pdf = pdf_paths[0]
            else:
                source_pdf = pdf_paths

            # 2. Classify - off-process (pikepdf scan + heuristics)
            pdf_type = await loop.run_in_executor(cpu_pool, classify_pdf, source_pdf)
            logger.info(f"PDF classified as {pdf_type.value}", extra={"job_id": job_id})

            # 3. Route
            if pdf_type == PdfType.DIGITAL:
                output_path = work_dir / "compressed_final.pdf"
                # Digital compression is CPU-bound — off-process keeps event loop responsive
                final_path = await loop.run_in_executor(
                    cpu_pool,
                    compress_digital_pdf_enhanced,
                    source_pdf, output_path, job_id
                )
                digital_size = final_path.stat().st_size
                if digital_size <= target_size_bytes:
                    return CompressionResult(
                        output_path=final_path,
                        tier_used=0,
                        output_size_bytes=digital_size
                    )
                # Digital-only compression didn't hit the target — fall through
                # to the adaptive loop which does image extraction + GS tiers.
                logger.info(
                    f"Digital compression insufficient "
                    f"({digital_size / 1_048_576:.2f}MB > "
                    f"{target_size_bytes / 1_048_576:.2f}MB target), "
                    f"falling through to adaptive loop",
                    extra={"job_id": job_id}
                )
                # Use the digitally-compressed file as the input for adaptive loop
                source_pdf = final_path
                pdf_type = PdfType.MIXED

            # Scanned / Mixed path uses the adaptive loop
            return await run_adaptive_compression_loop(
                source_pdf,
                target_size_bytes,
                pdf_type,
                work_dir,
                job_id
            )

        except Exception as e:
            logger.error(f"Pipeline failed: {e}", exc_info=True, extra={"job_id": job_id})
            # Re-raise so the endpoint can handle it
            raise

# Singleton instance
pipeline = CompressionPipeline()
