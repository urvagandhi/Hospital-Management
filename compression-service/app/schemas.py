from pydantic import BaseModel, Field
from typing import Optional


# ── Shared ──


class SourcePdf(BaseModel):
    public_id: str
    uploaded_at: str  # ISO datetime string, passed by Node backend from Mongo


# ── Requests ──


class FolderDownloadRequest(BaseModel):
    folder_id: str
    user_id: str
    patient_id: str
    target_size_mb: float = Field(default=5.0, gt=0, le=50)
    source_pdfs: list[SourcePdf]


class FolderEntry(BaseModel):
    folder_id: str
    source_pdfs: list[SourcePdf]


class PatientDownloadRequest(BaseModel):
    patient_id: str
    user_id: str
    folder_map: list[FolderEntry]
    target_size_mb: float = Field(default=10.0, gt=0, le=100)


# ── Responses ──


class DownloadResponse(BaseModel):
    merged_url: str
    content_hash: str
    final_size_bytes: int
    tier_used: int  # 0-4, or -1 if cache hit
    cache_hit: bool


class SizeFloorBreachedResponse(BaseModel):
    error: str = "size_floor_breached"
    min_achievable_mb: float


class FetchErrorResponse(BaseModel):
    error: str = "source_fetch_failed"
    failed_public_id: str
    detail: Optional[str] = None


class TimeoutErrorResponse(BaseModel):
    error: str = "processing_timeout"
    detail: str = "Pipeline exceeded 100s limit"
