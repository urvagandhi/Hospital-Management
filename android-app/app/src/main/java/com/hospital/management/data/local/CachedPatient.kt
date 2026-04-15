package com.hospital.management.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

/**
 * Cached copy of a Patient record.
 * Stores only lightweight metadata (no file bytes).
 * Populated whenever a successful getPatients() response arrives;
 * served back when the device is offline.
 */
@Entity(tableName = "cached_patients")
data class CachedPatient(
    @PrimaryKey val id: String,          // MongoDB _id
    val patientId: String,               // display ID (e.g. "P-0001")
    val patientName: String,
    val remarks: String? = null,
    val hospitalId: String,
    val createdAt: String,
    val folderCount: Int = 0,
    val cachedAt: Long = System.currentTimeMillis()
)
