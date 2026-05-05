import asyncio
import gc
import logging
import psutil
import shutil
import threading
import time
from pathlib import Path

from app.compression.preprocessor import preprocess_scanned_pdf
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

async def run_adaptive_compression_loop(
    input_path: Path,
    target_size_bytes: int,
    pdf_type: PdfType,
    work_dir: Path,
    job_id: str,
) -> CompressionResult:
    """Orchestrate tiers 0-4 for scanned PDFs.
    
    Logic:
    - If digital, it should have been routed to digital_path.py (handled in pipeline.py).
    - If scanned, iterate tiers 0 -> 4.
    - Stop as soon as target_size_bytes is hit.
    - Includes RAM guard to prevent OOM on Render.
    """
    if pdf_type == PdfType.DIGITAL:
        # This shouldn't happen if pipeline.py is correct, but safe fallback
        raise ValueError("Digital PDFs should use digital_path.py")

    with MemoryMonitor(job_id):
        best_output = input_path
        any_tier_skipped = False
        
        for tier in range(5):
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
                loop = asyncio.get_running_loop()
                cpu_pool = get_cpu_pool()

                # 2. Preprocess (images) — off-process so PIL/pdfimages CPU
                # does not starve the asyncio event loop on Render.
                image_paths = await loop.run_in_executor(
                    cpu_pool,
                    preprocess_scanned_pdf,
                    input_path, tier, tier_dir, job_id
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
                    
                # 5. Cleanup tier-specific extracted/processed images to save RAM/Disk
                shutil.rmtree(tier_dir / "extracted", ignore_errors=True)
                shutil.rmtree(tier_dir / "processed", ignore_errors=True)
                gc.collect()

            except Exception as e:
                logger.error(f"Tier {tier} failed: {e}", exc_info=True)
                continue
            
    # All tiers exhausted
    raise SizeFloorBreached(
        min_achievable_bytes=best_output.stat().st_size,
        ram_constrained=any_tier_skipped
    )
