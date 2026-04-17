FROM python:3.11-slim

# System deps for Ghostscript + PDF processing
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ghostscript \
        poppler-utils \
        libjpeg-dev \
        zlib1g-dev && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Non-root user
RUN groupadd -r appuser && useradd -r -g appuser -d /app -s /sbin/nologin appuser

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# /tmp writable for job temp files
RUN mkdir -p /tmp/jobs && chown -R appuser:appuser /app /tmp/jobs

USER appuser

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
