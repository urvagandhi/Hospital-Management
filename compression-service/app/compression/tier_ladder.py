import logging
from dataclasses import dataclass
from enum import IntEnum
from pathlib import Path

import pikepdf

from app.compression.ghostscript import run_ghostscript

logger = logging.getLogger(__name__)


class TierLevel(IntEnum):
    TIER_0 = 0
    TIER_1 = 1
    TIER_2 = 2
    TIER_3 = 3
    TIER_4 = 4


@dataclass(frozen=True)
class TierConfig:
    level: TierLevel
    gs_preset: str
    dpi: int
    grayscale: bool


TIERS: list[TierConfig] = [
    TierConfig(TierLevel.TIER_0, "/printer", 300, False),
    TierConfig(TierLevel.TIER_1, "/ebook", 200, False),
    TierConfig(TierLevel.TIER_2, "/ebook", 150, False),
    TierConfig(TierLevel.TIER_3, "/ebook", 150, True),
    TierConfig(TierLevel.TIER_4, "/screen", 150, True),
]


class SizeFloorBreached(Exception):
    """Raised when even Tier 4 cannot meet the target size."""

    def __init__(self, min_achievable_bytes: int) -> None:
        self.min_achievable_bytes = min_achievable_bytes
        super().__init__(
            f"Minimum achievable size: {min_achievable_bytes / 1_048_576:.2f} MB"
        )


@dataclass
class CompressionResult:
    output_path: Path
    tier_used: int
    output_size_bytes: int


async def run_tier_ladder(
    merged_pdf_path: Path,
    target_size_bytes: int,
    job_dir: Path,
    job_id: str,
) -> CompressionResult:
    """Try tiers 0→4 on a merged scanned PDF, stop at first fit.

    Always runs at least Tier 0 — even if the merged file fits the target —
    because the merged output must stay under Cloudinary's 10 MB upload limit.

    Raises SizeFloorBreached if Tier 4 still exceeds target.
    """
    # Cloudinary free tier upload limit
    CLOUDINARY_MAX_BYTES = 10_485_760  # 10 MB

    effective_target = min(target_size_bytes, CLOUDINARY_MAX_BYTES)

    last_output: Path | None = None
    last_size = 0

    for tier in TIERS:
        output_path = job_dir / f"tier_{tier.level.value}.pdf"

        await run_ghostscript(
            input_path=merged_pdf_path,
            output_path=output_path,
            preset=tier.gs_preset,
            dpi=tier.dpi,
            grayscale=tier.grayscale,
            job_id=job_id,
        )

        output_size = output_path.stat().st_size
        last_output = output_path
        last_size = output_size

        logger.info(
            "Tier result",
            extra={
                "job_id": job_id,
                "event": "tier_result",
                "metrics": {
                    "tier": tier.level.value,
                    "output_bytes": output_size,
                    "target_bytes": effective_target,
                    "fits": output_size <= effective_target,
                },
            },
        )

        if output_size <= effective_target:
            return CompressionResult(
                output_path=output_path,
                tier_used=tier.level.value,
                output_size_bytes=output_size,
            )

    # All tiers exhausted
    raise SizeFloorBreached(min_achievable_bytes=last_size)


async def compress_digital_pdf(
    pdf_path: Path,
    job_dir: Path,
    job_id: str,
) -> Path:
    """Compress a digital PDF using pikepdf stream compression only.

    No rasterization — preserves vector text quality.
    """
    output_path = job_dir / "digital_compressed.pdf"

    logger.info(
        "Compressing digital PDF with pikepdf",
        extra={"job_id": job_id, "event": "pikepdf_start"},
    )

    pdf = pikepdf.open(pdf_path)
    pdf.save(
        output_path,
        compress_streams=True,
        object_stream_mode=pikepdf.ObjectStreamMode.generate,
    )
    pdf.close()

    logger.info(
        "pikepdf compression done",
        extra={
            "job_id": job_id,
            "event": "pikepdf_done",
            "metrics": {"output_size": output_path.stat().st_size},
        },
    )

    return output_path
