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
import java.util.UUID

class DocumentRepository(
    private val apiService: ApiService,
    private val documentDao: DocumentDao,
    private val context: Context
) {

    suspend fun uploadDocument(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String
    ): Result<Boolean> {
        return try {
            val mediaType = when {
                file.name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                file.name.endsWith(".png", ignoreCase = true) -> "image/png"
                else -> "image/jpeg"
            }
            val requestFile = file.asRequestBody(mediaType.toMediaTypeOrNull())
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)

            val response = apiService.uploadFile(patientId, folderName, body, idempotencyKey)
            if (response.isSuccessful) {
                Result.success(true)
            } else {
                Result.failure(Exception(response.message()))
            }
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    /** Generates a fresh idempotency key. Caller must persist it if the upload
     *  may be retried later — the same key must be reused for every retry so
     *  the server can dedupe. */
    fun newIdempotencyKey(): String = UUID.randomUUID().toString()

    suspend fun saveOffline(
        patientId: String,
        folderName: String,
        fileUri: String,
        idempotencyKey: String = newIdempotencyKey()
    ): Long {
        val document = OfflineDocument(
            patientId = patientId,
            folderName = folderName,
            fileUri = fileUri,
            status = SyncStatus.PENDING,
            idempotencyKey = idempotencyKey
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
