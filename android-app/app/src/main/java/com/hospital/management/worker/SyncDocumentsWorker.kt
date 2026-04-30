package com.hospital.management.worker

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import com.hospital.management.utils.FileLogger
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
        // No retry cap — every queued file MUST eventually upload.
        // Failures keep status=PENDING; the worker returns Result.retry()
        // and WorkManager exponential backoff (capped near 5 min) plus
        // network-restore + app-open triggers in HospitalApplication keep
        // attempting indefinitely. retryCount is preserved on the row for
        // diagnostics only — it no longer gates execution.
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
                FileLogger.w(TAG, "setForeground failed: ${e.message}")
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
                        FileLogger.w(TAG, "Sync skipped: no auth context. Dropping $orphaned orphaned doc(s).")
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
                    FileLogger.w(TAG, "Sync purged $purged doc(s) not owned by current user $currentHospitalId")
                }

                // Reset any docs stuck in UPLOADING (e.g. from a prior crashed worker run)
                // so they're retried rather than silently skipped
                documentDao.resetStuckUploading()

                val pendingDocs = repository.getPendingDocuments()
                if (pendingDocs.isEmpty()) {
                    FileLogger.d(TAG, "No pending documents to sync")
                    UploadNotifier.cancel(context, notificationId)
                    return@withContext Result.success()
                }

                FileLogger.d(TAG, "Starting sync for ${pendingDocs.size} pending documents")
                var successCount = 0
                var retryableFailureCount = 0
                val totalFiles = pendingDocs.size

                for ((index, doc) in pendingDocs.withIndex()) {
                    if (isStopped) break

                    // No retry cap — every queued doc must eventually upload.
                    // WorkManager exponential backoff (~30s → 5min cap) plus
                    // network-availability + app-open triggers in
                    // HospitalApplication mean we won't burn battery
                    // hammering. retryCount is still tracked for diagnostics
                    // but no longer gates execution.

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
                               FileLogger.d(TAG, "Successfully uploaded document")

                               // Delete from database FIRST, then local file.
                               // If we crash between these two lines, the orphaned
                               // local file is harmless; the reverse (file deleted,
                               // DB entry alive) causes the stuck-pending bug.
                               repository.deleteDocument(doc)
                               deleteLocalFile(uri)

                               successCount++
                           } else {
                               FileLogger.e(TAG, "Upload failed for document: ${result.message}")
                               // Always reset to PENDING so future sync runs (auto on
                               // network restore, manual on app open) pick this doc up
                               // again — the user explicitly wants every queued file
                               // to upload eventually, no matter how many retries it
                               // takes. retryCount is still incremented for diagnostics.
                               val updatedDoc = doc.copy(
                                   status = SyncStatus.PENDING,
                                   retryCount = doc.retryCount + 1,
                                   errorMessage = result.message?.take(200) ?: "Upload returned error"
                               )
                               documentDao.update(updatedDoc)
                               // Count both retryable and non-retryable failures the same way:
                               // we want WorkManager to keep retrying with backoff.
                               retryableFailureCount++
                           }
                        } else {
                            // File not found locally — likely already uploaded by a
                            // previously cancelled worker. Remove the orphaned DB entry.
                            FileLogger.w(TAG, "File not found locally (already synced?), removing orphaned entry: ${doc.fileUri}")
                            repository.deleteDocument(doc)
                            successCount++ // Don't count as failure
                        }
                    } catch (e: Exception) {
                        FileLogger.e(TAG, "Error syncing document", e)
                        // Same as the result-not-success branch: keep PENDING so
                        // the next sync run picks it up again. Never permanently
                        // abandon a queued doc.
                        val updatedDoc = doc.copy(
                            status = SyncStatus.PENDING,
                            retryCount = doc.retryCount + 1,
                            errorMessage = e.message?.take(200)
                        )
                        documentDao.update(updatedDoc)
                        retryableFailureCount++
                    }
                }

                FileLogger.d(TAG, "Sync completed: $successCount/${pendingDocs.size} successful")

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

                if (successCount == pendingDocs.size) {
                    // Everything cleared — let WorkManager mark this run done.
                    Result.success()
                } else {
                    // Anything still pending (failed this round) → ask
                    // WorkManager to retry with exponential backoff. Network
                    // callback in HospitalApplication will also re-enqueue
                    // when connectivity returns. The combination guarantees
                    // every queued doc keeps trying until it lands.
                    Result.retry()
                }
            } catch (e: Exception) {
                FileLogger.e(TAG, "Sync worker failed", e)
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
                    FileLogger.d(TAG, "Local file deleted: $deleted - ${uri.path}")
                }
            }
            // For content:// URIs from app's private storage
            val path = uri.path
            if (path != null && path.contains(applicationContext.filesDir.path)) {
                val file = File(path)
                if (file.exists()) {
                    val deleted = file.delete()
                    FileLogger.d(TAG, "Private file deleted: $deleted - $path")
                }
            }
        } catch (e: Exception) {
            FileLogger.e(TAG, "Error deleting local file: ${uri.path}", e)
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
            FileLogger.e(TAG, "Error getting file from URI: $uri", e)
        }
        return null
    }
}
