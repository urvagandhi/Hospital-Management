"""Cover page generator matching Node backend's pdf-lib design.

Produces a US Letter (612×792pt) page with:
- Dark navy header bar with folder name + "MEDICAL RECORDS" subtitle
- Decorative divider with accent dot
- Patient name card with blue left accent stripe
- Document list with alternating row shading
- Footer with "Hospital Management System" / "Confidential Medical Records"

Uses fpdf2 for page rendering, returns a pikepdf-compatible PDF path.
"""

import logging
from datetime import datetime, timezone
from pathlib import Path

from fpdf import FPDF

from app.schemas import FileInfo

logger = logging.getLogger(__name__)

# ── Colors (matching Node's rgb values) ──────────────────────────
_HEADER_BG = (25, 50, 100)       # #193265 dark navy
_ACCENT = (61, 130, 245)         # #3D82F5 bright blue
_PAGE_BG = (248, 251, 255)       # #F8FBFF
_BORDER = (220, 228, 239)        # #DCE4EF
_CARD_SHADOW = (206, 215, 226)   # ~#CED7E2
_DARK = (28, 40, 62)             # #1C283E
_MUTED = (144, 154, 168)         # #909AA8
_WHITE = (255, 255, 255)
_BLUE_LIGHT = (181, 210, 252)    # #B5D2FC
_ROW_ALT = (246, 248, 252)       # light blue tint for alternating rows

# US Letter in mm (fpdf2 uses mm by default)
_W = 215.9  # 612pt
_H = 279.4  # 792pt

# Conversion: 1pt = 0.3528mm
_PT = 0.3528


