import asyncio
import hmac
import logging
import os
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import config
from app.cpu_executor import get_cpu_pool, shutdown_cpu_pool
from app.logging_config import setup_logging
from app.endpoints.health import router as health_router
from app.endpoints.folder import router as folder_router
from app.endpoints.patient import router as patient_router
from prometheus_client import make_asgi_app

setup_logging()
logger = logging.getLogger(__name__)

# Paths that skip secret validation
_PUBLIC_PATHS = {"/", "/api/health", "/docs", "/openapi.json", "/metrics"}


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: init Mongo client
    port = os.environ.get("PORT", "8000")
    print(f"\n[Database] Connecting to MongoDB...")
    print(f"[Database] URI: {config.masked_uri()}")

    client = AsyncIOMotorClient(config.MONGO_URI)
    application.state.mongo_client = client
    db = client.get_default_database()
    application.state.mongo_db = db

    # Verify connection
    await client.admin.command("ping")

    print(f"[Database] \u2713 MongoDB connected successfully")
    print(f"[Database] Database: {db.name}")

    # Warm the CPU process pool BEFORE accepting traffic — first
    # spawn() takes ~300ms which we don't want on the critical path of
    # the first compression job.
    get_cpu_pool()

    cyan = "\x1b[36m"
    green = "\x1b[32m"
    yellow = "\x1b[33m"
    reset = "\x1b[0m"
    bold = "\x1b[1m"

    print(f"""
{cyan}╔════════════════════════════════════════════════════════════╗{reset}
{cyan}║{reset}   {bold}MyMediVault Compression Service{reset}                    {cyan}║{reset}
{cyan}╠════════════════════════════════════════════════════════════╣{reset}
{cyan}║{reset}   {green}⚡{reset} {bold}Server:{reset}      {green}Running on port {port}{reset}{" " * (17 - len(str(port)))}{cyan}║{reset}
{cyan}║{reset}   {green}💾{reset} {bold}Database:{reset}    {green}MongoDB Connected{reset}                          {cyan}║{reset}
{cyan}║{reset}   {green}☁️{reset} {bold}Cloudinary:{reset}  {yellow}{config.CLOUDINARY_CLOUD_NAME}{reset}{" " * (28 - len(config.CLOUDINARY_CLOUD_NAME))}{cyan}║{reset}
{cyan}║{reset}   {green}🏗️{reset} {bold}S3 Storage:{reset}  {green}DigitalOcean Spaces Active{reset}                 {cyan}║{reset}
{cyan}╚════════════════════════════════════════════════════════════╝{reset}
""")
    async def heartbeat():
        """Periodic log pulse to confirm service is alive in logs."""
        while True:
            logger.info("Heartbeat: Compression service is active and healthy", extra={"event": "heartbeat_pulse"})
            await asyncio.sleep(300) # Every 5 minutes

    heartbeat_task = asyncio.create_task(heartbeat())
    
    logger.info("Compression service started", extra={"event": "startup"})
    yield
    # Shutdown: close Mongo + CPU pool + stop heartbeat
    heartbeat_task.cancel()
    client.close()
    shutdown_cpu_pool()
    logger.info("Compression service stopped", extra={"event": "shutdown"})


app = FastAPI(title="MyMediVault Compression Service", lifespan=lifespan)


@app.middleware("http")
async def verify_internal_secret(request: Request, call_next):
    if request.url.path in _PUBLIC_PATHS:
        return await call_next(request)

    provided = request.headers.get("X-Internal-Secret", "")
    if not hmac.compare_digest(provided, config.INTERNAL_API_SECRET):
        logger.warning(
            "Rejected request — invalid secret",
            extra={
                "event": "auth_rejected",
                "path": request.url.path,
            },
        )
        return JSONResponse(status_code=403, content={"error": "forbidden"})

    return await call_next(request)


app.include_router(health_router)
app.include_router(folder_router)
app.include_router(patient_router)

metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)
