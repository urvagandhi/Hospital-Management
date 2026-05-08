"""Dedicated ProcessPoolExecutor for CPU-bound compression work.

Why a process pool, not the default thread pool:
- Render runs the service with `uvicorn --workers 1`, so all asyncio + HTTP
  handling (including `/api/health`) lives on a single event loop.
- Heavy PIL/img2pdf/pikepdf work holds the GIL for minutes at a time. With a
  thread executor (the default for `loop.run_in_executor(None, ...)`), the
  event loop is starved of CPU and Render's 5-second health-check probe
  times out, killing the instance mid-job.
- Running CPU-heavy tasks in a child process keeps the parent's event loop
  on its own GIL and its own kernel scheduler slice, so health checks stay
  responsive while compression grinds.

The pool is initialised lazily on first use and reused for the lifetime of
the service. `spawn` start method is used because fork() + asyncio threads
is unsafe (fork copies a half-initialised event loop).
"""
import logging
import multiprocessing as mp
import os
from concurrent.futures import ProcessPoolExecutor
from threading import Lock
from typing import Optional

logger = logging.getLogger(__name__)

_pool: Optional[ProcessPoolExecutor] = None
_lock = Lock()


def get_cpu_pool() -> ProcessPoolExecutor:
    """Return the shared CPU process pool, creating it on first use."""
    global _pool
    if _pool is None:
        with _lock:
            if _pool is None:
                ctx = mp.get_context("spawn")
                # max_workers=2 maps to the production droplet's 2 vCPUs so
                # two source PDFs can rasterize in parallel within a single
                # patient-download job. Memory ceiling per worker stays the
                # same (the inner ThreadPoolExecutor already releases the
                # GIL during PIL work), so peak RSS is ~2× the single-worker
                # baseline — still inside the 2 GB box per the audits.
                workers = int(os.environ.get("CPU_POOL_WORKERS", "2"))
                _pool = ProcessPoolExecutor(max_workers=workers, mp_context=ctx)
                logger.info(
                    "CPU process pool initialised (spawn, max_workers=%d)",
                    workers,
                )
    return _pool


def shutdown_cpu_pool() -> None:
    """Cleanly tear down the pool on application shutdown."""
    global _pool
    with _lock:
        if _pool is not None:
            try:
                _pool.shutdown(wait=False, cancel_futures=True)
                logger.info("CPU process pool shut down")
            except Exception as e:
                logger.warning(f"CPU pool shutdown error: {e}")
            _pool = None
