import logging
import shutil
import uuid
from pathlib import Path
from typing import List, Union

import pikepdf

from app.compression.classifier import classify_pdf, PdfType
from app.compression.digital_path import compress_digital_pdf_enhanced
from app.compression.adaptive_loop import run_adaptive_compression_loop, CompressionResult

logger = logging.getLogger(__name__)

class CompressionPipeline:
    """Orchestrates the multi-stage compression process.
    
    1. Merge (if multiple)
    2. Classify (Digital vs Scanned)
    3. Route to specialized compression path
    4. Adaptive loop (if scanned)
    """
    
    def __init__(self, base_temp_dir: str = "/tmp/jobs"):
        self.base_temp_dir = Path(base_temp_dir)
        self.base_temp_dir.mkdir(parents=True, exist_ok=True)

    async def run(
        self, 
        pdf_paths: Union[List[Path], Path], 
        target_size_bytes: int, 
        job_id: str
    ) -> CompressionResult:
        # Use the provided job_id as the work directory name
        # This aligns with the directory created by the endpoints
        work_dir = self.base_temp_dir / job_id
        work_dir.mkdir(parents=True, exist_ok=True)
        
        try:
            # 1. Merge if necessary (if passed a list)
            if isinstance(pdf_paths, list):
                if len(pdf_paths) > 1:
                    merged_path = work_dir / "merged_source.pdf"
                    self._merge_pdfs(pdf_paths, merged_path)
                    source_pdf = merged_path
                else:
                    source_pdf = pdf_paths[0]
            else:
                source_pdf = pdf_paths

            # 2. Classify
            pdf_type = classify_pdf(source_pdf)
            logger.info(f"PDF classified as {pdf_type.value}", extra={"job_id": job_id})

            # 3. Route
            if pdf_type == PdfType.DIGITAL:
                output_path = work_dir / "compressed_final.pdf"
                final_path = compress_digital_pdf_enhanced(source_pdf, output_path, job_id)
                return CompressionResult(
                    output_path=final_path,
                    tier_used=0,
                    output_size_bytes=final_path.stat().st_size
                )
            else:
                # Scanned path uses the adaptive loop
                return await run_adaptive_compression_loop(
                    source_pdf,
                    target_size_bytes,
                    pdf_type,
                    work_dir,
                    job_id
                )

        except Exception as e:
            logger.error(f"Pipeline failed: {e}", exc_info=True, extra={"job_id": job_id})
            # Re-raise so the endpoint can handle it
            raise

    def _merge_pdfs(self, paths: List[Path], output_path: Path):
        """Merge multiple PDFs using pikepdf."""
        with pikepdf.open(paths[0]) as pdf:
            for other_path in paths[1:]:
                with pikepdf.open(other_path) as other:
                    pdf.pages.extend(other.pages)
            pdf.save(output_path)

# Singleton instance
pipeline = CompressionPipeline()
