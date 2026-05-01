"""Preprocessor: render PDF pages to JPEG using Ghostscript.

Ghostscript renders one page at a time with a true streaming architecture —
it never loads the entire PDF into RAM. This is critical for the Render free
tier (512 MB hard limit) where pdftoppm was causing OOM crashes.
"""

import logging
import subprocess
import time
import gc
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Adaptive Tiering Constants
ABSOLUTE_FLOOR_DPI = 150  # We never go below 150 DPI for medical records

TIER_CONFIGS = {
    0: {"dpi": 200, "quality": 85, "subsampling": 0, "grayscale": False},
    1: {"dpi": 150, "quality": 72, "subsampling": 0, "grayscale": False},
    2: {"dpi": 150, "quality": 58, "subsampling": 2, "grayscale": False},
    3: {"dpi": 120, "quality": 45, "subsampling": 2, "grayscale": True},
    4: {"dpi": 100, "quality": 32, "subsampling": 2, "grayscale": True},
}


def _get_page_count(pdf_path: Path, job_id: str) -> int:
    """Get page count via pdfinfo (fast, no rendering)."""
    try:
        info = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=True, capture_output=True, text=True, timeout=30,
        )
        for line in info.stdout.splitlines():
            if line.lower().startswith("pages:"):
                return int(line.split(":")[1].strip())
    except Exception as exc:
        logger.error(f"pdfinfo failed: {exc}", extra={"job_id": job_id})
        raise RuntimeError(f"Failed to get page count: {exc}")
    return 0


def _render_page_gs(pdf_path: Path, page_num: int, out_path: Path, dpi: int, grayscale: bool) -> bool:
    """Render a single page to JPEG using Ghostscript.

    Ghostscript streams the PDF; it never loads the full document into RAM
    at once, making it safe on memory-constrained hosts.
    """
    device = "jpeggray" if grayscale else "jpeg"
    result = subprocess.run(
        [
            "gs",
            "-dBATCH", "-dNOPAUSE", "-dQUIET", "-dSAFER",
            f"-sDEVICE={device}",
            f"-r{dpi}",
            f"-dFirstPage={page_num}",
            f"-dLastPage={page_num}",
            f"-sOutputFile={out_path}",
            str(pdf_path),
        ],
        check=False,
        capture_output=True,
        timeout=60,
    )
    return result.returncode == 0


def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path, job_id: str) -> list[Path]:
    """Render each PDF page to JPEG using Ghostscript (page-by-page, memory-safe)."""
    config = TIER_CONFIGS.get(tier, TIER_CONFIGS[4])
    dpi = max(config["dpi"], ABSOLUTE_FLOOR_DPI)

    processed_dir = work_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    page_count = _get_page_count(pdf_path, job_id)
    if page_count == 0:
        logger.warning(f"No pages in {pdf_path}", extra={"job_id": job_id})
        return []

    logger.info(
        f"Rendering {page_count} pages at {dpi} DPI via Ghostscript (tier {tier})",
        extra={"job_id": job_id},
    )

    processed_files: list[Path] = []
    raw_path = work_dir / "page_raw.jpg"  # reuse single temp file

    for i in range(1, page_count + 1):
        try:
            t0 = time.time()

            # Render page i to the shared temp file
            ok = _render_page_gs(pdf_path, i, raw_path, dpi, config["grayscale"])
            if not ok or not raw_path.exists() or raw_path.stat().st_size == 0:
                logger.warning(f"GS render failed for page {i}", extra={"job_id": job_id})
                continue

            # PIL: re-encode with our quality/subsampling settings
            out_path = processed_dir / f"page_{i:04d}.jpg"
            with Image.open(raw_path) as img:
                if config["grayscale"] and img.mode != "L":
                    img = img.convert("L")
                elif not config["grayscale"] and img.mode == "RGBA":
                    img = img.convert("RGB")

                img.save(
                    out_path, "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                    optimize=True,
                )

            processed_files.append(out_path)

            # Free the raw temp file and run GC to reclaim memory
            raw_path.unlink(missing_ok=True)
            gc.collect()

            elapsed_ms = int((time.time() - t0) * 1000)
            if i % 5 == 0 or i == page_count:
                logger.info(
                    f"Page {i}/{page_count} done in {elapsed_ms}ms",
                    extra={"job_id": job_id},
                )

        except Exception as exc:
            logger.warning(f"Error on page {i}: {exc}", extra={"job_id": job_id})
            raw_path.unlink(missing_ok=True)
            continue

    return processed_files
