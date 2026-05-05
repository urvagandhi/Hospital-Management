package com.hospital.management.data.repository

import android.content.Context
import com.hospital.management.data.api.ApiService
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.DocumentDao
import com.hospital.management.data.local.OfflineDocument
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.data.models.ConfirmDirectUploadRequest
import com.hospital.management.data.models.SignUploadRequest
import com.hospital.management.utils.FileLogger
import com.hospital.management.worker.ProgressRequestBody
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.IOException
import java.net.SocketTimeoutException
import java.net.UnknownHostException
import java.util.UUID
import java.util.concurrent.TimeUnit

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

    // Dedicated OkHttpClient for Cloudinary direct uploads — no auth interceptor,
    // no cookie jar, just raw HTTP with generous timeouts.
    private val cloudinaryClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(300, TimeUnit.SECONDS)
            .writeTimeout(300, TimeUnit.SECONDS)
            .callTimeout(0, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Direct-to-Cloudinary upload flow (3 steps):
     *   1. POST /sign → get signed params from our backend (lightweight JSON, <1s)
     *   2. POST to Cloudinary upload URL with signed params + file (heavy lift, Android → Cloudinary directly)
     *   3. POST /confirm → tell our backend to save the metadata (lightweight JSON, <1s)
     *
     * Falls back to the legacy proxy upload if step 1 fails with 404 (old backend).
     */
    /**
     * Direct-to-Storage upload flow (3 steps):
     *   1. POST /sign or /sign-spaces → get signed params from our backend
     *   2. Upload to provider (Cloudinary or DO Spaces)
     *   3. POST /confirm → tell our backend to save the metadata
     *
     * Environment-aware: uses Cloudinary for debug, DigitalOcean for release.
     */
    suspend fun uploadDocument(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        displayName: String = file.name,
        uploadProfileUsed: Int = -1,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null,
    ): UploadAttempt {
        val storageProvider = com.hospital.management.BuildConfig.STORAGE_PROVIDER
        FileLogger.i(TAG, "uploadDocument() starting [Provider: $storageProvider]")

        return if (storageProvider == "digitalocean") {
            uploadToDigitalOcean(patientId, folderName, file, idempotencyKey, displayName, onByteProgress)
        } else {
            uploadToCloudinary(patientId, folderName, file, idempotencyKey, displayName, uploadProfileUsed, onByteProgress)
        }
    }

    private suspend fun uploadToDigitalOcean(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        displayName: String,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null
    ): UploadAttempt {
        // Step 1: Sign
        FileLogger.i(TAG, "Step 1/3 (DO): Requesting presigned URL...")
        val signResponse = try {
            apiService.getSignedSpacesUploadParams(patientId, folderName, SignUploadRequest(displayName))
        } catch (e: Exception) {
            FileLogger.e(TAG, "Step 1/3 (DO) EXCEPTION: ${e.message}")
            return UploadAttempt(false, message = e.message, retryable = true)
        }

        if (!signResponse.isSuccessful) {
            return UploadAttempt(false, statusCode = signResponse.code(), message = "Sign failed", retryable = signResponse.code() >= 500)
        }

        val signData = signResponse.body()
        val presignedUrl = signData?.presignedUrl ?: return UploadAttempt(false, message = "No presignedUrl")
        val key = signData.key ?: return UploadAttempt(false, message = "No key")

        // Step 2: Upload (PUT)
        FileLogger.i(TAG, "Step 2/3 (DO): Uploading to Spaces...")
        try {
            val mediaType = (if (file.name.endsWith(".pdf", true)) "application/pdf" else "application/octet-stream").toMediaTypeOrNull()
            val rawBody = file.asRequestBody(mediaType)
            val progressBody = if (onByteProgress != null) ProgressRequestBody(rawBody, onByteProgress) else rawBody

            val request = Request.Builder()
                .url(presignedUrl)
                .put(progressBody)
                .header("Content-Type", mediaType.toString())
                .build()

            val response = cloudinaryClient.newCall(request).execute()
            if (!response.isSuccessful) {
                FileLogger.e(TAG, "Step 2/3 (DO) FAILED: ${response.code}")
                return UploadAttempt(false, statusCode = response.code, message = "S3 Upload failed", retryable = true)
            }
        } catch (e: Exception) {
            FileLogger.e(TAG, "Step 2/3 (DO) EXCEPTION: ${e.message}")
            return UploadAttempt(false, message = e.message, retryable = true)
        }

        // Step 3: Confirm
        FileLogger.i(TAG, "Step 3/3 (DO): Confirming with backend...")
        val secureUrl = "${signData.endpoint?.replace(Regex("/$"), "")}/${signData.bucket}/$key"
        val confirmBody = ConfirmDirectUploadRequest(
            publicId = key,
            secureUrl = secureUrl,
            originalFileName = displayName,
            size = file.length(),
            mimeType = if (file.name.endsWith(".pdf", true)) "application/pdf" else "application/octet-stream",
            storageProvider = "digitalocean"
        )

        return try {
            val confirmResponse = apiService.confirmDirectUpload(patientId, folderName, confirmBody, idempotencyKey)
            if (confirmResponse.isSuccessful) {
                UploadAttempt(true, statusCode = confirmResponse.code())
            } else {
                UploadAttempt(false, statusCode = confirmResponse.code(), message = "Confirm failed", retryable = true)
            }
        } catch (e: Exception) {
            UploadAttempt(false, message = e.message, retryable = true)
        }
    }

    private suspend fun uploadToCloudinary(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        displayName: String,
        uploadProfileUsed: Int,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null,
    ): UploadAttempt {
        val fileSizeMb = "%.2f".format(file.length().toDouble() / (1024.0 * 1024.0))
        // ── Step 1: Get signed params from our backend ──
        FileLogger.i(TAG, "Step 1/3: Requesting signed upload params from backend...")
        val signResult = try {
            val signBody = SignUploadRequest(fileName = displayName)
            val signResponse = apiService.getSignedUploadParams(patientId, folderName, signBody)

            if (signResponse.isSuccessful) {
                val data = signResponse.body()
                val params = data?.params
                if (params != null) {
                    FileLogger.i(TAG, "Step 1/3 SUCCESS — signed params received")
                    params
                } else {
                    FileLogger.e(TAG, "Step 1/3 FAILED — params missing")
                    null
                }
            } else {
                val code = signResponse.code()
                if (code == 404) {
                    FileLogger.w(TAG, "Step 1/3 FAILED — HTTP 404; falling back to legacy proxy upload")
                    null
                } else {
                    return UploadAttempt(false, statusCode = code, message = "Sign failed", retryable = code >= 500)
                }
            }
        } catch (e: Exception) {
            return UploadAttempt(false, message = e.message, retryable = true)
        }

        // If sign fails (e.g. old backend), fall back to legacy proxy
        if (signResult == null) {
            return uploadDocumentLegacy(patientId, folderName, file, idempotencyKey, uploadProfileUsed, onByteProgress)
        }

        // ── Step 2: Upload file directly to Cloudinary ──
        val uploadUrl = signResult.uploadUrl ?: return UploadAttempt(false, message = "Missing uploadUrl")
        val apiKey = signResult.apiKey ?: return UploadAttempt(false, message = "Missing apiKey")
        val signature = signResult.signature ?: return UploadAttempt(false, message = "Missing signature")
        val timestamp = signResult.timestamp?.toString() ?: return UploadAttempt(false, message = "Missing timestamp")
        val publicId = signResult.publicId ?: return UploadAttempt(false, message = "Missing publicId")
        val uploadType = signResult.type ?: "upload"

        val cloudinaryResult = try {
            val mediaType = if (file.name.endsWith(".pdf", true)) "application/pdf" else "image/jpeg"
            val rawFileBody = file.asRequestBody(mediaType.toMediaTypeOrNull())
            val trackedFileBody = if (onByteProgress != null) ProgressRequestBody(rawFileBody, onByteProgress) else rawFileBody

            val multipartBody = MultipartBody.Builder()
                .setType(MultipartBody.FORM)
                .addFormDataPart("file", file.name, trackedFileBody)
                .addFormDataPart("api_key", apiKey)
                .addFormDataPart("signature", signature)
                .addFormDataPart("timestamp", timestamp)
                .addFormDataPart("public_id", publicId)
                .addFormDataPart("type", uploadType)
                .build()

            val request = Request.Builder().url(uploadUrl).post(multipartBody).build()
            val response = cloudinaryClient.newCall(request).execute()

            if (response.isSuccessful) {
                val responseBodyStr = response.body?.string() ?: "{}"
                val secureUrlMatch = Regex("\"secure_url\"\\s*:\\s*\"([^\"]+)\"").find(responseBodyStr)
                val secureUrl = secureUrlMatch?.groupValues?.get(1)?.replace("\\/", "/")
                val publicIdMatch = Regex("\"public_id\"\\s*:\\s*\"([^\"]+)\"").find(responseBodyStr)
                val actualPublicId = publicIdMatch?.groupValues?.get(1)?.replace("\\/", "/") ?: publicId

                if (secureUrl == null) return UploadAttempt(false, message = "Cloudinary response missing secure_url")
                mapOf("secureUrl" to secureUrl, "publicId" to actualPublicId)
            } else {
                return UploadAttempt(false, statusCode = response.code, message = "Cloudinary upload failed", retryable = response.code >= 500)
            }
        } catch (e: Exception) {
            return UploadAttempt(false, message = e.message, retryable = true)
        }

        // ── Step 3: Confirm with our backend ──
        val secureUrl = cloudinaryResult["secureUrl"] as String
        val confirmedPublicId = cloudinaryResult["publicId"] as String

        return try {
            val confirmBody = ConfirmDirectUploadRequest(
                publicId = confirmedPublicId,
                secureUrl = secureUrl,
                originalFileName = displayName,
                size = file.length(),
                mimeType = if (file.name.endsWith(".pdf", true)) "application/pdf" else "image/jpeg",
                storageProvider = "cloudinary"
            )

            val confirmResponse = apiService.confirmDirectUpload(patientId, folderName, confirmBody, idempotencyKey)
            if (confirmResponse.isSuccessful) {
                UploadAttempt(true, statusCode = confirmResponse.code())
            } else {
                UploadAttempt(false, statusCode = confirmResponse.code(), message = "Confirm failed", retryable = true)
            }
        } catch (e: Exception) {
            UploadAttempt(false, message = e.message, retryable = true)
        }
    }

    /**
     * Legacy proxy upload — streams the file through our Express backend.
     * Used as a fallback if the /sign endpoint isn't available (old backend version).
     */
    private suspend fun uploadDocumentLegacy(
        patientId: String,
        folderName: String,
        file: File,
        idempotencyKey: String,
        uploadProfileUsed: Int = -1,
        onByteProgress: ((uploadedBytes: Long, totalBytes: Long) -> Unit)? = null,
    ): UploadAttempt {
        FileLogger.i(TAG, "uploadDocumentLegacy() — proxy upload through backend")

        return try {
            val mediaType = when {
                file.name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                file.name.endsWith(".png", ignoreCase = true) -> "image/png"
                else -> "image/jpeg"
            }

            val rawRequestFile: RequestBody = file.asRequestBody(mediaType.toMediaTypeOrNull())
            val requestFile: RequestBody = if (onByteProgress != null) {
                ProgressRequestBody(rawRequestFile, onByteProgress)
            } else {
                rawRequestFile
            }
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)

            val startMs = System.currentTimeMillis()
            val response = apiService.uploadFile(patientId, folderName, body, idempotencyKey, uploadProfileUsed)
            val durationMs = System.currentTimeMillis() - startMs

            if (response.isSuccessful) {
                FileLogger.i(TAG, "Legacy upload SUCCESS — statusCode=${response.code()}, duration=${durationMs}ms")
                UploadAttempt(isSuccess = true, statusCode = response.code())
            } else {
                val code = response.code()
                val message = runCatching { response.errorBody()?.string() }
                    .getOrNull()
                    ?.takeIf { it.isNotBlank() }
                    ?: response.message()
                FileLogger.e(TAG, "Legacy upload FAILED — statusCode=$code, errorBody=$message, duration=${durationMs}ms")
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
            FileLogger.e(TAG, "Legacy upload EXCEPTION — ${e.javaClass.simpleName}: ${e.message}", e)
            UploadAttempt(isSuccess = false, message = e.message, retryable = retryable)
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

    // ── Phase 1 additions for Durable Queue ────────────────────────────

    fun getDurableUploadsDir(): File {
        val dir = File(context.filesDir, "pending_uploads")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    fun getDurableFile(idempotencyKey: String): File {
        return File(getDurableUploadsDir(), "$idempotencyKey.pdf")
    }

    suspend fun insertQueuedRow(document: OfflineDocument): Long {
        FileLogger.i(TAG, "Inserting queued row: idempotencyKey=${document.idempotencyKey}, status=${document.status}, fileUri=${document.fileUri}")
        return documentDao.insert(document)
    }

    suspend fun updateRowState(
        idempotencyKey: String,
        status: SyncStatus,
        errorMessage: String? = null,
        retryCount: Int? = null,
        fileUri: String? = null
    ) {
        val doc = documentDao.getDocumentByIdempotencyKey(idempotencyKey) ?: return
        val updated = doc.copy(
            status = status,
            errorMessage = errorMessage ?: doc.errorMessage,
            retryCount = retryCount ?: doc.retryCount,
            fileUri = fileUri ?: doc.fileUri
        )
        documentDao.update(updated)
    }

    suspend fun deleteRowAndDurableFile(idempotencyKey: String) {
        val doc = documentDao.getDocumentByIdempotencyKey(idempotencyKey)
        if (doc != null) {
            documentDao.delete(doc)
            FileLogger.i(TAG, "Deleted offline row: idempotencyKey=$idempotencyKey")
        }
        val file = getDurableFile(idempotencyKey)
        if (file.exists()) {
            file.delete()
            FileLogger.i(TAG, "Deleted durable file: ${file.absolutePath}")
        }
    }
}
