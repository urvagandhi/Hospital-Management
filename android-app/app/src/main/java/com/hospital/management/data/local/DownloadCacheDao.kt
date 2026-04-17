package com.hospital.management.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query

@Dao
interface DownloadCacheDao {

    @Query("SELECT * FROM download_cache WHERE contentHash = :hash LIMIT 1")
    suspend fun getByHash(hash: String): DownloadCache?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(entry: DownloadCache)

    @Query("UPDATE download_cache SET lastAccessedAt = :now WHERE contentHash = :hash")
    suspend fun touchAccess(hash: String, now: Long = System.currentTimeMillis())

    @Query("SELECT SUM(sizeBytes) FROM download_cache")
    suspend fun totalCacheBytes(): Long?

    /**
     * Returns LRU entries eligible for eviction.
     * Excludes anything accessed within the last 60 seconds (safety window for
     * in-flight downloads or files currently being viewed).
     */
    @Query(
        """SELECT * FROM download_cache
           WHERE lastAccessedAt < :safetyThreshold
           ORDER BY lastAccessedAt ASC"""
    )
    suspend fun getEvictionCandidates(safetyThreshold: Long = System.currentTimeMillis() - 60_000): List<DownloadCache>

    @Query("DELETE FROM download_cache WHERE contentHash = :hash")
    suspend fun deleteByHash(hash: String)

    @Query("DELETE FROM download_cache")
    suspend fun clearAll()
}
