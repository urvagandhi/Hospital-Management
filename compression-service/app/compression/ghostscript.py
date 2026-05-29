import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Same configs as preprocessor for consistency in GS flags
GS_PIPELINE_TIMEOUT = 600.0
GS_TIER_CONFIGS = {
    0: {"dpi": 300, "quality": 85, "downsample": "/Bicubic"},
    1: {"dpi": 200, "quality": 72, "downsample": "/Bicubic"},
    2: {"dpi": 150, "quality": 58, "downsample": "/Bicubic"},
    3: {"dpi": 150, "quality": 45, "downsample": "/Average"},
    4: {"dpi": 120, "quality": 32, "downsample": "/Subsample"},
    5: {"dpi": 100, "quality": 25, "downsample": "/Subsample"},
}

async def run_ghostscript_explicit(
    input_path: Path,
    output_path: Path,
    tier: int,
    job_id: str,
) -> None:
    """Run Ghostscript with explicit flags for deep stream compression.

    Bypasses -dPDFSETTINGS presets in favor of fine-grained control.
    Forces re-encoding using AutoFilterColorImages=false.
    """

    config = GS_TIER_CONFIGS.get(tier, GS_TIER_CONFIGS[5])
    dpi = config["dpi"]
    quality = config["quality"]
    downsample_type = config["downsample"]
    grayscale = (tier >= 3)

    cmd = [
        "gs",
        "-dBATCH",
        "-dNOPAUSE",
        "-dQUIET",
        "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dSubsetFonts=true",
        "-dEmbedAllFonts=false",
        "-dCompressPages=true",
        "-dUseFlateCompression=true",
        "-dDetectDuplicateImages=true",
        "-dAutoRotatePages=/None",
        "-dOmitInfoDate=true",
        "-dFastWebView=true",
        # Color Image Flags
        "-dDownsampleColorImages=true",
        f"-dColorImageDownsampleType={downsample_type}",
        f"-dColorImageResolution={dpi}",
        "-dAutoFilterColorImages=false",
        "-dColorImageFilter=/DCTEncode",
        f"-dJPEGQ={quality}",
        # Gray Image Flags
        "-dDownsampleGrayImages=true",
        f"-dGrayImageDownsampleType={downsample_type}",
        f"-dGrayImageResolution={dpi}",
        "-dAutoFilterGrayImages=false",
        "-dGrayImageFilter=/DCTEncode",
        # Mono Image Flags
        "-dDownsampleMonoImages=true",
        "-dMonoImageResolution=300" if tier <= 2 else "-dMonoImageResolution=200",
        f"-sOutputFile={output_path}",
    ]

    if grayscale:
        cmd.extend([
            "-sColorConversionStrategy=Gray",
            "-dProcessColorModel=/DeviceGray",
        ])

    cmd.append(str(input_path))

    cmd_str = " ".join(cmd)
    input_mb = input_path.stat().st_size / (1024 * 1024)
    logger.info(
        f"GS Tier {tier} Start ({input_mb:.2f} MB in) — cmd: {cmd_str}",
        extra={
            "job_id": job_id,
            "event": "gs_explicit_start",
            "tier": tier,
            "dpi": dpi,
            "input_mb": round(input_mb, 2),
            "cmd": cmd_str,
        }
    )

    import time as _time
    _gs_start = _time.monotonic()

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    try:
        stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("Ghostscript timed out after 300 seconds")

    elapsed_ms = int((_time.monotonic() - _gs_start) * 1000)

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace")
        out_msg = stdout.decode(errors="replace")
        logger.error(
            f"Ghostscript failed with code {proc.returncode} after {elapsed_ms}ms",
            extra={
                "job_id": job_id,
                "stderr": err_msg[:300],
                "stdout": out_msg[:300],
                "elapsed_ms": elapsed_ms,
            }
        )
        raise RuntimeError(f"Ghostscript failed (code {proc.returncode}): {err_msg[:500]}")

    out_mb = output_path.stat().st_size / (1024 * 1024)
    logger.info(
        f"GS Tier {tier} Done ({input_mb:.2f} MB → {out_mb:.2f} MB in {elapsed_ms}ms)",
        extra={
            "job_id": job_id,
            "event": "gs_explicit_done",
            "tier": tier,
            "size": output_path.stat().st_size,
            "elapsed_ms": elapsed_ms,
        }
    )
