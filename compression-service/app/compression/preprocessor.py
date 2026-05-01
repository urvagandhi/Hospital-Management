import logging
import subprocess
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

def preprocess_scanned_pdf(pdf_path: Path, tier: int, work_dir: Path) -> list[Path]:
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

    # 1. Extract images using pdfimages
    # -all: extract as JPEG/PNG/TIFF
    # prefix: img
    try:
        subprocess.run(
            ["pdfimages", "-all", str(pdf_path), str(extract_dir / "img")],
            check=True,
            capture_output=True,
            timeout=120
        )
    except subprocess.CalledProcessError as e:
        logger.error(f"pdfimages failed: {e.stderr.decode()}")
        raise RuntimeError(f"Image extraction failed: {e.stderr.decode()}")

    # Collect and sort extracted files (img-000.jpg, img-001.png, etc)
    extracted_files = sorted(extract_dir.glob("img-*"))
    if not extracted_files:
        logger.warning(f"No images extracted from {pdf_path}")
        return []

    # Get page dimensions for DPI estimation
    page_dims = get_page_dimensions(pdf_path)
    
    processed_files = []
    
    # Note: pdfimages might extract multiple images per page or none. 
    # For ML Kit PDFs, it's usually 1 image per page.
    # We'll process each extracted image.
    for i, img_path in enumerate(extracted_files):
        try:
            with Image.open(img_path) as img:
                # Estimate current DPI
                # Use the first page dim as a proxy if we have many images
                page_idx = min(i, len(page_dims) - 1)
                page_w_pts, page_h_pts = page_dims[page_idx]
                page_w_in = page_w_pts / 72.0
                
                curr_dpi = img.width / page_w_in if page_w_in > 0 else 300
                
                # Decision: Only downsample if current DPI > target DPI * 1.1
                final_img = img
                if curr_dpi > (target_dpi * 1.1):
                    scale = target_dpi / curr_dpi
                    new_size = (int(img.width * scale), int(img.height * scale))
                    final_img = img.resize(new_size, Image.Resampling.LANCZOS)
                
                # Color conversion
                if config["grayscale"] and final_img.mode != "L":
                    final_img = final_img.convert("L")
                elif not config["grayscale"] and final_img.mode == "RGBA":
                    final_img = final_img.convert("RGB")
                
                # Save as JPEG
                out_path = processed_dir / f"page_{i:04d}.jpg"
                final_img.save(
                    out_path,
                    "JPEG",
                    quality=config["quality"],
                    subsampling=config["subsampling"],
                    optimize=True
                )
                processed_files.append(out_path)
                
        except Exception as e:
            logger.warning(f"Failed to process image {img_path}: {e}")
            continue
            
    return processed_files
