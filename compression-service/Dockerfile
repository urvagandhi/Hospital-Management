FROM python:3.11-slim

# Prevent Python from writing .pyc files and enable unbuffered logging
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONOPTIMIZE=1

# System deps for Ghostscript + PDF processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ghostscript \
        poppler-utils \
        libjpeg-dev \
        zlib1g-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

# Copy requirements first to leverage Docker layer caching
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/

# Pre-compile Python bytecode for faster startup
RUN python -m compileall app/

# Ensure /tmp/jobs is writable for job temp files
RUN mkdir -p /tmp/jobs && chown -R appuser:appuser /app /tmp/jobs

USER appuser

EXPOSE 8000

# Use shell form with exec to respect $PORT while maintaining fast startup and signal handling
# Added --timeout-keep-alive 600 to prevent premature closes during long compression jobs
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --no-access-log --timeout-keep-alive 600
