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

    # 1. Get total page count using pdfinfo
    try:
        info_proc = subprocess.run(
            ["pdfinfo", str(pdf_path)],
            check=True,
            capture_output=True,
            text=True
        )
        page_count = 0
        for line in info_proc.stdout.splitlines():
            if line.startswith("Pages:"):
                page_count = int(line.split(":")[1].strip())
                break
    except Exception as e:
        logger.error(f"pdfinfo failed: {e}", extra={"job_id": job_id})
        raise RuntimeError(f"Failed to get page count: {e}")

    if page_count == 0:
        logger.warning(f"No pages found in {pdf_path}", extra={"job_id": job_id})
        return []

    # 2. Render pages one-by-one to keep memory usage low
    processed_files = []
    for i in range(1, page_count + 1):
        try:
            start_time = time.time()
            page_prefix = f"page_{i:04d}"
            # -f {i} -l {i}: only render the specific page
            subprocess.run(
                ["pdftoppm", "-jpeg", "-r", str(target_dpi), "-f", str(i), "-l", str(i), 
                 str(pdf_path), str(extract_dir / page_prefix)],
                check=True,
                capture_output=True,
                timeout=60
            )
            
            # pdftoppm appends '-1.jpg' when rendering a range
            img_path = extract_dir / f"{page_prefix}-1.jpg"
            if not img_path.exists():
                # Fallback check if it didn't append -1 (depends on version)
                img_path = extract_dir / f"{page_prefix}.jpg"
            
            if not img_path.exists():
                logger.warning(f"Page {i} failed to render", extra={"job_id": job_id})
                continue

            # 3. Process the single page image with PIL
            with Image.open(img_path) as img:
                final_img = img
                if config["grayscale"] and final_img.mode != "L":
                    final_img = final_img.convert("L")
                elif not config["grayscale"] and final_img.mode == "RGBA":
                    final_img = final_img.convert("RGB")
                
                out_path = processed_dir / f"page_{i:04d}.jpg"
                final_img.save(
                    out_path,
                    "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                    optimize=True
                )
                processed_files.append(out_path)
            
            # Immediate cleanup of the raw render to save disk/RAM
            img_path.unlink(missing_ok=True)
                
            elapsed = (time.time() - start_time) * 1000
            if i % 5 == 0 or i == page_count:
                logger.info(f"Processed page {i}/{page_count} in {elapsed:.0f}ms", extra={"job_id": job_id})
                
        except Exception as e:
            logger.warning(f"Failed to process page {i}: {e}", extra={"job_id": job_id})
            continue
            
    return processed_files
