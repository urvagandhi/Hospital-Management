import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Request

router = APIRouter()
logger = logging.getLogger(__name__)


def _infer_health_check_source(user_agent: str) -> str:
    ua = user_agent.lower()
    if "uptime" in ua or "statuscake" in ua or "healthcheck" in ua:
        return "uptime-monitor"
    if "cron" in ua:
        return "cron-job"
    if ua:
        return "manual-or-client"
    return "unknown"


@router.get("/api/health")
async def health(request: Request):
    user_agent = request.headers.get("user-agent", "")
    forwarded_for = request.headers.get("x-forwarded-for", "")
    client_ip = (
        forwarded_for.split(",", 1)[0].strip()
        if forwarded_for
        else (request.client.host if request.client else "unknown")
    )
    logger.info(
        "Health endpoint hit",
        extra={
            "event": "health_hit",
            "metrics": {
                "source": _infer_health_check_source(user_agent),
                "client_ip": client_ip,
                "user_agent": user_agent,
            },
        },
    )
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
