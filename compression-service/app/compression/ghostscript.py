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
    config = GS_TIER_CONFIGS.get(tier, GS_TIER_CONFIGS[4])
    dpi = config["dpi"]
    quality = config["quality"]
    downsample_type = config["downsample"]
    grayscale = (tier >= 3)

    cmd = [
        "gs",
        "-dBATCH", "-dNOPAUSE", "-dQUIET", "-dSAFER",
        "-sDEVICE=pdfwrite",
        "-dCompatibilityLevel=1.4",
        "-dSubsetFonts=true",
        "-dEmbedAllFonts=false",
        "-dCompressPages=true",
        "-dUseFlateCompression=true",
        "-dDetectDuplicateImages=true",
        "-dAutoRotatePages=/None",
        "-dOmitInfoDate=true",
        
        # Color Image Flags
        "-dDownsampleColorImages=true",
        f"-dColorImageDownsampleType={downsample_type}",
        f"-dColorImageResolution={dpi}",
        "-dAutoFilterColorImages=false",
        "-dColorImageFilter=/DCTEncode",
        f"-dColorImageDict=<< /QFactor {100-quality} /HSampling [1 1 1 1] /VSampling [1 1 1 1] >>", # Simplified quality
        # Actually GS uses -dJPEGQ for simpler control
        f"-dJPEGQ={quality}",
        
        # Gray Image Flags
        "-dDownsampleGrayImages=true",
        f"-dGrayImageDownsampleType={downsample_type}",
        f"-dGrayImageResolution={dpi}",
        "-dAutoFilterGrayImages=false",
        "-dGrayImageFilter=/DCTEncode",
        f"-dGrayImageDict=<< /QFactor {100-quality} >>",
        f"-dJPEGQ={quality}",

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

    logger.info(
        f"GS Tier {tier} Start",
        extra={
            "job_id": job_id,
            "event": "gs_explicit_start",
            "tier": tier,
            "dpi": dpi
        }
    )

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    
    try:
        _, stderr = await asyncio.wait_for(proc.communicate(), timeout=300)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError("Ghostscript timed out after 300 seconds")

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace")
        raise RuntimeError(f"Ghostscript failed (code {proc.returncode}): {err_msg[:500]}")

    logger.info(
        f"GS Tier {tier} Done",
        extra={
            "job_id": job_id,
            "event": "gs_explicit_done",
            "size": output_path.stat().st_size
        }
    )
