package com.hospital.management.worker

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.repository.DocumentRepository
import com.hospital.management.utils.UploadNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

/**
 * End-to-end online upload worker for a single document.
 *
 * Sibling of [DownloadWorker]. Runs as a foreground service so long uploads
 * survive Doze, app backgrounding, and Samsung One UI's aggressive process
 * killing. Publishes progress through [UploadProgress] serialized into [Data]:
 *   - [setProgress] lets the in-app UI observe via WorkInfo.progress.
 *   - The foreground notification is rebuilt from the same UploadProgress via
 *     [UploadNotifier].
 *
 * Stages visible to the user:
 *   - PREPARING   resolving the file URI / preflight
 *   - UPLOADING   byte stream with real total + speed
 *   - COMPLETED   server accepted the file
 *   - FAILED      terminal — tap to open the app
 *   - RETRYING    WorkManager backoff in progress (shown before Result.retry)
 *
 * The terminal-state notification (COMPLETED / FAILED) is posted under
 * [UploadNotifier.completionNotificationIdFor], NOT the foreground id, so it
 * survives WorkManager's `stopForeground(STOP_FOREGROUND_REMOVE)` on exit.
 */
class UploadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "UploadWorker"
        private const val MIN_PROGRESS_INTERVAL_MS = 500L
        private const val SPEED_WINDOW_MS = 1_000L
        private const val DEFAULT_MAX_RETRIES = 3

        /** Tag every upload WorkRequest with this so logout can cancel them in bulk. */
        const val TAG_UPLOAD = "hms_upload"

        // Input keys
        const val KEY_PATIENT_ID = "patient_id"
        const val KEY_FOLDER_NAME = "folder_name"
        const val KEY_FILE_URI = "file_uri"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_IDEMPOTENCY_KEY = "idempotency_key"
        const val KEY_UPLOAD_PROFILE_USED = "upload_profile_used"
        const val KEY_OWNER_HOSPITAL_ID = "owner_hospital_id"
        const val KEY_MAX_RETRIES = "max_retries"

        // Output keys
        const val KEY_STATUS = "status"
        const val KEY_ERROR_REASON = "error_reason"

        // Error categories
        const val ERROR_NETWORK = "NETWORK"
        const val ERROR_AUTH_EXPIRED = "AUTH_EXPIRED"
        const val ERROR_SERVER = "SERVER_ERROR"
        const val ERROR_CANCELLED = "CANCELLED"
        const val ERROR_FILE_MISSING = "FILE_MISSING"
        const val ERROR_INPUT = "INPUT_INVALID"
    }

    private val notificationId by lazy { UploadNotifier.notificationIdFor(id) }
    private val completionId by lazy { UploadNotifier.completionNotificationIdFor(id) }
    private val throttle = UploadNotifier.ProgressThrottle(MIN_PROGRESS_INTERVAL_MS)

    private lateinit var fileName: String

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val name = if (::fileName.isInitialized) fileName
            else inputData.getString(KEY_FILE_NAME) ?: ""
        val notification = UploadNotifier.buildPreparing(
            applicationContext, notificationId, id, name
        )
        return makeForegroundInfo(notification)
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // ── STEP 0: foreground promotion MUST happen before any IO ──
        // Android 12+ throws ForegroundServiceStartNotAllowedException if
        // setForeground isn't called within ~10s of doWork() starting.
        fileName = inputData.getString(KEY_FILE_NAME) ?: ""
        try {
            setForeground(makeForegroundInfo(
                UploadNotifier.buildPreparing(applicationContext, notificationId, id, fileName)
            ))
        } catch (e: Exception) {
            Log.w(TAG, "setForeground failed: ${e.message}")
        }

        // ── Input parsing ────────────────────────────────────────────────
        val patientId = inputData.getString(KEY_PATIENT_ID).orEmpty()
        val folderName = inputData.getString(KEY_FOLDER_NAME).orEmpty()
        val fileUriStr = inputData.getString(KEY_FILE_URI).orEmpty()
        val idempotencyKey = inputData.getString(KEY_IDEMPOTENCY_KEY).orEmpty()
        val uploadProfileUsed = inputData.getInt(KEY_UPLOAD_PROFILE_USED, -1)
        val maxRetries = inputData.getInt(KEY_MAX_RETRIES, DEFAULT_MAX_RETRIES)

        if (patientId.isEmpty() || folderName.isEmpty() || fileUriStr.isEmpty() ||
            idempotencyKey.isEmpty()) {
            return@withContext failWith(ERROR_INPUT, "Missing required input")
        }

        val file = resolveFile(fileUriStr)
        if (file == null || !file.exists()) {
            return@withContext failWith(ERROR_FILE_MISSING, "Local file missing or unreadable")
        }
        if (fileName.isEmpty()) fileName = file.name

        val totalBytes = file.length().coerceAtLeast(0L)

        // Seed PREPARING — we already showed it via setForeground above, but
        // also publish to WorkInfo.progress so any UI observer sees a non-null
        // initial state.
        emit(UploadProgress(
            stage = UploadStage.PREPARING,
            fileName = fileName,
            totalBytes = totalBytes
        ), force = true)

        try {
            val database = AppDatabase.getDatabase(applicationContext)
            val repository = DocumentRepository(
                RetrofitClient.getApiService(applicationContext),
                database.documentDao(),
                applicationContext
            )

            // Speed window — captured outside the lambda since the lambda is
            // invoked per-OkHttp-buffer flush.
            var windowStartMs = System.currentTimeMillis()
            var windowStartBytes = 0L
            var lastSpeed = 0L

            val attempt = repository.uploadDocument(
                patientId = patientId,
                folderName = folderName,
                file = file,
                idempotencyKey = idempotencyKey,
                uploadProfileUsed = uploadProfileUsed
            ) { uploadedBytes, total ->
                if (isStopped) return@uploadDocument
                val now = System.currentTimeMillis()
                val windowElapsed = now - windowStartMs
                if (windowElapsed >= SPEED_WINDOW_MS) {
                    val delta = uploadedBytes - windowStartBytes
                    lastSpeed = (delta * 1000L / windowElapsed).coerceAtLeast(0)
                    windowStartMs = now
                    windowStartBytes = uploadedBytes
                }
                emitBlocking(UploadProgress(
                    stage = UploadStage.UPLOADING,
                    bytesUploaded = uploadedBytes,
                    totalBytes = if (total > 0) total else totalBytes,
                    speedBytesPerSec = lastSpeed,
                    fileName = fileName
                ))
            }

            if (isStopped) return@withContext cancelled()

            if (attempt.isSuccess) {
                // Local file may have been a temp PDF — best-effort cleanup.
                runCatching { if (file.parentFile?.absolutePath?.contains("cache") == true || file.parentFile == applicationContext.filesDir) file.delete() }
                finalizeCompleted()
                return@withContext Result.success(
                    Data.Builder()
                        .putString(KEY_STATUS, UploadStage.COMPLETED.name)
                        .build()
                )
            }

            val code = attempt.statusCode ?: 0
            val reason = when {
                code == 401 || code == 403 -> ERROR_AUTH_EXPIRED
                code in 500..599 -> ERROR_SERVER
                else -> ERROR_NETWORK
            }
            return@withContext if (attempt.retryable) {
                maybeRetry(maxRetries, reason, attempt.message ?: "Upload failed")
            } else {
                failWith(reason, attempt.message ?: "Upload rejected")
            }
        } catch (e: Exception) {
            Log.e(TAG, "upload error", e)
            if (isStopped) return@withContext cancelled()
            maybeRetry(maxRetries, ERROR_NETWORK, e.message ?: "Network error")
        }
    }

    // ─── Foreground + progress helpers ──────────────────────────────────────

    private fun makeForegroundInfo(notification: Notification): ForegroundInfo {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                notificationId,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(notificationId, notification)
        }
    }

    /**
     * Suspend-friendly emit: publishes to WorkInfo.progress AND updates the
     * foreground notification — both from the same payload, throttled.
     */
    private suspend fun emit(progress: UploadProgress, force: Boolean = false) {
        if (!force && !throttle.shouldEmit(progress)) return

        setProgress(progress.toData())
        val notification = buildForStage(progress) ?: return
        try {
            setForeground(makeForegroundInfo(notification))
        } catch (e: Exception) {
            UploadNotifier.post(applicationContext, notificationId, notification)
        }
    }

    /**
     * Non-suspending variant for callbacks invoked from inside okio's
     * `writeTo` (which runs on the OkHttp dispatcher and can't await a
     * suspend function). Skips setProgress (which requires suspension)
     * and updates only the visible notification — that's the user-facing
     * promise. The terminal stages publish progress via [emit] anyway.
     */
    private fun emitBlocking(progress: UploadProgress) {
        if (!throttle.shouldEmit(progress)) return
        val notification = buildForStage(progress) ?: return
        UploadNotifier.post(applicationContext, notificationId, notification)
    }

    private fun buildForStage(progress: UploadProgress): Notification? = when (progress.stage) {
        UploadStage.PREPARING -> UploadNotifier.buildPreparing(
            applicationContext, notificationId, id, progress.fileName
        )
        UploadStage.UPLOADING -> UploadNotifier.buildUploading(
            applicationContext, notificationId, id, progress
        )
        else -> null // COMPLETED / FAILED / RETRYING posted under completionId
    }

    private fun finalizeCompleted() {
        // Cancel the ongoing foreground notification first so the system
        // doesn't show two stacked uploads.
        UploadNotifier.cancel(applicationContext, notificationId)
        UploadNotifier.post(
            applicationContext,
            completionId,
            UploadNotifier.buildCompleted(
                applicationContext,
                completionId,
                fileCount = 1,
                primaryFileName = fileName
            )
        )
    }

    private fun cancelled(): Result {
        UploadNotifier.cancel(applicationContext, notificationId)
        return Result.failure(
            Data.Builder()
                .putString(KEY_ERROR_REASON, ERROR_CANCELLED)
                .putString(KEY_STATUS, UploadStage.FAILED.name)
                .build()
        )
    }

    private fun failWith(reason: String, message: String): Result {
        if (isStopped) return cancelled()
        Log.e(TAG, "failed [$reason]: $message")
        val progress = UploadProgress(
            stage = UploadStage.FAILED,
            fileName = fileName,
            errorReason = reason
        )
        UploadNotifier.cancel(applicationContext, notificationId)
        UploadNotifier.post(
            applicationContext,
            completionId,
            UploadNotifier.buildFailed(
                applicationContext, completionId, id, progress, retryable = false
            )
        )
        return Result.failure(
            Data.Builder()
                .putString(KEY_ERROR_REASON, reason)
                .putString(KEY_STATUS, message)
                .build()
        )
    }

    private suspend fun maybeRetry(
        maxRetries: Int,
        reason: String,
        message: String
    ): Result {
        if (isStopped) return cancelled()

        return if (runAttemptCount < maxRetries) {
            val approxSec = (30L shl runAttemptCount).coerceAtMost(5 * 60L).toInt()
            Log.w(TAG, "retrying [$reason]: $message (attempt=${runAttemptCount + 1}/$maxRetries)")
            val progress = UploadProgress(
                stage = UploadStage.RETRYING,
                fileName = fileName,
                retryInSeconds = approxSec,
                errorReason = reason
            )
            setProgress(progress.toData())
            // Post under the foreground id so the "Waiting for connection"
            // visual replaces the ongoing notification — when WorkManager
            // calls stopForeground after Result.retry, the OS will keep this
            // posted because it was already a normal post (not foreground).
            UploadNotifier.post(
                applicationContext,
                notificationId,
                UploadNotifier.buildFailed(
                    applicationContext, notificationId, id, progress, retryable = true
                )
            )
            Result.retry()
        } else {
            failWith(reason, message)
        }
    }

    private fun resolveFile(uriStr: String): File? {
        return try {
            val uri = Uri.parse(uriStr)
            when (uri.scheme) {
                "file" -> uri.path?.let { File(it) }
                "content" -> {
                    val mimeType = applicationContext.contentResolver.getType(uri) ?: "application/pdf"
                    val ext = when (mimeType) {
                        "application/pdf" -> "pdf"
                        "image/png" -> "png"
                        "image/jpeg", "image/jpg" -> "jpg"
                        else -> "pdf"
                    }
                    val temp = File(
                        applicationContext.cacheDir,
                        "upload_${System.currentTimeMillis()}.$ext"
                    )
                    applicationContext.contentResolver.openInputStream(uri)?.use { input ->
                        FileOutputStream(temp).use { out -> input.copyTo(out) }
                    } ?: return null
                    temp
                }
                else -> null
            }
        } catch (e: Exception) {
            Log.w(TAG, "resolveFile failed: ${e.message}")
            null
        }
    }
}
