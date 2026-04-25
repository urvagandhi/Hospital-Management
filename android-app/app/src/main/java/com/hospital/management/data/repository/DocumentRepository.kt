package com.hospital.management.data.repository

import android.content.Context
import android.net.Uri
import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.DocumentDao
import com.hospital.management.data.local.OfflineDocument
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.worker.ProgressRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.UUID

data class UploadAttempt(
    val isSuccess: Boolean,
    val statusCode: Int? = null,
    val message: String? = null,
    val retryable: Boolean = false
)

class DocumentRepository(
    private val apiService: ApiService,
    private val documentDao: DocumentDao,
    private val context: Context
) {

    suspend fun uploadDocument(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        uploadProfileUsed: Int = -1,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null,
    ): UploadAttempt {
        return try {
            val mediaType = when {
                file.name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                file.name.endsWith(".png", ignoreCase = true) -> "image/png"
                else -> "image/jpeg"
            }
            val rawRequestFile: RequestBody = file.asRequestBody(mediaType.toMediaTypeOrNull())
            // ProgressRequestBody is stateless — every retry of this suspend call
            // builds a fresh wrapper, so byte counters always start at 0 instead
            // of resuming mid-stream (which would corrupt notification progress).
            val requestFile: RequestBody = if (onByteProgress != null) {
                ProgressRequestBody(rawRequestFile, onByteProgress)
            } else {
                rawRequestFile
            }
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)

            val response = apiService.uploadFile(patientId, folderName, body, idempotencyKey, uploadProfileUsed)
            if (response.isSuccessful) {
                UploadAttempt(isSuccess = true, statusCode = response.code())
            } else {
                val code = response.code()
                val message = runCatching { response.errorBody()?.string() }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: response.message()
                UploadAttempt(
                    isSuccess = false,
                    statusCode = code,
                    message = message,
                    retryable = code == 408 || code == 429 || code >= 500
                )
            }
        } catch (e: Exception) {
            val retryable = when (e) {
                is UnknownHostException,
                is SocketTimeoutException,
                is IOException -> true
                else -> false
            }
            UploadAttempt(
                isSuccess = false,
                message = e.message,
                retryable = retryable
            )
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
        ownerHospitalId: String,
        idempotencyKey: String = newIdempotencyKey(),
        uploadProfileUsed: Int = -1
    ): Long {
        val document = OfflineDocument(
            patientId = patientId,
            folderName = folderName,
            fileUri = fileUri,
            status = SyncStatus.PENDING,
            idempotencyKey = idempotencyKey,
            uploadProfileUsed = uploadProfileUsed,
            ownerHospitalId = ownerHospitalId
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
