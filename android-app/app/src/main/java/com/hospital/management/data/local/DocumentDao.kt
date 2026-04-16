package com.hospital.management.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface DocumentDao {
    // Only PENDING and FAILED (not UPLOADING) so concurrent workers don't double-upload the same doc
    @Query("SELECT * FROM offline_documents WHERE status IN ('PENDING', 'FAILED') ORDER BY timestamp ASC")
    suspend fun getPendingDocuments(): List<OfflineDocument>

    @Insert
    suspend fun insert(document: OfflineDocument): Long

    @Update
    suspend fun update(document: OfflineDocument)

    @Delete
    suspend fun delete(document: OfflineDocument)

    @Query("SELECT COUNT(*) FROM offline_documents WHERE status != 'COMPLETED' AND retryCount < 5")
    suspend fun getPendingCount(): Int

    @Query("SELECT * FROM offline_documents WHERE id = :id")
    suspend fun getDocumentById(id: Long): OfflineDocument?

    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED' AND retryCount < 5 ORDER BY timestamp DESC")
    suspend fun getPendingForFolder(patientId: String, folderName: String): List<OfflineDocument>

    // Real-time Flow — emits whenever pending docs for this folder change (e.g. sync deletes a doc)
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED' AND retryCount < 5 ORDER BY timestamp DESC")
    fun observePendingForFolder(patientId: String, folderName: String): Flow<List<OfflineDocument>>

    @Query("SELECT COUNT(*) FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED' AND retryCount < 5")
    suspend fun getPendingCountForFolder(patientId: String, folderName: String): Int

    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND status != 'COMPLETED' AND retryCount < 5")
    suspend fun getPendingForPatient(patientId: String): List<OfflineDocument>

    // Reset any docs stuck in UPLOADING (e.g. from a crashed worker) back to PENDING so they're retried
    @Query("UPDATE offline_documents SET status = 'PENDING' WHERE status = 'UPLOADING'")
    suspend fun resetStuckUploading()
}
