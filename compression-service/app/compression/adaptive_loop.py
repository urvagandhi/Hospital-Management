import gc
import logging
import psutil
import shutil
from pathlib import Path

from app.compression.preprocessor import preprocess_scanned_pdf
from app.compression.rebuilder import rebuild_pdf_from_images
from app.compression.ghostscript import run_ghostscript_explicit
from app.compression.classifier import PdfType
from dataclasses import dataclass

@dataclass
class CompressionResult:
    output_path: Path
    tier_used: int
    output_size_bytes: int

logger = logging.getLogger(__name__)

# Render free tier limit is 512MB. We leave 150MB buffer.
MIN_AVAILABLE_RAM_MB = 150

class SizeFloorBreached(Exception):
    """Raised when even Tier 4 cannot meet the target size."""

    def __init__(self, min_achievable_bytes: int) -> None:
        self.min_achievable_bytes = min_achievable_bytes
        super().__init__(
            f"Minimum achievable size: {min_achievable_bytes / 1_048_576:.2f} MB"
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

    best_output = input_path
    
    for tier in range(5):
        # 1. RAM Guard
        available_ram = psutil.virtual_memory().available / (1024 * 1024)
        if available_ram < MIN_AVAILABLE_RAM_MB:
            logger.warning(
                f"Low memory ({available_ram:.1f}MB). Skipping tier {tier}",
                extra={"job_id": job_id}
            )
            continue

        tier_dir = work_dir / f"tier_{tier}"
        tier_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # 2. Preprocess (images)
            image_paths = preprocess_scanned_pdf(input_path, tier, tier_dir, job_id)
            if not image_paths:
                continue
                
            # 3. Rebuild (clean PDF)
            rebuilt_pdf = tier_dir / "rebuilt.pdf"
            rebuild_pdf_from_images(image_paths, rebuilt_pdf)
            
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
    raise SizeFloorBreached(min_achievable_bytes=best_output.stat().st_size)
