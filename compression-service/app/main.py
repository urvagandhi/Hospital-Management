import hmac
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from motor.motor_asyncio import AsyncIOMotorClient

from app.config import config
from app.logging_config import setup_logging
from app.endpoints.health import router as health_router
from app.endpoints.folder import router as folder_router
from app.endpoints.patient import router as patient_router

setup_logging()
logger = logging.getLogger(__name__)

# Paths that skip secret validation
_PUBLIC_PATHS = {"/health", "/docs", "/openapi.json"}


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncGenerator[None, None]:
    # Startup: init Mongo client
    application.state.mongo_client = AsyncIOMotorClient(config.MONGO_URI)
    application.state.mongo_db = application.state.mongo_client.get_default_database()
    logger.info("Compression service started", extra={"event": "startup"})
    yield
    # Shutdown: close Mongo
    application.state.mongo_client.close()
    logger.info("Compression service stopped", extra={"event": "shutdown"})


app = FastAPI(title="HospitALL Compression Service", lifespan=lifespan)


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
