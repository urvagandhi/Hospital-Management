package com.hospital.management.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update

@Dao
interface DocumentDao {
    @Query("SELECT * FROM offline_documents WHERE status != 'COMPLETED' ORDER BY timestamp ASC")
    suspend fun getPendingDocuments(): List<OfflineDocument>

    @Insert
    suspend fun insert(document: OfflineDocument): Long

    @Update
    suspend fun update(document: OfflineDocument)

    @Delete
    suspend fun delete(document: OfflineDocument)

    @Query("SELECT COUNT(*) FROM offline_documents WHERE status != 'COMPLETED'")
    suspend fun getPendingCount(): Int
    
    @Query("SELECT * FROM offline_documents WHERE id = :id")
    suspend fun getDocumentById(id: Long): OfflineDocument?
    
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED' ORDER BY timestamp DESC")
    suspend fun getPendingForFolder(patientId: String, folderName: String): List<OfflineDocument>
    
    @Query("SELECT COUNT(*) FROM offline_documents WHERE patientId = :patientId AND folderName = :folderName AND status != 'COMPLETED'")
    suspend fun getPendingCountForFolder(patientId: String, folderName: String): Int
    
    @Query("SELECT * FROM offline_documents WHERE patientId = :patientId AND status != 'COMPLETED'")
    suspend fun getPendingForPatient(patientId: String): List<OfflineDocument>
}
