import logging
from pathlib import Path
import img2pdf
from PIL import Image

logger = logging.getLogger(__name__)

def rebuild_pdf_from_images(image_paths: list[Path], output_path: Path) -> Path:
    """Combine images into a single PDF. Forces A4 page size with aspect ratio preservation."""
    if not image_paths:
        raise ValueError("No images provided for rebuilding PDF")

    try:
        # A4 in points (72 DPI)
        a4_width = img2pdf.mm_to_pt(210)
        a4_height = img2pdf.mm_to_pt(297)
        # FitMode.exact stretches images to fill the full A4 page edge-to-edge,
        # so scanned pages look visually identical in size to the cover pages.
        layout_fun = img2pdf.get_layout_fun(
            pagesize=(a4_width, a4_height),
            fit=img2pdf.FitMode.exact,
        )

        with open(output_path, "wb") as f:
            f.write(img2pdf.convert(
                [str(p) for p in image_paths],
                layout_fun=layout_fun
            ))
        return output_path
    except Exception as e:
        logger.warning(f"img2pdf failed: {e}. Falling back to Pillow with A4 force.")
        
        # A4 at 72 DPI is ~595x842 pixels. 
        # But for medical quality, we'll use a higher target like 300 DPI for the canvas.
        # 300 DPI A4 is 2480 x 3508 pixels.
        A4_PIXELS = (2480, 3508)
        
        images = []
        try:
            for p in image_paths:
                img = Image.open(p)
                if img.mode != "RGB":
                    img = img.convert("RGB")
                
                # Create white A4 canvas
                canvas = Image.new("RGB", A4_PIXELS, (255, 255, 255))
                
                # Scale image to fit A4 while preserving aspect ratio
                img.thumbnail(A4_PIXELS, Image.Resampling.LANCZOS)
                
                # Center on canvas
                offset = (
                    (A4_PIXELS[0] - img.width) // 2,
                    (A4_PIXELS[1] - img.height) // 2
                )
                canvas.paste(img, offset)
                images.append(canvas)
            
            if images:
                images[0].save(
                    output_path,
                    save_all=True,
                    append_images=images[1:],
                    resolution=300.0
                )
                # Close all images
                for img in images:
                    img.close()
                return output_path
            else:
                raise RuntimeError("Pillow fallback produced no images")
        except Exception as e2:
            logger.error(f"Pillow fallback also failed: {e2}")
            raise e2
