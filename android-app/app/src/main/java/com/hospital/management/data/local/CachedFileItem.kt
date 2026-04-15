package com.hospital.management.data.local

import androidx.room.Entity

/**
 * Cached copy of an uploaded FileItem (server-side only — no PENDING files).
 * Stores only text metadata; no actual file bytes.
 * Served back when the device is offline so the folder document list stays visible.
 */
@Entity(
    tableName = "cached_file_items",
    primaryKeys = ["fileId", "patientId", "folderName"]
)
data class CachedFileItem(
    val fileId: String,          // MongoDB _id of the file
    val patientId: String,
    val folderName: String,
    val fileName: String,
    val fileUrl: String? = null,
    val thumbnailUrl: String? = null,
    val mimeType: String? = null,
    val size: Long = 0,
    val uploadedAt: String? = null,
    val cachedAt: Long = System.currentTimeMillis()
)
