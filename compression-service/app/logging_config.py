import json
import logging
import os
import sys
from datetime import datetime, timezone


class JsonFormatter(logging.Formatter):
    """Minimal structured JSON formatter — one JSON object per log line."""

    def format(self, record: logging.LogRecord) -> str:
        entry: dict = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        # Merge extra fields attached by application code
        for key in ("job_id", "user_id", "patient_id", "event", "metrics"):
            val = getattr(record, key, None)
            if val is not None:
                entry[key] = val
        if record.exc_info and record.exc_info[0] is not None:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


class ConsoleFormatter(logging.Formatter):
    """Colorful console formatter for development."""

    grey = "\x1b[38;20m"
    blue = "\x1b[34;20m"
    yellow = "\x1b[33;20m"
    red = "\x1b[31;20m"
    bold_red = "\x1b[31;1m"
    reset = "\x1b[0m"
    cyan = "\x1b[36m"
    green = "\x1b[32m"

    FORMATS = {
        logging.DEBUG: blue + "%(levelname)s" + reset + " (%(name)s): %(message)s",
        logging.INFO: green + "%(levelname)s" + reset + ": %(message)s",
        logging.WARNING: yellow + "%(levelname)s" + reset + ": %(message)s",
        logging.ERROR: red + "%(levelname)s" + reset + ": %(message)s",
        logging.CRITICAL: bold_red + "%(levelname)s" + reset + ": %(message)s",
    }

    def format(self, record):
        # Add timestamp
        time_str = datetime.now().strftime("%H:%M:%S.%f")[:-3]
        log_fmt = self.FORMATS.get(record.levelno)
        
        # Format the message
        message = record.getMessage()
        
        # If there's an 'event' in extra, highlight it
        event = getattr(record, "event", None)
        if event:
            message = f"{self.cyan}[{event}]{self.reset} {message}"
            
        # Add Job ID if present (show last 8 chars)
        job_id = getattr(record, "job_id", None)
        if job_id:
            short_id = str(job_id)[-8:]
            message = f"{self.grey}({short_id}){self.reset} {message}"

        # Add Metrics if present
        metrics = getattr(record, "metrics", None)
        if metrics:
            message = f"{message} {self.grey}{metrics}{self.reset}"
            
        # Format the final string
        formatter = logging.Formatter(f"{self.grey}{time_str}{self.reset} {log_fmt}")
        return formatter.format(record).replace(record.getMessage(), message)


def setup_logging() -> None:
    is_prod = os.environ.get("ENV") == "production"
    
    handler = logging.StreamHandler(sys.stdout)
    if is_prod:
        handler.setFormatter(JsonFormatter())
    else:
        handler.setFormatter(ConsoleFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(logging.INFO)
    
    # Quiet noisy libs
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
