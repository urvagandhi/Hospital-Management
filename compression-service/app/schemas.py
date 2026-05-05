from pydantic import BaseModel, Field
from typing import Optional


# ── Shared ──


class SourcePdf(BaseModel):
    public_id: str
    uploaded_at: str  # ISO datetime string, passed by Node backend from Mongo
    resource_type: str = "image"  # "image" or "raw" — matches Cloudinary resource_type
    access_mode: str = "signed"  # "public" or "signed" — determines URL generation
    storage_provider: str = "cloudinary"  # "cloudinary" or "digitalocean"


# ── Requests ──


class FileInfo(BaseModel):
    file_name: str
    page_count: Optional[int] = None  # None if unknown/corrupt


class FolderDownloadRequest(BaseModel):
    folder_id: str
    user_id: str
    patient_id: str
    target_size_mb: float = Field(default=5.0, gt=0, le=50)
    source_pdfs: list[SourcePdf]
    display_name: str = ""  # Folder name for cover page (optional — no cover if empty)
    patient_name: str = ""  # Patient name for cover page subtitle
    remarks: str = ""  # Patient remarks for cover page
    files_info: list[FileInfo] = []  # For cover page document list


class FolderEntry(BaseModel):
    folder_id: str
    display_name: str  # Printed on cover page (e.g. "Claims", "Reports")
    source_pdfs: list[SourcePdf]
    patient_name: str = ""  # For cover page subtitle
    remarks: str = ""  # For cover page
    files_info: list[FileInfo] = []  # For cover page document list


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
    detail: str = "Pipeline exceeded 300s limit"
