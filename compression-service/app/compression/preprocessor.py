import logging
import psutil
import subprocess
import time
import gc
from pathlib import Path
from PIL import Image
import pikepdf

logger = logging.getLogger(__name__)

# Medical safety floors
MIN_MEDICAL_DPI = 150
ABSOLUTE_FLOOR_DPI = 120

TIER_CONFIGS = {
    0: {"dpi": 300, "quality": 85, "subsampling": 0, "grayscale": False},  # subsampling 0 is 4:4:4
    1: {"dpi": 200, "quality": 72, "subsampling": 0, "grayscale": False},
    2: {"dpi": 150, "quality": 58, "subsampling": 2, "grayscale": False},  # subsampling 2 is 4:2:0
    3: {"dpi": 150, "quality": 45, "subsampling": 2, "grayscale": True},
    4: {"dpi": 120, "quality": 32, "subsampling": 2, "grayscale": True},
}

def get_page_dimensions(pdf_path: Path):
    """Get dimensions (points) for each page using pikepdf."""
    dims = []
    with pikepdf.open(pdf_path) as pdf:
        for page in pdf.pages:
            # MediaBox is [x, y, width, height]
            box = page.mediabox
            width_pts = float(box[2] - box[0])
            height_pts = float(box[3] - box[1])
            dims.append((width_pts, height_pts))
    return dims


def extract_images_from_pdf(pdf_path: Path, extract_dir: Path, job_id: str) -> tuple[list[Path], list[tuple]]:
    """Extract images from a PDF ONCE. Returns (extracted_file_paths, page_dimensions).

    This is the expensive I/O step (pdfimages subprocess + pikepdf page scan)
    that should only run ONCE per job, not repeated for every compression tier.
    """
    extract_dir.mkdir(parents=True, exist_ok=True)

    try:
        subprocess.run(
            ["pdfimages", "-all", "-j", "-jp2", str(pdf_path), str(extract_dir / "img")],
            check=True,
            capture_output=True,
            timeout=300
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pdfimages failed: {e.stderr.decode()}", extra={"job_id": job_id})
        raise RuntimeError(f"Image extraction failed: {e.stderr.decode()}")

    extracted_files = sorted(extract_dir.glob("img-*"))
    if not extracted_files:
        logger.warning(f"No images extracted from {pdf_path}", extra={"job_id": job_id})
        return [], []

    logger.info(
        f"Extracted {len(extracted_files)} images from {pdf_path}",
        extra={"job_id": job_id, "image_count": len(extracted_files)}
    )

    page_dims = get_page_dimensions(pdf_path)
    return extracted_files, page_dims


def process_images_for_tier(
    extracted_files: list[Path],
    page_dims: list[tuple],
    tier: int,
    tier_dir: Path,
    job_id: str,
) -> list[Path]:
    """Resize and re-encode already-extracted images for a specific compression tier.

    Performance optimizations:
    - BILINEAR resampling for tiers 0-2 (~3x faster than LANCZOS).
    - NEAREST resampling for tiers 3-4 (~10x faster, acceptable at low quality).
    - draft() pre-shrink at decode time for large images (avoids full decode).
    - optimize=False on JPEG save (~30% faster encoding, negligible size difference).
    """
    config = TIER_CONFIGS.get(tier, TIER_CONFIGS[4])
    target_dpi = config["dpi"]

    # Ensure we never drift below absolute floor
    if target_dpi < ABSOLUTE_FLOOR_DPI:
        target_dpi = ABSOLUTE_FLOOR_DPI

    # For aggressive tiers, use NEAREST (much faster, quality already low)
    resample_method = Image.Resampling.NEAREST if tier >= 3 else Image.Resampling.BILINEAR

    processed_dir = tier_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    processed_files = []

    for i, img_path in enumerate(extracted_files):
        try:
            start_time = time.time()
            with Image.open(img_path) as img:
                # Estimate current DPI
                page_idx = min(i, len(page_dims) - 1)
                page_w_pts, page_h_pts = page_dims[page_idx]
                page_w_in = page_w_pts / 72.0

                curr_dpi = img.width / page_w_in if page_w_in > 0 else 300

                # Decision: Only downsample if current DPI > target DPI * 1.1
                final_img = img
                if curr_dpi > (target_dpi * 1.1):
                    scale = target_dpi / curr_dpi
                    new_size = (int(img.width * scale), int(img.height * scale))

                    # Use draft() to pre-shrink at decode time for JPEG inputs
                    # This avoids decoding the full-resolution image into memory.
                    if img.format == "JPEG" and scale < 0.5:
                        # draft() picks the fastest DCT scale (1/2, 1/4, 1/8)
                        target_mode = "L" if config["grayscale"] else "RGB"
                        img.draft(target_mode, new_size)
                        img.load()
                        # After draft(), the image is already partially shrunk;
                        # resize to the exact target size.
                        final_img = img.resize(new_size, resample_method)
                    else:
                        final_img = img.resize(new_size, resample_method)
                else:
                    final_img = img

                # Color conversion
                if config["grayscale"] and final_img.mode != "L":
                    final_img = final_img.convert("L")
                elif not config["grayscale"] and final_img.mode == "RGBA":
                    final_img = final_img.convert("RGB")

                # Save as JPEG — optimize=False is ~30% faster encoding
                # with negligible file size difference on scanned images.
                out_path = processed_dir / f"page_{i:04d}.jpg"
                final_img.save(
                    out_path,
                    "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                )
                processed_files.append(out_path)

            elapsed = (time.time() - start_time) * 1000
            if i % 10 == 0: # Log every 10 images to avoid log flooding
                used_ram = psutil.Process().memory_info().rss / (1024 * 1024)
                logger.info(
                    f"Processed image {i} in {elapsed:.0f}ms (RAM: {used_ram:.1f}MB)",
                    extra={"job_id": job_id}
                )

        except Exception as e:
            logger.warning(f"Failed to process image {img_path}: {e}", extra={"job_id": job_id})
            continue

    return processed_files


def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path, job_id: str) -> list[Path]:
    """Legacy wrapper: Extract + process in one call.

    For new code, prefer extract_images_from_pdf() + process_images_for_tier()
    to avoid redundant extraction across tiers.

    Returns a list of paths to processed JPEG images in page order.
    """
    extract_dir = work_dir / "extracted"
    extracted_files, page_dims = extract_images_from_pdf(pdf_path, extract_dir, job_id)
    if not extracted_files:
        return []
    return process_images_for_tier(extracted_files, page_dims, tier, work_dir, job_id)
