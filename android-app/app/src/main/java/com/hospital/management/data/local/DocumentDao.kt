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

    @Query("SELECT COUNT(*) FROM offline_documents WHERE status != 'COMPLETED' ")
    suspend fun getPendingCount(): Int

    @Query("SELECT * FROM offline_documents WHERE id = :id")
    suspend fun getDocumentById(id: Long): OfflineDocument?

    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED'  ORDER BY timestamp DESC")
    suspend fun getPendingForFolder(patientId: String, folderName: String): List<OfflineDocument>

    // Real-time Flow — emits whenever pending docs for this folder change (e.g. sync deletes a doc)
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED'  ORDER BY timestamp DESC")
    fun observePendingForFolder(patientId: String, folderName: String): Flow<List<OfflineDocument>>

    // Real-time Flow of total pending count — drives the header badge in DashboardActivity
    @Query("SELECT COUNT(*) FROM offline_documents WHERE status != 'COMPLETED' ")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED' ")
    suspend fun getPendingCountForFolder(patientId: String, folderName: String): Int

    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND status != 'COMPLETED' ")
    suspend fun getPendingForPatient(patientId: String): List<OfflineDocument>

    // Reset any docs stuck in UPLOADING (e.g. from a crashed worker) back to PENDING so they're retried
    @Query("UPDATE offline_documents SET status = 'PENDING' WHERE status = 'UPLOADING'")
    suspend fun resetStuckUploading()

    // ── Owner-scoped queries ──────────────────────────────────────────
    // The owner_hospital_id column tags every queued doc with the hospital
    // that scanned it. The sync worker uses these to enforce that uploads
    // never cross account boundaries — see SyncDocumentsWorker.
    @Query("SELECT COUNT(*) FROM offline_documents WHERE owner_hospital_id = :hospitalId AND status != 'COMPLETED' ")
    suspend fun getPendingCountForHospital(hospitalId: String): Int

    @Query("DELETE FROM offline_documents WHERE owner_hospital_id = :hospitalId")
    suspend fun deleteAllForHospital(hospitalId: String): Int

    // Drops legacy rows (owner='') AND rows belonging to other accounts.
    // Used by the sync worker to garbage-collect orphans before any upload.
    @Query("DELETE FROM offline_documents WHERE owner_hospital_id != :hospitalId")
    suspend fun deleteAllNotOwnedBy(hospitalId: String): Int

    @Query("SELECT * FROM offline_documents WHERE owner_hospital_id = :hospitalId AND status IN ('PENDING', 'FAILED') ORDER BY timestamp ASC")
    suspend fun getPendingForHospital(hospitalId: String): List<OfflineDocument>

    // ── Phase 1 additions for Durable Queue ────────────────────────────

    // Patient-scoped flow
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND owner_hospital_id = :hospitalId AND status != 'COMPLETED' ORDER BY timestamp DESC")
    fun observePatientQueue(patientId: String, hospitalId: String): Flow<List<OfflineDocument>>

    // Folder-scoped flow
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND owner_hospital_id = :hospitalId AND status != 'COMPLETED' ORDER BY timestamp DESC")
    fun observeFolderQueue(patientId: String, folderName: String, hospitalId: String): Flow<List<OfflineDocument>>

    // Hospital queue flow
    @Query("SELECT * FROM offline_documents WHERE owner_hospital_id = :hospitalId AND status != 'COMPLETED' ORDER BY timestamp DESC")
    fun observeHospitalQueue(hospitalId: String): Flow<List<OfflineDocument>>

    // Auto-sync eligibility query
    @Query("SELECT * FROM offline_documents WHERE owner_hospital_id = :hospitalId AND (status = 'PENDING' OR (status = 'FAILED' AND errorMessage LIKE 'NETWORK:%')) ORDER BY timestamp ASC")
    suspend fun getEligibleForAutoSync(hospitalId: String): List<OfflineDocument>

    // Document by idempotency key
    @Query("SELECT * FROM offline_documents WHERE idempotencyKey = :idempotencyKey LIMIT 1")
    suspend fun getDocumentByIdempotencyKey(idempotencyKey: String): OfflineDocument?

    @Query("SELECT EXISTS(SELECT 1 FROM offline_documents WHERE fileUri = :fileUri)")
    suspend fun existsByFileUri(fileUri: String): Boolean
}
