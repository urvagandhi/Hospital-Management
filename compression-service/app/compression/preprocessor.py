import logging
import subprocess
import time
import gc
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Adaptive Tiering Constants
ABSOLUTE_FLOOR_DPI = 150  # We never go below 150 DPI for medical records

# Subsampling reference: 0=4:4:4, 1=4:2:2, 2=4:2:0
TIER_CONFIGS = {
    0: {"dpi": 300, "quality": 85, "subsampling": 0, "grayscale": False},
    1: {"dpi": 200, "quality": 72, "subsampling": 0, "grayscale": False},
    2: {"dpi": 150, "quality": 58, "subsampling": 2, "grayscale": False},
    3: {"dpi": 150, "quality": 45, "subsampling": 2, "grayscale": True},
    4: {"dpi": 120, "quality": 32, "subsampling": 2, "grayscale": True},
}


def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path, job_id: str) -> list[Path]:
    """Render each PDF page to a JPEG using pdftoppm (disk-based, page-by-page).

    Writes one page at a time to avoid memory spikes on memory-constrained
    environments (e.g. Render free tier, 512 MB).  Each raw render is deleted
    immediately after PIL processes it so disk usage stays flat.
    """
    config = TIER_CONFIGS.get(tier, TIER_CONFIGS[4])
    target_dpi = max(config["dpi"], ABSOLUTE_FLOOR_DPI)

    # Separate staging dirs so we never confuse raw renders with processed output
    raw_dir = work_dir / "raw"
    raw_dir.mkdir(parents=True, exist_ok=True)
    processed_dir = work_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    # ── Step 1: Get page count ──────────────────────────────────────────────
    try:
        info = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=True, capture_output=True, text=True,
        )
        page_count = 0
        for line in info.stdout.splitlines():
            if line.lower().startswith("pages:"):
                page_count = int(line.split(":")[1].strip())
                break
    except Exception as exc:
        logger.error(f"pdfinfo failed: {exc}", extra={"job_id": job_id})
        raise RuntimeError(f"Failed to get page count: {exc}")

    if page_count == 0:
        logger.warning(f"No pages in {pdf_path}", extra={"job_id": job_id})
        return []

    logger.info(
        f"Rendering {page_count} pages at {target_dpi} DPI (tier {tier})",
        extra={"job_id": job_id},
    )

    # ── Step 2: Render + process one page at a time ─────────────────────────
    processed_files: list[Path] = []

    for i in range(1, page_count + 1):
        try:
            t0 = time.time()

            # Each page gets its own unique prefix so globs never clash
            prefix = raw_dir / f"p{i:04d}"

            result = subprocess.run(
                [
                    "pdftoppm",
                    "-jpeg",           # output format
                    "-r", str(target_dpi),
                    "-f", str(i),      # first page
                    "-l", str(i),      # last page (same → single page)
                    str(pdf_path),
                    str(prefix),       # output prefix (files will be prefix-N.jpg)
                ],
                check=False,
                capture_output=True,
                timeout=60,
            )

            if result.returncode != 0:
                err = result.stderr.decode(errors="replace")[:300]
                logger.warning(
                    f"pdftoppm failed on page {i} (rc={result.returncode}): {err}",
                    extra={"job_id": job_id},
                )
                continue

            # pdftoppm appends the page number: prefix-1.jpg, prefix-01.jpg, etc.
            matches = sorted(raw_dir.glob(f"p{i:04d}*.jpg"))
            if not matches:
                logger.warning(f"No output file for page {i}", extra={"job_id": job_id})
                continue

            raw_img_path = matches[0]

            # ── PIL: colour convert + JPEG re-encode ───────────────────────
            with Image.open(raw_img_path) as img:
                if config["grayscale"] and img.mode != "L":
                    img = img.convert("L")
                elif not config["grayscale"] and img.mode == "RGBA":
                    img = img.convert("RGB")

                out_path = processed_dir / f"page_{i:04d}.jpg"
                img.save(
                    out_path, "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                    optimize=True,
                )
                processed_files.append(out_path)

            # Delete raw render immediately to keep disk usage low
            raw_img_path.unlink(missing_ok=True)
            gc.collect()

            elapsed_ms = int((time.time() - t0) * 1000)
            if i % 5 == 0 or i == page_count:
                logger.info(
                    f"Page {i}/{page_count} processed in {elapsed_ms}ms",
                    extra={"job_id": job_id},
                )

        except Exception as exc:
            logger.warning(f"Error on page {i}: {exc}", extra={"job_id": job_id})
            continue

    return processed_files
