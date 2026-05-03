# syntax=docker/dockerfile:1.7
# ─────────────────────────────────────────────────────────────────────────────
# Hospital Management — Compression Sidecar (FastAPI + GhostScript + pikepdf)
# Production image. Pinned Python, system GhostScript, non-root user, tini for
# clean PID 1 signal handling.
#
# Build:  docker build -t hms-compression:local compression-service/
# Run:    docker run --rm -p 8000:8000 \
#           --env-file compression-service/.env hms-compression:local
# ─────────────────────────────────────────────────────────────────────────────

ARG PYTHON_VERSION=3.12.7-slim-bookworm

FROM python:${PYTHON_VERSION} AS runtime

WORKDIR /app

# Python runtime hygiene
#   - PYTHONDONTWRITEBYTECODE: no .pyc clutter outside of compileall
#   - PYTHONUNBUFFERED:        flush stdout/stderr immediately (clean docker logs)
#   - PIP_*:                   silent, deterministic, no cached wheels in image
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_PREFER_BINARY=1 \
    PORT=8000

# ── System packages ──────────────────────────────────────────────────────────
#   ghostscript     PDF compression pipeline (tier ladder)
#   poppler-utils   pdftotext / pdftoppm — inspection helpers
#   fonts-dejavu    safe fallback fonts for any text rendering (cover pages)
#   tini            proper PID 1 (forwards SIGTERM, reaps zombies)
#   ca-certificates HTTPS to Cloudinary / Mongo
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
        ghostscript \
        poppler-utils \
        fonts-dejavu-core \
        tini \
        ca-certificates \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# ── Python deps ──────────────────────────────────────────────────────────────
# Copy requirements first so this layer only invalidates when deps change
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ── Application code ─────────────────────────────────────────────────────────
COPY app/ ./app/

# Pre-compile bytecode so first request is faster (no JIT compile of every module)
RUN python -m compileall -q app/

# ── Non-root user + writable scratch dir ─────────────────────────────────────
RUN groupadd -r appuser \
 && useradd  -r -g appuser -d /app -s /sbin/nologin appuser \
 && mkdir -p /app/tmp/jobs \
 && chown -R appuser:appuser /app

ENV JOB_TMP_DIR=/app/tmp/jobs

USER appuser

EXPOSE 8000

# Liveness probe — sidecar exposes /api/health on port 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; \
                 sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)" \
       || exit 1

# OCI metadata
LABEL org.opencontainers.image.title="hms-compression" \
      org.opencontainers.image.description="Hospital Management — PDF compression sidecar (FastAPI + GhostScript + pikepdf)" \
      org.opencontainers.image.source="https://github.com/<owner>/Hospital-Management" \
      org.opencontainers.image.licenses="Proprietary"

# tini = PID 1; uvicorn handles its own signals correctly downstream
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log"]
