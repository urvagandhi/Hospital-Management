package com.hospital.management.worker

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.DocumentRepository
import com.hospital.management.utils.UploadNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream

class SyncDocumentsWorker(
    appContext: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(appContext, workerParams) {

    companion object {
        private const val TAG = "SyncDocumentsWorker"
        private const val MAX_RETRY_COUNT = 5
        private const val MIN_PROGRESS_INTERVAL_MS = 500L
        private const val SPEED_WINDOW_MS = 1_000L
    }

    private val notificationId by lazy { UploadNotifier.notificationIdFor(id) }
    private val completionId by lazy { UploadNotifier.completionNotificationIdFor(id) }
    private val throttle = UploadNotifier.ProgressThrottle(MIN_PROGRESS_INTERVAL_MS)

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val notification = UploadNotifier.buildPreparing(
            applicationContext, notificationId, id, ""
        )
        return makeForegroundInfo(notification)
    }

    override suspend fun doWork(): Result {
        val context = applicationContext
        val database = AppDatabase.getDatabase(context)
        val documentDao = database.documentDao()
        val apiService = RetrofitClient.getApiService(context)
        val repository = DocumentRepository(apiService, documentDao, context)
        val tokenManager = TokenManager(context)

        return withContext(Dispatchers.IO) {
            // ── Foreground promotion ASAP — Android 12+ requires setForeground
            // within ~10s of doWork() starting. We use the generic "Syncing
            // patient records" title because we don't know the file count yet.
            try {
                setForeground(makeForegroundInfo(
                    UploadNotifier.buildPreparing(context, notificationId, id, "")
                ))
            } catch (e: Exception) {
                Log.w(TAG, "setForeground failed: ${e.message}")
            }

            try {
                // ─── AUTH GATE ───────────────────────────────────────────
                // Refuse to upload anything if no user is signed in. Two
                // scenarios this guards against:
                //   1. User logged out (online or offline). Pending uploads
                //      were either cancelled by SessionManager or are about
                //      to be — drop the orphans here as defence-in-depth.
                //   2. Worker was scheduled before login, fires post-logout.
                //      Without this gate it would attempt the upload, get a
                //      401, and the AuthInterceptor would broadcast a fake
                //      SESSION_REVOKED on the LoginActivity.
                val currentHospitalId = tokenManager.getHospitalId().orEmpty()
                val hasToken = tokenManager.hasValidToken()
                if (currentHospitalId.isEmpty() || !hasToken) {
                    val orphaned = documentDao.getPendingCount()
                    if (orphaned > 0) {
                        Log.w(TAG, "Sync skipped: no auth context. Dropping $orphaned orphaned doc(s).")
                        // Drop EVERY pending row — there's no signed-in user to
                        // own them, and we can't safely defer to a future login
                        // without risking cross-account leak.
                        documentDao.deleteAllNotOwnedBy("__none__")
                    }
                    UploadNotifier.cancel(context, notificationId)
                    return@withContext Result.success()
                }

                // ─── CROSS-ACCOUNT GUARD ─────────────────────────────────
                // Drop any doc whose owner_hospital_id does not match the
                // currently-logged-in account, including legacy '' rows. This
                // is the healthcare-compliance net: a doc scanned by Doctor A
                // must NEVER upload under Doctor B's session, even if A logged
                // out offline before the queue drained.
                val purged = documentDao.deleteAllNotOwnedBy(currentHospitalId)
                if (purged > 0) {
                    Log.w(TAG, "Sync purged $purged doc(s) not owned by current user $currentHospitalId")
                }

                // Reset any docs stuck in UPLOADING (e.g. from a prior crashed worker run)
                // so they're retried rather than silently skipped
                documentDao.resetStuckUploading()

                val pendingDocs = repository.getPendingDocuments()
                if (pendingDocs.isEmpty()) {
                    Log.d(TAG, "No pending documents to sync")
                    UploadNotifier.cancel(context, notificationId)
                    return@withContext Result.success()
                }

                Log.d(TAG, "Starting sync for ${pendingDocs.size} pending documents")
                var successCount = 0
                var retryableFailureCount = 0
                var skippedExhaustedCount = 0
                val totalFiles = pendingDocs.size

                for ((index, doc) in pendingDocs.withIndex()) {
                    if (isStopped) break

                    // Skip permanently failed documents (exceeded max retries)
                    if (doc.retryCount >= MAX_RETRY_COUNT) {
                        Log.w(TAG, "Skipping document that exceeded max retries: ${doc.fileUri}")
                        skippedExhaustedCount++
                        continue
                    }

                    try {
                        repository.updateStatus(doc, SyncStatus.UPLOADING)

                        val uri = Uri.parse(doc.fileUri)
                        val file = getFileFromUri(context, uri)

                        if (file != null && file.exists()) {
                           // Legacy rows (pre-migration) have no key — backfill one so subsequent
                           // retries within this run dedupe against each other via the header.
                           val key = doc.idempotencyKey.ifEmpty { repository.newIdempotencyKey() }
                           if (key != doc.idempotencyKey) {
                               documentDao.update(doc.copy(idempotencyKey = key))
                           }

                           // Per-file progress: emit a PREPARING tick so the
                           // notification updates the "File N of M" prefix
                           // before bytes start flowing.
                           val displayName = file.name.takeIf { it.isNotBlank() } ?: "document"
                           val totalBytes = file.length().coerceAtLeast(0L)
                           emit(UploadProgress(
                               stage = UploadStage.UPLOADING,
                               bytesUploaded = 0L,
                               totalBytes = totalBytes,
                               fileName = displayName,
                               currentFileIndex = index + 1,
                               totalFiles = totalFiles
                           ), force = true)

                           // Speed window — per-file. Captured by the byte
                           // callback, which fires on each okio buffer flush.
                           var windowStartMs = System.currentTimeMillis()
                           var windowStartBytes = 0L
                           var lastSpeed = 0L

                           val result = repository.uploadDocument(
                               doc.patientId,
                               doc.folderName,
                               file,
                               key,
                               doc.uploadProfileUsed
                           ) { uploaded, total ->
                               if (isStopped) return@uploadDocument
                               val now = System.currentTimeMillis()
                               val elapsed = now - windowStartMs
                               if (elapsed >= SPEED_WINDOW_MS) {
                                   val delta = uploaded - windowStartBytes
                                   lastSpeed = (delta * 1000L / elapsed).coerceAtLeast(0)
                                   windowStartMs = now
                                   windowStartBytes = uploaded
                               }
                               emitBlocking(UploadProgress(
                                   stage = UploadStage.UPLOADING,
                                   bytesUploaded = uploaded,
                                   totalBytes = if (total > 0) total else totalBytes,
                                   speedBytesPerSec = lastSpeed,
                                   fileName = displayName,
                                   currentFileIndex = index + 1,
                                   totalFiles = totalFiles
                               ))
                           }

                           if (result.isSuccess) {
                               Log.d(TAG, "Successfully uploaded document")

                               // Delete from database FIRST, then local file.
                               // If we crash between these two lines, the orphaned
                               // local file is harmless; the reverse (file deleted,
                               // DB entry alive) causes the stuck-pending bug.
                               repository.deleteDocument(doc)
                               deleteLocalFile(uri)

                               successCount++
                           } else {
                               Log.e(TAG, "Upload failed for document: ${result.message}")
                               val shouldRetry = result.retryable
                               val updatedDoc = doc.copy(
                                   status = SyncStatus.FAILED,
                                   retryCount = if (shouldRetry) doc.retryCount + 1 else MAX_RETRY_COUNT,
                                   errorMessage = result.message?.take(200) ?: "Upload returned error"
                               )
                               documentDao.update(updatedDoc)
                               if (shouldRetry) retryableFailureCount++
                           }
                        } else {
                            // File not found locally — likely already uploaded by a
                            // previously cancelled worker. Remove the orphaned DB entry.
                            Log.w(TAG, "File not found locally (already synced?), removing orphaned entry: ${doc.fileUri}")
                            repository.deleteDocument(doc)
                            successCount++ // Don't count as failure
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error syncing document", e)
                        val updatedDoc = doc.copy(
                            status = SyncStatus.FAILED,
                            retryCount = doc.retryCount + 1,
                            errorMessage = e.message?.take(200)
                        )
                        documentDao.update(updatedDoc)
                    }
                }

                Log.d(TAG, "Sync completed: $successCount/${pendingDocs.size} successful")

                // Always cancel the foreground/progress notification — the
                // terminal-state notification is posted under completionId so
                // it survives WorkManager's stopForeground(STOP_FOREGROUND_REMOVE).
                UploadNotifier.cancel(context, notificationId)
                if (successCount > 0) {
                    UploadNotifier.post(
                        context,
                        completionId,
                        UploadNotifier.buildCompleted(
                            context,
                            completionId,
                            fileCount = successCount
                        )
                    )
                }

                val actionableCount = pendingDocs.size - skippedExhaustedCount
                if (actionableCount <= 0) {
                    Result.success()
                } else if (successCount == actionableCount) {
                    Result.success()
                } else if (retryableFailureCount > 0) {
                    // Retry when at least one failure is recoverable.
                    Result.retry()
                } else {
                    // Only unretryable failures remain; avoid infinite failing sync loops.
                    Result.success()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Sync worker failed", e)
                UploadNotifier.cancel(context, notificationId)
                Result.failure()
            }
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

    /** Suspend-friendly emit. Used at stage transitions (PREPARING / per-file boundary). */
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
     * Non-suspending emit invoked from inside okio's `writeTo` callback (which
     * runs on the OkHttp dispatcher and can't await a suspend function). We
     * post directly via NotificationManagerCompat — setProgress requires
     * suspension and the byte-level WorkInfo.progress isn't critical.
     */
    private fun emitBlocking(progress: UploadProgress) {
        if (!throttle.shouldEmit(progress)) return
        val notification = buildForStage(progress) ?: return
        UploadNotifier.post(applicationContext, notificationId, notification)
    }

    private fun buildForStage(progress: UploadProgress): Notification? = when (progress.stage) {
        UploadStage.PREPARING -> UploadNotifier.buildPreparing(
            applicationContext, notificationId, id, ""
        )
        UploadStage.UPLOADING -> UploadNotifier.buildUploading(
            applicationContext, notificationId, id, progress
        )
        else -> null
    }

    private fun deleteLocalFile(uri: Uri) {
        try {
            if (uri.scheme == "file") {
                val file = File(uri.path!!)
                if (file.exists()) {
                    val deleted = file.delete()
                    Log.d(TAG, "Local file deleted: $deleted - ${uri.path}")
                }
            }
            // For content:// URIs from app's private storage
            val path = uri.path
            if (path != null && path.contains(applicationContext.filesDir.path)) {
                val file = File(path)
                if (file.exists()) {
                    val deleted = file.delete()
                    Log.d(TAG, "Private file deleted: $deleted - $path")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting local file: ${uri.path}", e)
        }
    }

    private fun getFileFromUri(context: Context, uri: Uri): File? {
        try {
            if (uri.scheme == "file") {
                return File(uri.path!!)
            } else if (uri.scheme == "content") {
                val mimeType = context.contentResolver.getType(uri) ?: "application/pdf"
                val extension = when (mimeType) {
                    "application/pdf" -> "pdf"
                    "image/jpeg", "image/jpg" -> "jpg"
                    "image/png" -> "png"
                    else -> "pdf"
                }
                val fileName = "temp_upload_${System.currentTimeMillis()}.$extension"
                val file = File(context.cacheDir, fileName)

                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                }
                return file
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting file from URI: $uri", e)
        }
        return null
    }
}
