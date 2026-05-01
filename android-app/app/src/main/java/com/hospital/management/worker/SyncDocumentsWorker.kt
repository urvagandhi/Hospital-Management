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

                // ── Phase 4: Sync worker adopts the eligible docs query ──
                val eligibleDocs = documentDao.getEligibleForAutoSync(currentHospitalId)
                if (eligibleDocs.isEmpty()) {
                    FileLogger.d(TAG, "No eligible documents to sync")
                    UploadNotifier.cancel(context, notificationId)
                    return@withContext Result.success()
                }

                FileLogger.d(TAG, "Starting sync for ${eligibleDocs.size} eligible documents")

                // ── Phase 4: Loop and enqueue UploadWorker for each ──
                val workManager = androidx.work.WorkManager.getInstance(context)
                val constraints = androidx.work.Constraints.Builder()
                    .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                    .build()

                for (doc in eligibleDocs) {
                    if (isStopped) break

                    val idempotencyKey = doc.idempotencyKey.ifEmpty { repository.newIdempotencyKey() }
                    if (idempotencyKey != doc.idempotencyKey) {
                        documentDao.update(doc.copy(idempotencyKey = idempotencyKey))
                    }

                    // Pass necessary data to UploadWorker
                    val inputData = androidx.work.Data.Builder()
                        .putLong(com.hospital.management.worker.UploadWorker.KEY_OFFLINE_DOC_ID, doc.id)
                        .putString(com.hospital.management.worker.UploadWorker.KEY_PATIENT_ID, doc.patientId)
                        .putString(com.hospital.management.worker.UploadWorker.KEY_FOLDER_NAME, doc.folderName)
                        .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_URI, doc.fileUri)
                        .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_NAME, android.net.Uri.parse(doc.fileUri).lastPathSegment ?: "document.pdf")
                        .putString(com.hospital.management.worker.UploadWorker.KEY_IDEMPOTENCY_KEY, idempotencyKey)
                        .putInt(com.hospital.management.worker.UploadWorker.KEY_UPLOAD_PROFILE_USED, doc.uploadProfileUsed)
                        .putString(com.hospital.management.worker.UploadWorker.KEY_OWNER_HOSPITAL_ID, currentHospitalId)
                        .build()

                    val request = androidx.work.OneTimeWorkRequestBuilder<com.hospital.management.worker.UploadWorker>()
                        .setInputData(inputData)
                        .setConstraints(constraints)
                        .addTag(com.hospital.management.worker.UploadWorker.TAG_UPLOAD)
                        .setBackoffCriteria(
                            androidx.work.BackoffPolicy.EXPONENTIAL,
                            30,
                            java.util.concurrent.TimeUnit.SECONDS
                        )
                        .build()

                    // KEEP policy ensures deduplication (Phase 4.2)
                    workManager.enqueueUniqueWork(
                        "upload_$idempotencyKey",
                        androidx.work.ExistingWorkPolicy.KEEP,
                        request
                    )
                    FileLogger.i(TAG, "Enqueued UploadWorker for eligible doc: idempotencyKey=$idempotencyKey")
                }

                UploadNotifier.cancel(context, notificationId)
                return@withContext Result.success()
            } catch (e: Exception) {
                FileLogger.e(TAG, "Sync worker failed", e)
                UploadNotifier.cancel(context, notificationId)
                return@withContext Result.failure()
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

    // ─── Unused legacy functions removed ───
}
