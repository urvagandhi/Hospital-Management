package com.hospital.management.data.local

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
    val retryCount: Int = 0
)

enum class SyncStatus {
    PENDING,
    UPLOADING,
    FAILED,
    COMPLETED
}
