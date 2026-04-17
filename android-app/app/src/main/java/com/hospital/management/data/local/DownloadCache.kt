package com.hospital.management.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "download_cache")
data class DownloadCache(
    @PrimaryKey val contentHash: String,
    val downloadUrl: String,
    val localPath: String,
    val fileName: String,
    val sizeBytes: Long,
    val lastAccessedAt: Long,
    val createdAt: Long,
    // Last-Modified header from server at download time.
    // 0 = HEAD request failed, URL-only hash — treat as stale on next access.
    val lastModifiedHeader: String = "",
    val isStale: Boolean = false
)
