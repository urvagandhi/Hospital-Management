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
        # Define A4 layout (210mm x 297mm)
        # img2pdf uses points (1/72 inch). 
        # A4: 210mm / 25.4 * 72 = 595.27 pt
        #     297mm / 25.4 * 72 = 841.89 pt
        a4_layout = img2pdf.get_layout_fun(pagesize=(595.27, 841.89))
        
        pdf_bytes = img2pdf.convert(
            [str(p) for p in image_paths],
            layout_fun=a4_layout
        )
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
