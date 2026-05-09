"""Background sweeper for orphaned per-job temp directories.

The endpoint code already removes its own working directory in `finally:`,
but two failure modes leak:
  1. The sidecar process is OOM-killed (e.g. Mongo and the CPU pool peak
     at the same time). The `finally` block never runs.
  2. A pikepdf/GhostScript subprocess crashes the worker with SIGSEGV;
     the parent re-raises but a partial extracted-image dir can survive.

Each leaked directory holds anything from the source PDFs (~10 MB) up to
3 GB of intermediate 300 dpi PNGs from a scanned-patient extract. On a
50 GB host that goes from "fine for a year" to "disk full at 02:00 on a
Saturday" without much warning.

This sweeper runs every 30 minutes, scans `config.JOB_TMP_DIR`, and removes
any subdirectory whose mtime is older than `_MAX_AGE_S` (1 hour). The hard
pipeline timeout is 600s, so any dir older than 1h is by definition
orphaned.
"""
import asyncio
import logging
import shutil
import time
from pathlib import Path

logger = logging.getLogger(__name__)

_MAX_AGE_S = 60 * 60          # 1 hour
_SWEEP_INTERVAL_S = 30 * 60   # 30 minutes


def _sweep_once(root: Path) -> tuple[int, int]:
    """Returns (removed_count, removed_bytes). Runs synchronously — caller
    schedules it on the default thread executor so disk I/O doesn't block
    the event loop on a slow filesystem."""
    if not root.exists():
        return 0, 0

    cutoff = time.time() - _MAX_AGE_S
    removed = 0
    bytes_freed = 0

    for child in root.iterdir():
        try:
            if not child.is_dir():
                continue
            if child.stat().st_mtime > cutoff:
                continue
            # Tally size best-effort — never let a stat() failure abort
            # the actual removal, which is what matters.
            try:
                size = sum(
                    p.stat().st_size for p in child.rglob("*") if p.is_file()
                )
            except OSError:
                size = 0
            shutil.rmtree(child, ignore_errors=True)
            removed += 1
            bytes_freed += size
        except OSError as e:
            logger.warning(
                "Failed to inspect/remove temp dir",
                extra={
                    "event": "temp_sweep_error",
                    "metrics": {"path": str(child), "error": str(e)},
                },
            )

    return removed, bytes_freed


async def temp_sweeper_loop(root: Path) -> None:
    """Long-running task scheduled by the FastAPI lifespan."""
    while True:
        try:
            removed, bytes_freed = await asyncio.get_running_loop().run_in_executor(
                None, _sweep_once, root
            )
            if removed > 0:
                logger.info(
                    "Temp sweep removed orphaned job dirs",
                    extra={
                        "event": "temp_sweep",
                        "metrics": {
                            "removed_dirs": removed,
                            "bytes_freed": bytes_freed,
                            "root": str(root),
                        },
                    },
                )
        except Exception:
            logger.exception(
                "Temp sweeper iteration failed",
                extra={"event": "temp_sweep_error"},
            )
        await asyncio.sleep(_SWEEP_INTERVAL_S)
