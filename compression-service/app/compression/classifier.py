import logging
from enum import Enum
from pathlib import Path

import pikepdf
from pdfminer.high_level import extract_text

logger = logging.getLogger(__name__)

class PdfType(str, Enum):
    DIGITAL = "digital"
    SCANNED = "scanned"

_MIN_TEXT_CHARS = 50
_MAX_SAMPLE_PAGES = 5
_DIGITAL_THRESHOLD_RATIO = 0.6  # At least 60% of sampled pages must have text to be DIGITAL

def classify_pdf(pdf_path: Path) -> PdfType:
    """Detect if PDF is digital (text layer) or scanned (image-only).
    
    Logic:
    - Sample diversely: first few (covers), middle, and last.
    - If a significant portion of pages lack text, it's likely a scanned record
      even if there is a digital cover page at the start.
    """
    try:
        with pikepdf.open(pdf_path) as pdf:
            page_count = len(pdf.pages)
            if page_count == 0:
                return PdfType.SCANNED
            
            # Sample diversely: first few, middle, and last
            indices = set()
            indices.add(0) # First page (often cover)
            if page_count > 1:
                indices.add(page_count - 1) # Last page
            if page_count > 2:
                indices.add(page_count // 2) # Middle page
            if page_count > 5:
                indices.add(1)
                indices.add(page_count - 2)
            
            page_numbers = sorted(list(indices))[:_MAX_SAMPLE_PAGES]
            
            text_pages = 0
            for pg_num in page_numbers:
                # Extract text for a single page to check individual page "digital-ness"
                try:
                    page_text = extract_text(pdf_path, page_numbers=[pg_num])
                    if len(page_text.strip()) >= _MIN_TEXT_CHARS:
                        text_pages += 1
                except Exception:
                    continue
            
            ratio = text_pages / len(page_numbers)
            
            # If at least 60% of sampled pages are digital, we treat the whole doc as digital.
            # This allows for 1-2 cover pages in a 5-page sample without forcing scanned path.
            # However, if it's a 1-page cover + 4 scanned pages, ratio will be 0.2, and we'll
            # correctly route to the SCANNED path to compress those images.
            if ratio >= _DIGITAL_THRESHOLD_RATIO:
                return PdfType.DIGITAL
            
            return PdfType.SCANNED
            
    except Exception as e:
        logger.warning(f"Classification failed for {pdf_path}: {e}. Defaulting to scanned.")
        return PdfType.SCANNED

def classify_for_processing(pdf_paths: list[Path]) -> PdfType:
    """Classify a batch. If ANY PDF is SCANNED, treat the whole batch as SCANNED
    to ensure image-level compression is applied to the merged result.
    """
    for path in pdf_paths:
        if classify_pdf(path) == PdfType.SCANNED:
            return PdfType.SCANNED
    return PdfType.DIGITAL
