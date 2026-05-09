"""Admission control for CPU/RAM-bound compression endpoints.

Why this exists:
- The CPU process pool is sized to 2 workers (one per vCPU on the production
  droplet). When a 3rd request lands, it queues *inside* the executor and
  silently waits up to 600s for a slot, which usually bumps into the
  per-endpoint 600s asyncio timeout and surfaces as a generic 504 to the
  user.
- More importantly, every queued request still finishes `fetch_source_pdfs`
  first and dumps raw PDFs into JOB_TMP_DIR. With N concurrent requests we
  pile up N working directories on the 50 GB host disk while only 2 actually
  process — and we hold open Cloudinary connections for the wait.
- Combined RAM headroom on the 2 GB host is ~400 MB after Mongo/Redis/Node
  baseline. Letting an unbounded number of jobs in races the OOM killer
  against MongoDB.

Behaviour:
- A bounded asyncio.Semaphore guards entry to the pipeline.
- If the gate is already at capacity, the endpoint returns `503 Busy` with
  Retry-After immediately — the client (mobile/web download path) can then
  show "merge queued, try again shortly" instead of staring at a spinner.
- Capacity is configurable via `ADMISSION_CAPACITY` env var; default 2.
"""
import asyncio
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

logger = logging.getLogger(__name__)


class AdmissionFull(Exception):
    """Raised when the admission gate is at capacity."""


class AdmissionGate:
    def __init__(self, capacity: int) -> None:
        if capacity < 1:
            raise ValueError(f"capacity must be >= 1, got {capacity}")
        self._sem = asyncio.Semaphore(capacity)
        self.capacity = capacity

    @asynccontextmanager
    async def acquire_or_raise(self) -> AsyncIterator[None]:
        # Single-threaded asyncio: the locked() check and the immediate
        # acquire() that follows are not interleaved with other coroutines
        # because acquire() only suspends when the semaphore is locked.
        if self._sem.locked():
            raise AdmissionFull(f"all {self.capacity} slots in use")
        await self._sem.acquire()
        try:
            yield
        finally:
            self._sem.release()

    @property
    def in_flight(self) -> int:
        # asyncio.Semaphore exposes its internal counter as `_value`; this
        # is the documented attribute name across CPython versions.
        return self.capacity - self._sem._value  # type: ignore[attr-defined]


_HEAVY_CAPACITY = int(os.environ.get("ADMISSION_CAPACITY", "2"))
heavy_gate = AdmissionGate(_HEAVY_CAPACITY)

logger.info(
    "Admission gate initialised: heavy capacity=%d",
    _HEAVY_CAPACITY,
    extra={"event": "admission_init"},
)
