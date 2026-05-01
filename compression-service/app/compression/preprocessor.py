import logging
import subprocess
import time
import io
import gc
from pathlib import Path
from PIL import Image

logger = logging.getLogger(__name__)

# Adaptive Tiering Constants
ABSOLUTE_FLOOR_DPI = 150  # We never go below 150 DPI for medical records

# Subsampling reference: 0=4:4:4, 1=4:2:2, 2=4:2:0
TIER_CONFIGS = {
    0: {"dpi": 300, "quality": 85, "subsampling": 0, "grayscale": False},  # subsampling 0 is 4:4:4
    1: {"dpi": 200, "quality": 72, "subsampling": 0, "grayscale": False},
    2: {"dpi": 150, "quality": 58, "subsampling": 2, "grayscale": False},  # subsampling 2 is 4:2:0
    3: {"dpi": 150, "quality": 45, "subsampling": 2, "grayscale": True},
    4: {"dpi": 120, "quality": 32, "subsampling": 2, "grayscale": True},
}

def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path, job_id: str) -> list[Path]:
    """Extract, downsample, and re-encode images from a scanned PDF.
    
    Uses pdftoppm one-by-one to render pages, piping stdout directly to PIL
    to avoid disk I/O and naming issues.
    """
    config = TIER_CONFIGS.get(tier, TIER_CONFIGS[4])
    target_dpi = config["dpi"]
    
    if target_dpi < ABSOLUTE_FLOOR_DPI:
        target_dpi = ABSOLUTE_FLOOR_DPI
        
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

    # 2. Render and process pages one-by-one (Streaming)
    processed_files = []
    for i in range(1, page_count + 1):
        try:
            start_time = time.time()
            
            # Render page to PNG via stdout (-)
            # -singlefile is critical for reliable stdout streaming on many systems
            # Use pdftocairo if available (often more stable for stdout), fallback to pdftoppm
            cmd = ["pdftoppm", "-png", "-singlefile", "-r", str(target_dpi), "-f", str(i), "-l", str(i), str(pdf_path), "-"]
            
            proc = subprocess.run(
                cmd,
                check=False, # We'll handle the return code ourselves for better logging
                capture_output=True,
                timeout=60
            )
            
            if proc.returncode != 0:
                logger.warning(
                    f"Page {i} render failed (code {proc.returncode})",
                    extra={"job_id": job_id, "stderr": proc.stderr.decode(errors="replace")[:200]}
                )
                continue

            if not proc.stdout:
                logger.warning(f"Page {i} produced no output", extra={"job_id": job_id})
                continue

            # Load from memory stream
            with Image.open(io.BytesIO(proc.stdout)) as img:
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
            
            # Clear memory immediately
            del proc
            gc.collect()
                
            elapsed = (time.time() - start_time) * 1000
            if i % 5 == 0 or i == page_count:
                logger.info(f"Processed page {i}/{page_count} in {elapsed:.0f}ms", extra={"job_id": job_id})
                
        except Exception as e:
            logger.warning(f"Failed to process page {i}: {e}", extra={"job_id": job_id})
            continue
            
    return processed_files
