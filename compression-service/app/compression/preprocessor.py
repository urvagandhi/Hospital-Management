import logging
import subprocess
import time
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


def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path, job_id: str) -> list[Path]:
    """Extract, downsample, and re-encode images from a scanned PDF.
    
    Returns a list of paths to processed JPEG images in page order.
    """
    config = TIER_CONFIGS.get(tier, TIER_CONFIGS[4])
    target_dpi = config["dpi"]
    
    # Ensure we never drift below absolute floor
    if target_dpi < ABSOLUTE_FLOOR_DPI:
        target_dpi = ABSOLUTE_FLOOR_DPI
        
    extract_dir = work_dir / "extracted"
    extract_dir.mkdir(parents=True, exist_ok=True)
    
    processed_dir = work_dir / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)

    # 1. Render pages to images using pdftoppm
    # This preserves digital content (like cover pages) by rendering them to pixels.
    # -jpeg: output as JPEG
    # -r {dpi}: render at the target resolution directly
    try:
        subprocess.run(
            ["pdftoppm", "-jpeg", "-r", str(target_dpi), str(pdf_path), str(extract_dir / "page")],
            check=True,
            capture_output=True,
            timeout=300
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pdftoppm failed: {e.stderr.decode()}", extra={"job_id": job_id})
        raise RuntimeError(f"Page rendering failed: {e.stderr.decode()}")

    # Collect and sort extracted files (page-1.jpg, page-2.jpg, etc)
    # Note: pdftoppm is 1-indexed by default
    extracted_files = sorted(extract_dir.glob("page-*.jpg"))
    if not extracted_files:
        logger.warning(f"No pages rendered from {pdf_path}", extra={"job_id": job_id})
        return []

    logger.info(
        f"Rendered {len(extracted_files)} pages from {pdf_path} at {target_dpi} DPI",
        extra={"job_id": job_id, "page_count": len(extracted_files)}
    )

    # Note: Since pdftoppm already did the scaling via '-r', 
    # we just use PIL for color conversion and final JPEG optimization.
    processed_files = []
    
    for i, img_path in enumerate(extracted_files):
        try:
            start_time = time.time()
            with Image.open(img_path) as img:
                final_img = img
                
                # Color conversion
                if config["grayscale"] and final_img.mode != "L":
                    final_img = final_img.convert("L")
                elif not config["grayscale"] and final_img.mode == "RGBA":
                    final_img = final_img.convert("RGB")
                
                # Save with our specific quality/subsampling settings
                out_path = processed_dir / f"page_{i:04d}.jpg"
                final_img.save(
                    out_path,
                    "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                    optimize=True
                )
                processed_files.append(out_path)
                
            elapsed = (time.time() - start_time) * 1000
            if i % 10 == 0:
                logger.debug(f"Processed page {i} in {elapsed:.0f}ms", extra={"job_id": job_id})
                
        except Exception as e:
            logger.warning(f"Failed to process page {img_path}: {e}", extra={"job_id": job_id})
            continue
            
    return processed_files
