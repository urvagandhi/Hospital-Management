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
    val uploadProfileUsed: Int = -1
)

enum class SyncStatus {
    PENDING,
    UPLOADING,
    FAILED,
    COMPLETED
}
