package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.CachedFileItem
import com.hospital.management.data.local.CachedPatient
import com.hospital.management.data.local.PatientCacheDao
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.FileItem
import com.hospital.management.data.models.Patient
import com.hospital.management.data.models.PatientRequest
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
        idempotencyKey: String = java.util.UUID.randomUUID().toString()
    ): Response<Map<String, Any>> {
        return apiService.uploadFile(patientId, folderName, file, idempotencyKey)
    }
    
    suspend fun downloadFolderPdf(patientId: String, folderName: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadFolderPdf(patientId, folderName)
    }
    
    suspend fun downloadAllPdf(patientId: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadAllPdfLegacy(patientId)
    }

    suspend fun downloadFolderZip(patientId: String, folderName: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadFolderZip(patientId, folderName)
    }

    suspend fun downloadAllZip(patientId: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadAllZipLegacy(patientId)
    }

    // ── Cache helpers ─────────────────────────────────────────────────────────

    suspend fun cachePatients(patients: List<Patient>) {
        patientCacheDao?.insertPatients(patients.map { p ->
            CachedPatient(
                id = p._id,
                patientId = p.patientId,
                patientName = p.patientName,
                remarks = p.remarks,
                hospitalId = p.hospitalId,
                createdAt = p.createdAt,
                folderCount = p.folders.size
            )
        })
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
                val id = f._id ?: return@mapNotNull null // only cache server-confirmed files
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