def generate_cover_page(
    title: str,
    patient_name: str,
    files_info: list[FileInfo],
    job_dir: Path,
    folder_index: int = 0,
) -> Path:
    """Generate a cover page PDF matching the Node backend design.

    Returns path to a single-page PDF in job_dir.
    """
    output_path = job_dir / f"cover_{folder_index}.pdf"

    pdf = FPDF(unit="mm", format="Letter")
    pdf.set_auto_page_break(auto=False)
    pdf.add_page()

    # ─── Page Background ─────────────────────────────────────────
    pdf.set_fill_color(*_PAGE_BG)
    pdf.rect(0, 0, _W, _H, "F")

    # ─── Top Header (100pt tall = ~35.3mm from top) ──────────────
    header_h = 100 * _PT
    pdf.set_fill_color(*_HEADER_BG)
    pdf.rect(0, 0, _W, header_h, "F")

    # Accent stripe at very top (4pt = ~1.4mm)
    pdf.set_fill_color(*_ACCENT)
    pdf.rect(0, 0, _W, 4 * _PT, "F")

    # Title text (folder name, uppercase)
    pdf.set_font("Helvetica", "B", 22)
    pdf.set_text_color(*_WHITE)
    title_y = 14 * _PT  # ~14pt from top of header
    pdf.set_xy(40 * _PT, title_y)
    pdf.cell(0, 22 * _PT, title.upper(), new_x="LEFT", new_y="NEXT")

    # "MEDICAL RECORDS" subtitle
    pdf.set_font("Helvetica", "B", 9)
    pdf.set_text_color(*_BLUE_LIGHT)
    pdf.set_xy(40 * _PT, title_y + 30 * _PT)
    pdf.cell(0, 9 * _PT, "MEDICAL RECORDS")

    # ─── Decorative Divider (at ~y=224pt from top = 568 from bottom) ──
    divider_y = header_h + 40 * _PT
    pdf.set_fill_color(*_BORDER)
    pdf.rect(40 * _PT, divider_y, 247 * _PT, 0.35, "F")
    pdf.set_fill_color(*_ACCENT)
    pdf.rect(302 * _PT, divider_y - 1.4, 8 * _PT, 8 * _PT, "F")
    pdf.set_fill_color(*_BORDER)
    pdf.rect(325 * _PT, divider_y, 247 * _PT, 0.35, "F")

    # ─── Patient Card ────────────────────────────────────────────
    cx = 40 * _PT
    card_y = divider_y + 30 * _PT
    cw = 532 * _PT
    ch = 90 * _PT

    # Shadow
    pdf.set_fill_color(*_CARD_SHADOW)
    pdf.rect(cx + 1, card_y + 1, cw, ch, "F")
    # Card background
    pdf.set_fill_color(*_WHITE)
    pdf.rect(cx, card_y, cw, ch, "F")
    # Blue left accent
    pdf.set_fill_color(*_ACCENT)
    pdf.rect(cx, card_y, 5 * _PT, ch, "F")

    # "PATIENT" label
    pdf.set_font("Helvetica", "B", 7.5)
    pdf.set_text_color(*_MUTED)
    pdf.set_xy(cx + 20 * _PT, card_y + 5 * _PT)
    pdf.cell(0, 7.5 * _PT, "PATIENT")

    # Patient name
    display_name = patient_name if patient_name else ""
    if len(display_name) > 40:
        display_name = display_name[:37] + "..."
    pdf.set_font("Helvetica", "B", 24)
    pdf.set_text_color(*_DARK)
    pdf.set_xy(cx + 20 * _PT, card_y + 20 * _PT)
    pdf.cell(cw - 50 * _PT, 24 * _PT, display_name)

    # ─── Document List ───────────────────────────────────────────
    list_y = card_y + ch + 10 * _PT

    if files_info:
        doc_word = "Document" if len(files_info) == 1 else "Documents"

        # Section heading
        pdf.set_font("Helvetica", "B", 8)
        pdf.set_text_color(*_DARK)
        pdf.set_xy(cx + 20 * _PT, list_y)
        pdf.cell(0, 8 * _PT, f"{len(files_info)} {doc_word} in this Folder")

        # Divider line
        pdf.set_fill_color(*_BORDER)
        pdf.rect(cx, list_y + 10 * _PT, cw, 0.35, "F")

        # Column headers
        col_y = list_y + 16 * _PT
        pdf.set_font("Helvetica", "B", 6.5)
        pdf.set_text_color(*_MUTED)
        pdf.set_xy(cx + 12 * _PT, col_y)
        pdf.cell(20 * _PT, 6.5 * _PT, "#")
        pdf.set_xy(cx + 32 * _PT, col_y)
        pdf.cell(0, 6.5 * _PT, "FILE NAME")
        pdf.set_xy(cx + 450 * _PT, col_y)
        pdf.cell(0, 6.5 * _PT, "PAGES")

        pdf.set_fill_color(*_BORDER)
        pdf.rect(cx, col_y + 8 * _PT, cw, 0.26, "F")

        # File rows
        row_h = 22 * _PT
        file_y = col_y + 14 * _PT
        max_rows = int((_H - 32 * _PT - file_y) / row_h)

        for i, f in enumerate(files_info):
            if i >= max_rows:
                break

            # Alternating background
            if i % 2 == 0:
                pdf.set_fill_color(*_ROW_ALT)
                pdf.rect(cx, file_y - 2 * _PT, cw, row_h, "F")

            # Row number
            pdf.set_font("Helvetica", "B", 8)
            pdf.set_text_color(*_MUTED)
            pdf.set_xy(cx + 12 * _PT, file_y)
            pdf.cell(20 * _PT, 8 * _PT, str(i + 1))

            # File name (truncate at 62 chars)
            name = f.file_name
            if len(name) > 62:
                name = name[:59] + "..."
            pdf.set_font("Helvetica", "", 9)
            pdf.set_text_color(*_DARK)
            pdf.set_xy(cx + 32 * _PT, file_y)
            pdf.cell(400 * _PT, 9 * _PT, name)

            # Page count
            if f.page_count is not None:
                pg_str = "1 pg" if f.page_count == 1 else f"{f.page_count} pgs"
            else:
                pg_str = "-"
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_MUTED)
            pdf.set_xy(cx + 450 * _PT, file_y)
            pdf.cell(0, 8 * _PT, pg_str)

            file_y += row_h

        # "...and N more" if truncated
        if len(files_info) > max_rows:
            remaining = len(files_info) - max_rows
            s = "s" if remaining > 1 else ""
            pdf.set_font("Helvetica", "", 8)
            pdf.set_text_color(*_MUTED)
            pdf.set_xy(cx + 32 * _PT, file_y)
            pdf.cell(0, 8 * _PT, f"...and {remaining} more document{s}")

    # ─── Footer ──────────────────────────────────────────────────
    footer_y = _H - 32 * _PT
    pdf.set_fill_color(*_PAGE_BG)
    pdf.rect(0, footer_y, _W, 32 * _PT, "F")
    pdf.set_fill_color(*_BORDER)
    pdf.rect(0, footer_y, _W, 0.35, "F")

    pdf.set_font("Helvetica", "", 7.5)
    pdf.set_text_color(*_MUTED)
    pdf.set_xy(40 * _PT, footer_y + 5 * _PT)
    pdf.cell(0, 7.5 * _PT, "Hospital Management System")

    pdf.set_xy(415 * _PT, footer_y + 5 * _PT)
    pdf.cell(0, 7.5 * _PT, "Confidential Medical Records")

    pdf.output(str(output_path))

    logger.info(
        "Cover page generated",
        extra={
            "event": "cover_page_generated",
            "metrics": {
                "title": title,
                "files_listed": len(files_info),
                "size_bytes": output_path.stat().st_size,
            },
        },
    )

    return output_path
