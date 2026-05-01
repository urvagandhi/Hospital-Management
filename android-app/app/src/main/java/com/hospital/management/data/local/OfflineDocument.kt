package com.hospital.management.data.local

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "offline_documents")
data class OfflineDocument(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val patientId: String,
    val folderName: String,
    val fileUri: String,
    val timestamp: Long = System.currentTimeMillis(),
    val status: SyncStatus = SyncStatus.PENDING,
    val errorMessage: String? = null,
    val retryCount: Int = 0,
    // Stable key sent as Idempotency-Key header. Prevents the server from
    // creating a duplicate file entry when a request succeeds server-side but
    // fails client-side (e.g. network drop mid-response) and is later retried.
    val idempotencyKey: String = "",
    // Which PdfUtils compression profile produced this file (0 = primary/spec, 1/2 = fallback).
    // -1 means unknown (pre-existing rows or non-scanned uploads).
    // Cloud Run can use this to skip aggressive re-compression on already-compressed files.
    @ColumnInfo(name = "upload_profile_used", defaultValue = "-1")
    val uploadProfileUsed: Int = -1,
    // Hospital that owned this scan when it was queued. The sync worker MUST
    // verify this matches the currently-logged-in hospital before upload — if
    // a different account logs in on the same device after an offline logout,
    // their pending-but-unsynced docs must NOT silently upload under the new
    // account. Empty for legacy rows (pre-migration); those are treated as
    // orphaned and dropped by the worker.
    @ColumnInfo(name = "owner_hospital_id", defaultValue = "")
    val ownerHospitalId: String = "",
    // The user-friendly name of the file (e.g. PatientName_FolderName_Timestamp.pdf)
    // Persisted so the UI can show a meaningful name during upload/failure states.
    @ColumnInfo(name = "display_name", defaultValue = "document.pdf")
    val displayName: String = "document.pdf"
)

enum class SyncStatus {
    PENDING,
    UPLOADING,
    FAILED,
    COMPLETED
}
