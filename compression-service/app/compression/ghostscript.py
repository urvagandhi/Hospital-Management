import asyncio
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


async def run_ghostscript(
    input_path: Path,
    output_path: Path,
    preset: str,
    dpi: int,
    grayscale: bool,
    job_id: str,
) -> None:
    """Run Ghostscript as an async subprocess.

    Args:
        input_path: Source PDF.
        output_path: Where to write compressed output.
        preset: One of /printer, /ebook, /screen.
        dpi: Target resolution.
        grayscale: If True, convert to grayscale.
        job_id: For log correlation.

    Raises:
        RuntimeError: If Ghostscript exits non-zero.
    """
    cmd = [
        "gs",
        "-sDEVICE=pdfwrite",
        "-dNOPAUSE",
        "-dBATCH",
        "-dQUIET",
        f"-dPDFSETTINGS={preset}",
        f"-dDownsampleColorImages=true",
        f"-dColorImageResolution={dpi}",
        f"-dDownsampleGrayImages=true",
        f"-dGrayImageResolution={dpi}",
        f"-dDownsampleMonoImages=true",
        f"-dMonoImageResolution={dpi}",
        f"-sOutputFile={output_path}",
    ]

    if grayscale:
        cmd.extend([
            "-sColorConversionStrategy=Gray",
            "-dProcessColorModel=/DeviceGray",
        ])

    cmd.append(str(input_path))

    logger.info(
        "Running Ghostscript",
        extra={
            "job_id": job_id,
            "event": "gs_start",
            "metrics": {"preset": preset, "dpi": dpi, "grayscale": grayscale},
        },
    )

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    _, stderr = await proc.communicate()

    if proc.returncode != 0:
        err_msg = stderr.decode(errors="replace")
        logger.error(
            "Ghostscript failed",
            extra={
                "job_id": job_id,
                "event": "gs_error",
                "metrics": {"returncode": proc.returncode, "stderr": err_msg[:500]},
            },
        )
        raise RuntimeError(f"Ghostscript exited {proc.returncode}: {err_msg[:500]}")

    logger.info(
        "Ghostscript completed",
        extra={
            "job_id": job_id,
            "event": "gs_done",
            "metrics": {"output_size": output_path.stat().st_size},
        },
    )
