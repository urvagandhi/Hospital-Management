import logging
from pathlib import Path
import pikepdf

logger = logging.getLogger(__name__)

def compress_digital_pdf_enhanced(input_path: Path, output_path: Path, job_id: str) -> Path:
    """High-efficiency pikepdf compression for text-layer PDFs.
    
    Strips metadata and re-compresses streams without touching image pixels.
    """
    logger.info("Starting enhanced digital compression", extra={"job_id": job_id})
    
    with pikepdf.open(input_path) as pdf:
        # Strip metadata bloat
        if "/Metadata" in pdf.root:
            del pdf.root["/Metadata"]
        if "/PieceInfo" in pdf.root:
            del pdf.root["/PieceInfo"]
        
        # Save with aggressive object and stream compression
        pdf.save(
            output_path,
            compress_streams=True,
            recompress_flate=True,
            object_stream_mode=pikepdf.ObjectStreamMode.generate,
            linearize=False,
            stream_decode_level=pikepdf.StreamDecodeLevel.generalized
        )
        
    logger.info(
        "Digital compression done", 
        extra={
            "job_id": job_id, 
            "size": output_path.stat().st_size
        }
    )
    return output_path
