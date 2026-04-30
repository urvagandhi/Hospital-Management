package com.hospital.management.data.repository

import android.content.Context
import android.net.Uri
import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.DocumentDao
import com.hospital.management.data.local.OfflineDocument
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.utils.FileLogger
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
    companion object {
        private const val TAG = "DocumentRepository"
    }

    suspend fun uploadDocument(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        uploadProfileUsed: Int = -1,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null,
    ): UploadAttempt {
        val fileSizeMb = "%.2f".format(file.length().toDouble() / (1024.0 * 1024.0))
        FileLogger.i(TAG, "uploadDocument() called:" +
                "\n  patientId=$patientId" +
                "\n  folderName=$folderName" +
                "\n  fileName=${file.name}" +
                "\n  filePath=${file.absolutePath}" +
                "\n  fileSize=${file.length()} bytes ($fileSizeMb MB)" +
                "\n  fileExists=${file.exists()}" +
                "\n  fileCanRead=${file.canRead()}" +
                "\n  idempotencyKey=$idempotencyKey" +
                "\n  uploadProfileUsed=$uploadProfileUsed")

        return try {
            val mediaType = when {
                file.name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                file.name.endsWith(".png", ignoreCase = true) -> "image/png"
                else -> "image/jpeg"
            }
            FileLogger.d(TAG, "Detected mediaType=$mediaType for file=${file.name}")

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

            FileLogger.i(TAG, "Sending multipart POST to /api/patients/$patientId/files/$folderName" +
                    "\n  multipartFieldName=file" +
                    "\n  originalFileName=${file.name}" +
                    "\n  contentType=$mediaType")

            val startMs = System.currentTimeMillis()
            val response = apiService.uploadFile(patientId, folderName, body, idempotencyKey, uploadProfileUsed)
            val durationMs = System.currentTimeMillis() - startMs

            if (response.isSuccessful) {
                FileLogger.i(TAG, "Upload HTTP SUCCESS:" +
                        "\n  statusCode=${response.code()}" +
                        "\n  fileName=${file.name}" +
                        "\n  folderName=$folderName" +
                        "\n  patientId=$patientId" +
                        "\n  duration=${durationMs}ms")
                UploadAttempt(isSuccess = true, statusCode = response.code())
            } else {
                val code = response.code()
                val message = runCatching { response.errorBody()?.string() }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: response.message()
                FileLogger.e(TAG, "Upload HTTP FAILED:" +
                        "\n  statusCode=$code" +
                        "\n  errorBody=$message" +
                        "\n  fileName=${file.name}" +
                        "\n  folderName=$folderName" +
                        "\n  patientId=$patientId" +
                        "\n  duration=${durationMs}ms" +
                        "\n  retryable=${code == 408 || code == 429 || code >= 500}")
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
            FileLogger.e(TAG, "Upload EXCEPTION:" +
                    "\n  exception=${e.javaClass.simpleName}" +
                    "\n  message=${e.message}" +
                    "\n  fileName=${file.name}" +
                    "\n  folderName=$folderName" +
                    "\n  patientId=$patientId" +
                    "\n  retryable=$retryable", e)
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
        FileLogger.i(TAG, "Saving document OFFLINE:" +
                "\n  patientId=$patientId" +
                "\n  folderName=$folderName" +
                "\n  fileUri=$fileUri" +
                "\n  ownerHospitalId=${ownerHospitalId.take(8)}…" +
                "\n  idempotencyKey=$idempotencyKey")
        val document = OfflineDocument(
            patientId = patientId,
            folderName = folderName,
            fileUri = fileUri,
            status = SyncStatus.PENDING,
            idempotencyKey = idempotencyKey,
            uploadProfileUsed = uploadProfileUsed,
            ownerHospitalId = ownerHospitalId
        )
        val rowId = documentDao.insert(document)
        FileLogger.i(TAG, "Offline document saved with rowId=$rowId")
        return rowId
    }

    suspend fun getPendingDocuments(): List<OfflineDocument> {
        val docs = documentDao.getPendingDocuments()
        FileLogger.d(TAG, "getPendingDocuments() returned ${docs.size} document(s)")
        return docs
    }

    suspend fun updateStatus(document: OfflineDocument, status: SyncStatus) {
        FileLogger.d(TAG, "Updating document status: id=${document.id}, " +
                "patientId=${document.patientId}, folderName=${document.folderName}, " +
                "oldStatus=${document.status}, newStatus=$status")
        documentDao.update(document.copy(status = status))
    }

    suspend fun deleteDocument(document: OfflineDocument) {
        FileLogger.d(TAG, "Deleting offline document: id=${document.id}, " +
                "patientId=${document.patientId}, folderName=${document.folderName}")
        documentDao.delete(document)
    }
}
