package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.CachedFileItem
import com.hospital.management.data.local.CachedPatient
import com.hospital.management.data.local.PatientCacheDao
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.FileItem
import com.hospital.management.data.models.Folder
import com.hospital.management.data.models.Patient
import com.hospital.management.data.models.PatientRequest
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import kotlinx.coroutines.flow.first
import retrofit2.Response

class PatientRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager,
    private val patientCacheDao: PatientCacheDao? = null
) {
    
    suspend fun createPatient(patientRequest: PatientRequest): Response<Map<String, Any>> {
        return apiService.createPatient(patientRequest)
    }
    
    suspend fun getPatients(limit: Int = 20, skip: Int = 0, search: String? = null): Response<com.hospital.management.data.models.PatientsResponse> {
        return apiService.getPatients(limit, skip, search)
    }
    
    suspend fun getPatientById(patientId: String): Response<Map<String, Any>> {
        return apiService.getPatientById(patientId)
    }
    
    suspend fun updatePatient(patientId: String, patientData: Map<String, String>): Response<Map<String, Any>> {
        return apiService.updatePatient(patientId, patientData)
    }
    
    suspend fun createFolder(patientId: String, folderName: String): Response<Map<String, Any>> {
        return apiService.createFolder(patientId, mapOf("folderName" to folderName))
    }
    
    suspend fun getFolderFiles(patientId: String, folderName: String): Response<Map<String, Any>> {
        return apiService.getFolderFiles(patientId, folderName)
    }
    
    suspend fun uploadFile(
        patientId: String,
        folderName: String,
        file: okhttp3.MultipartBody.Part,
        idempotencyKey: String = java.util.UUID.randomUUID().toString(),
        uploadProfileUsed: Int = -1
    ): Response<Map<String, Any>> {
        return apiService.uploadFile(patientId, folderName, file, idempotencyKey, uploadProfileUsed)
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────

    suspend fun cachePatients(patients: List<Patient>) {
        patientCacheDao ?: return
        val rows = patients.map { p ->
            val existing = patientCacheDao.getCachedPatient(p._id)
            // Preserve foldersJson saved by cachePatientDetail — the list endpoint
            // doesn't return full folder data, so don't wipe what we already cached.
            val foldersJson = if (p.folders.isNotEmpty()) {
                Gson().toJson(p.folders.map { mapOf("name" to it.name, "fileCount" to it.fileCount) })
            } else {
                existing?.foldersJson ?: ""
            }
            CachedPatient(
                id = p._id,
                patientId = p.patientId,
                patientName = p.patientName,
                remarks = p.remarks,
                hospitalId = p.hospitalId,
                createdAt = p.createdAt,
                folderCount = p.folders.size,
                foldersJson = foldersJson
            )
        }
        patientCacheDao.insertPatients(rows)
    }

    suspend fun getCachedPatients(): List<Patient> {
        return patientCacheDao?.getAllCachedPatients()?.map { c ->
            Patient(
                _id = c.id,
                patientId = c.patientId,
                patientName = c.patientName,
                remarks = c.remarks,
                hospitalId = c.hospitalId,
                folders = emptyList(),
                createdAt = c.createdAt
            )
        } ?: emptyList()
    }

    suspend fun cacheFolderFiles(patientId: String, folderName: String, files: List<FileItem>) {
        patientCacheDao?.let { dao ->
            dao.clearFileItems(patientId, folderName)
            val items = files.mapNotNull { f ->
                // Use _id if available; fall back to URL hash so files without _id still get cached
                val id = f._id
                    ?: (f.fileUrl ?: f.url)?.let { "url_${it.hashCode()}" }
                    ?: return@mapNotNull null
                CachedFileItem(
                    fileId = id,
                    patientId = patientId,
                    folderName = folderName,
                    fileName = f.fileName,
                    fileUrl = f.fileUrl ?: f.url,
                    thumbnailUrl = f.thumbnailUrl,
                    mimeType = f.mimeType,
                    size = f.size,
                    uploadedAt = f.uploadedAt
                )
            }
            dao.insertFileItems(items)
        }
    }

    /** Cache a full patient detail (with folder list) after getPatientById succeeds. */
    suspend fun cachePatientDetail(patient: Patient) {
        patientCacheDao ?: return
        val foldersJson = Gson().toJson(
            patient.folders.map { mapOf("name" to it.name, "fileCount" to it.fileCount) }
        )
        val cached = CachedPatient(
            id = patient._id,
            patientId = patient.patientId,
            patientName = patient.patientName,
            remarks = patient.remarks,
            hospitalId = patient.hospitalId,
            createdAt = patient.createdAt,
            folderCount = patient.folders.size,
            foldersJson = foldersJson
        )
        patientCacheDao.insertPatients(listOf(cached))
    }

    /** Retrieve a cached patient detail (with folders) by MongoDB _id. */
    suspend fun getCachedPatient(id: String): Patient? {
        val c = patientCacheDao?.getCachedPatient(id) ?: return null
        val folders: List<Folder> = if (c.foldersJson.isNotEmpty()) {
            try {
                val type = object : TypeToken<List<Map<String, Any>>>() {}.type
                val raw: List<Map<String, Any>> = Gson().fromJson(c.foldersJson, type)
                raw.map { m ->
                    Folder(
                        name = m["name"] as? String ?: "",
                        files = emptyList(),
                        _fileCount = (m["fileCount"] as? Double)?.toInt() ?: 0
                    )
                }
            } catch (_: Exception) { emptyList() }
        } else emptyList()
        return Patient(
            _id = c.id,
            patientId = c.patientId,
            patientName = c.patientName,
            remarks = c.remarks,
            hospitalId = c.hospitalId,
            folders = folders,
            createdAt = c.createdAt
        )
    }

    suspend fun getCachedFolderFiles(patientId: String, folderName: String): List<FileItem> {
        return patientCacheDao?.getFileItems(patientId, folderName)?.map { c ->
            FileItem(
                _id = c.fileId,
                fileName = c.fileName,
                fileUrl = c.fileUrl,
                size = c.size,
                mimeType = c.mimeType,
                uploadedAt = c.uploadedAt,
                thumbnailUrl = c.thumbnailUrl
            )
        } ?: emptyList()
    }
}
