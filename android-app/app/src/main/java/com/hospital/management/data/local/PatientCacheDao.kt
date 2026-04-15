package com.hospital.management.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface PatientCacheDao {

    // ── Patient list ──────────────────────────────────────────────────────────

    @Query("SELECT * FROM cached_patients ORDER BY cachedAt DESC")
    suspend fun getAllCachedPatients(): List<CachedPatient>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertPatients(patients: List<CachedPatient>)

    @Query("DELETE FROM cached_patients")
    suspend fun clearAllPatients()

    // ── Folder file list ──────────────────────────────────────────────────────

    @Query("SELECT * FROM cached_file_items WHERE patientId = :patientId AND folderName = :folderName ORDER BY uploadedAt DESC")
    suspend fun getFileItems(patientId: String, folderName: String): List<CachedFileItem>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertFileItems(items: List<CachedFileItem>)

    @Query("DELETE FROM cached_file_items WHERE patientId = :patientId AND folderName = :folderName")
    suspend fun clearFileItems(patientId: String, folderName: String)

    @Query("DELETE FROM cached_file_items")
    suspend fun clearAllFileItems()
}
