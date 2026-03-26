package com.hospital.management.data.repository

import android.content.Context
import android.net.Uri
import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.DocumentDao
import com.hospital.management.data.local.OfflineDocument
import com.hospital.management.data.local.SyncStatus
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.net.UnknownHostException

class DocumentRepository(
    private val apiService: ApiService,
    private val documentDao: DocumentDao,
    private val context: Context
) {

    suspend fun uploadDocument(
        patientId: String,
        folderName: String,
        file: File
    ): Result<Boolean> {
        return try {
            val mediaType = if (file.name.endsWith(".pdf")) "application/pdf" else "image/jpeg"
            val requestFile = file.asRequestBody(mediaType.toMediaTypeOrNull())
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)

            val response = apiService.uploadFile(patientId, folderName, body)
            if (response.isSuccessful) {
                Result.success(true)
            } else {
                Result.failure(Exception(response.message()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    suspend fun saveOffline(
        patientId: String,
        folderName: String,
        fileUri: String
    ): Long {
        val document = OfflineDocument(
            patientId = patientId,
            folderName = folderName,
            fileUri = fileUri,
            status = SyncStatus.PENDING
        )
        return documentDao.insert(document)
    }

    suspend fun getPendingDocuments(): List<OfflineDocument> {
        return documentDao.getPendingDocuments()
    }

    suspend fun updateStatus(document: OfflineDocument, status: SyncStatus) {
        documentDao.update(document.copy(status = status))
    }
    
    suspend fun deleteDocument(document: OfflineDocument) {
        documentDao.delete(document)
    }
}
