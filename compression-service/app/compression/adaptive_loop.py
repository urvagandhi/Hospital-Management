import asyncio
import gc
import logging
import psutil
import shutil
import threading
import time
from pathlib import Path

from app.compression.preprocessor import extract_images_from_pdf, process_images_for_tier
from app.compression.rebuilder import rebuild_pdf_from_images
from app.compression.ghostscript import run_ghostscript_explicit
from app.compression.classifier import PdfType
from app.cpu_executor import get_cpu_pool
from dataclasses import dataclass

@dataclass
class CompressionResult:
    output_path: Path
    tier_used: int
    output_size_bytes: int

logger = logging.getLogger(__name__)

# Lowered threshold to 50MB to support smaller VPS instances
MIN_AVAILABLE_RAM_MB = 50

class MemoryMonitor:
    """Logs RAM usage every second in a background thread."""
    def __init__(self, job_id, interval=1.0):
        self.job_id = job_id
        self.interval = interval
        self.stop_event = threading.Event()
        self.thread = threading.Thread(target=self._log_loop, daemon=True)

    def _log_loop(self):
        process = psutil.Process()
        while not self.stop_event.is_set():
            try:
                used = process.memory_info().rss / (1024 * 1024)
                available = psutil.virtual_memory().available / (1024 * 1024)
                logger.info(f"[RAM] {used:.1f}MB used | {available:.1f}MB free", extra={"job_id": self.job_id})
                time.sleep(self.interval)
            except Exception:
                break

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.stop_event.set()

class SizeFloorBreached(Exception):
    """Raised when even Tier 4 cannot meet the target size."""

    def __init__(self, min_achievable_bytes: int, ram_constrained: bool = False) -> None:
        self.min_achievable_bytes = min_achievable_bytes
        self.ram_constrained = ram_constrained
        super().__init__(
            f"Minimum achievable size: {min_achievable_bytes / 1_048_576:.2f} MB (RAM constrained: {ram_constrained})"
        )


def _estimate_start_tier(input_size_bytes: int, target_size_bytes: int) -> int:
    """Pick a starting tier based on required compression ratio.

    Avoids wasting minutes on high-quality tiers that can't possibly
    hit the target for large inputs.
    """
    if target_size_bytes <= 0:
        return 0
    ratio = input_size_bytes / target_size_bytes
    if ratio > 8:
        return 3
    elif ratio > 4:
        return 2
    elif ratio > 2:
        return 1
    return 0


async def run_adaptive_compression_loop(
    input_path: Path,
    target_size_bytes: int,
    pdf_type: PdfType,
    work_dir: Path,
    job_id: str,
) -> CompressionResult:
    """Orchestrate tiers 0-4 for scanned PDFs.
    
    Optimizations over naive approach:
    - Images extracted ONCE via pdfimages, reused across all tiers.
    - Starting tier estimated from compression ratio to skip hopeless tiers.
    - BILINEAR resampling (~3x faster than LANCZOS).
    """
    if pdf_type == PdfType.DIGITAL:
        # Pure digital should have been handled in pipeline.py.
        # MIXED (digital that exceeded target) is allowed through.
        raise ValueError("Digital PDFs should use digital_path.py")

    with MemoryMonitor(job_id):
        loop = asyncio.get_running_loop()
        cpu_pool = get_cpu_pool()

        # ── Extract images ONCE ──
        extract_dir = work_dir / "extracted"
        extracted_files, page_dims = await loop.run_in_executor(
            cpu_pool, extract_images_from_pdf, input_path, extract_dir, job_id
        )

        if not extracted_files:
            return CompressionResult(
                output_path=input_path,
                tier_used=0,
                output_size_bytes=input_path.stat().st_size,
            )

        # ── Smart tier selection ──
        input_size = input_path.stat().st_size
        start_tier = _estimate_start_tier(input_size, target_size_bytes)
        if start_tier > 0:
            logger.info(
                f"Skipping tiers 0-{start_tier - 1} "
                f"(ratio {input_size / target_size_bytes:.1f}x → starting at tier {start_tier})",
                extra={"job_id": job_id},
            )

        best_output = input_path
        any_tier_skipped = False
        
        # ── Tier loop (resize → rebuild → GS) ──
        for tier in range(start_tier, 5):
            # 1. RAM Guard
            mem = psutil.virtual_memory()
            available_ram = mem.available / (1024 * 1024)
            used_ram = psutil.Process().memory_info().rss / (1024 * 1024)
            
            if available_ram < MIN_AVAILABLE_RAM_MB:
                logger.warning(
                    f"Low memory ({available_ram:.1f}MB). Skipping tier {tier}",
                    extra={"job_id": job_id}
                )
                any_tier_skipped = True
                continue

            tier_dir = work_dir / f"tier_{tier}"
            tier_dir.mkdir(parents=True, exist_ok=True)
            
            try:
                # 2. Resize + re-encode (reuses already-extracted images)
                image_paths = await loop.run_in_executor(
                    cpu_pool,
                    process_images_for_tier,
                    extracted_files, page_dims, tier, tier_dir, job_id
                )

                if not image_paths:
                    continue

                # 3. Rebuild (clean PDF) — off-process for the same reason.
                rebuilt_pdf = tier_dir / "rebuilt.pdf"
                await loop.run_in_executor(
                    cpu_pool,
                    rebuild_pdf_from_images,
                    image_paths, rebuilt_pdf
                )
                
                # Fast path: Check if rebuild alone hit target
                current_size = rebuilt_pdf.stat().st_size
                if current_size <= target_size_bytes:
                    logger.info(f"Tier {tier} Rebuild hit target: {current_size} bytes")
                    return CompressionResult(
                        output_path=rebuilt_pdf,
                        tier_used=tier,
                        output_size_bytes=current_size
                    )
                
                # 4. Ghostscript (deep compression)
                gs_output = tier_dir / "gs_output.pdf"
                await run_ghostscript_explicit(rebuilt_pdf, gs_output, tier, job_id)
                
                current_size = gs_output.stat().st_size
                best_output = gs_output
                
                if current_size <= target_size_bytes:
                    logger.info(f"Tier {tier} GS hit target: {current_size} bytes")
                    return CompressionResult(
                        output_path=gs_output,
                        tier_used=tier,
                        output_size_bytes=current_size
                    )
                    
                # 5. Cleanup tier-specific processed images to save RAM/Disk
                shutil.rmtree(tier_dir / "processed", ignore_errors=True)
                gc.collect()

            except Exception as e:
                logger.error(f"Tier {tier} failed: {e}", exc_info=True)
                continue

        # Cleanup shared extracted images
        shutil.rmtree(extract_dir, ignore_errors=True)

    # All tiers exhausted
    raise SizeFloorBreached(
        min_achievable_bytes=best_output.stat().st_size,
        ram_constrained=any_tier_skipped
    )
