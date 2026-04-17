from enum import Enum
from pathlib import Path

import pypdfium2 as pdfium


class PdfType(str, Enum):
    DIGITAL = "digital"
    SCANNED = "scanned"


_MIN_TEXT_CHARS_PER_PAGE = 200
_DIGITAL_PAGE_RATIO = 0.80
_MAX_SAMPLE_PAGES = 5


def classify_pdf(pdf_path: Path) -> PdfType:
    """Classify a single PDF as DIGITAL or SCANNED.

    Samples up to 5 pages (first 3 + last 2). A page counts as
    "has text" if extracted text ≥ 200 chars. DIGITAL requires
    ≥ 80% of sampled pages to have text. Errs toward SCANNED.
    """
    doc = pdfium.PdfDocument(pdf_path)
    page_count = len(doc)

    if page_count == 0:
        doc.close()
        return PdfType.SCANNED

    # Sample indices: first 3 + last 2, deduped
    indices = list(range(min(3, page_count)))
    if page_count > 3:
        indices.extend(range(max(3, page_count - 2), page_count))
    indices = sorted(set(indices))[:_MAX_SAMPLE_PAGES]

    text_pages = 0
    for idx in indices:
        page = doc[idx]
        textpage = page.get_textpage()
        text = textpage.get_text_range()
        textpage.close()
        page.close()
        if len(text.strip()) >= _MIN_TEXT_CHARS_PER_PAGE:
            text_pages += 1

    doc.close()

    ratio = text_pages / len(indices)
    return PdfType.DIGITAL if ratio >= _DIGITAL_PAGE_RATIO else PdfType.SCANNED


def classify_for_processing(pdf_paths: list[Path]) -> PdfType:
    """Classify a batch. If ANY PDF is SCANNED, treat all as SCANNED."""
    for path in pdf_paths:
        if classify_pdf(path) == PdfType.SCANNED:
            return PdfType.SCANNED
    return PdfType.DIGITAL
