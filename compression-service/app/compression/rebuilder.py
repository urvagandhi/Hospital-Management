import logging
from pathlib import Path
import img2pdf
from PIL import Image

logger = logging.getLogger(__name__)

def rebuild_pdf_from_images(image_paths: list[Path], output_path: Path) -> Path:
    """Combine images into a single PDF using img2pdf.
    
    img2pdf is used because it embeds JPEGs without re-encoding, 
    preserving the quality/size from the preprocessor exactly.
    """
    if not image_paths:
        raise ValueError("No images provided for rebuilding PDF")

    try:
        # img2pdf.convert expects a list of file paths as strings or bytes
        pdf_bytes = img2pdf.convert([str(p) for p in image_paths])
        with open(output_path, "wb") as f:
            f.write(pdf_bytes)
        return output_path
    except Exception as e:
        logger.warning(f"img2pdf failed: {e}. Falling back to Pillow.")
        
        # Fallback: Pillow can also save a list of images as a PDF
        images = []
        try:
            for p in image_paths:
                img = Image.open(p)
                if img.mode != "RGB" and img.mode != "L":
                    img = img.convert("RGB")
                images.append(img)
            
            if images:
                images[0].save(
                    output_path,
                    save_all=True,
                    append_images=images[1:]
                )
                return output_path
            else:
                raise RuntimeError("Pillow fallback produced no images")
        finally:
            for img in images:
                img.close()
