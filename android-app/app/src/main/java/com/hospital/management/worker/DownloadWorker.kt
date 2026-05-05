package com.hospital.management.worker

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import com.hospital.management.utils.FileLogger
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.DownloadCache
import com.hospital.management.utils.DownloadNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.File
import java.io.IOException
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * End-to-end download worker.
 *
 * Runs as a foreground service so long CDN transfers aren't killed on poor
 * connections. Publishes progress through [DownloadProgress] serialized into
 * [Data]:
 *   - [setProgress] lets the in-app UI observe via WorkInfo.progress.
 *   - The foreground notification is rebuilt from the same DownloadProgress via
 *     [DownloadNotifier].
 *
 * Stages visible to the user:
 *   - PREPARING     HEAD request / cache lookup / server-side merge hints
 *   - DOWNLOADING   byte stream with real total + speed; resumes from last byte
 *   - READY         tap notification to open the PDF via FileProvider
 *   - FAILED        terminal — with Retry action
 *   - RETRYING      WorkManager backoff in progress (shown before Result.retry)
 */
class DownloadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "DownloadWorker"
        private const val CACHE_DIR_NAME = "download_cache"
        private const val MAX_CACHE_BYTES = 500L * 1024 * 1024 // 500 MB
        private const val MIN_PROGRESS_INTERVAL_MS = 500L
        private const val SPEED_WINDOW_MS = 1_000L
        private const val POLL_INTERVAL_MS = 3_500L
        private const val POLL_MAX_WAIT_MS = 10L * 60 * 1000 // 10 min ceiling for Cloud Run prep

        /** Tag every download WorkRequest with this so logout can cancel them in bulk. */
        const val TAG_DOWNLOAD = "hms_download"

        // Input keys
        const val KEY_DOWNLOAD_URL = "download_url"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_PATIENT_NAME = "patient_name"
        const val KEY_HOSPITAL_NAME = "hospital_name"
        const val KEY_FOLDER_NAME = "folder_name"
        const val KEY_MIME_TYPE = "mime_type"
        const val KEY_DOWNLOAD_SUB_PATH = "download_sub_path"
        const val KEY_AUTH_TOKEN = "auth_token"
        const val KEY_AUTH_HOST = "auth_host"
        /** Optional — surface a server-side stage ("Merging 4 of 7 folders") in the PREPARING subtext. */
        const val KEY_SERVER_STAGE_HINT = "server_stage_hint"
        /** Optional — cap automatic retries; default handled by WorkManager RUN_ATTEMPT_COUNT. */
        const val KEY_MAX_RETRIES = "max_retries"
        /**
         * Optional — Cloud Run job status endpoint. When set, the Worker runs phase 1
         * (polling loop) BEFORE the byte stream: it GETs this URL every ~3.5s,
         * surfaces the response's `stage` field in the PREPARING notification subtext,
         * and reads the response's `url` field once `status == "ready"` to use as the
         * signed CDN URL for phase 2. The `KEY_DOWNLOAD_URL` input is treated as a
         * seed value — the polled URL takes precedence. Omit to skip polling (direct
         * URL flow, current single-file behaviour).
         *
         * Expected status JSON shape:
         *   {"status": "preparing" | "ready" | "failed",
         *    "stage":  "Merging 4 of 7 folders"?,
         *    "url":    "https://.../signed..."?,
         *    "message": "..."?}
         */
        const val KEY_STATUS_URL = "status_url"
        /**
         * Optional — HTTP method for the byte-stream phase. Defaults to "GET".
         * Set to "POST" for server-side bulk download endpoints
         * (`/api/patients/{id}/download/pdf`, `/api/patients/{id}/download/zip`,
         *  `/api/patients/{id}/folders/{folder}/download/{pdf|zip}`).
         *
         * POST flows skip:
         *   - HEAD probing (most bulk endpoints don't support it),
         *   - resume / Range (POST responses are not resumable),
         *   - Last-Modified-keyed disk cache (server merges are dynamic).
         * Each POST hits the server fresh and streams the response body to disk.
         */
        const val KEY_HTTP_METHOD = "http_method"
        /**
         * Optional — when [KEY_HTTP_METHOD] is "POST", the JSON string sent as
         * the request body (Content-Type: application/json). Empty string or
         * null = no body (e.g. patient-zip-all endpoint accepts an empty POST).
         */
        const val KEY_REQUEST_BODY_JSON = "request_body_json"

        // Output keys
        const val KEY_CACHED_PATH = "cached_path"
        const val KEY_STATUS = "status"
        const val KEY_ERROR_REASON = "error_reason"

        // Error categories
        const val ERROR_NETWORK = "NETWORK"
        const val ERROR_STORAGE_FULL = "STORAGE_FULL"
        const val ERROR_AUTH_EXPIRED = "AUTH_EXPIRED"
        const val ERROR_SERVER = "SERVER_ERROR"
        const val ERROR_CANCELLED = "CANCELLED"

        // Legacy progress keys kept so older observers compile — prefer DownloadProgress.fromData.
        const val KEY_PROGRESS = "progress"
        const val KEY_PROGRESS_STATE = "progress_state"
        const val STATE_PREPARING = "PREPARING"
        const val STATE_DOWNLOADING = "DOWNLOADING"
        const val STATE_READY = "READY"

        private const val DEFAULT_MAX_RETRIES = 3
    }

    private val cacheDao by lazy { AppDatabase.getDatabase(applicationContext).downloadCacheDao() }
    private val notificationId by lazy { DownloadNotifier.notificationIdFor(id) }
    private val throttle = DownloadNotifier.ProgressThrottle(MIN_PROGRESS_INTERVAL_MS)

    private lateinit var fileName: String
    private lateinit var mimeType: String

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val currentName = if (::fileName.isInitialized) fileName
            else inputData.getString(KEY_FILE_NAME) ?: "download.pdf"
        val notification = DownloadNotifier.buildPreparing(
            applicationContext, notificationId, id, currentName,
            inputData.getString(KEY_SERVER_STAGE_HINT)
        )
        return makeForegroundInfo(notification)
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // ── STEP 0: foreground promotion MUST happen before any network I/O. ──
        // Android 12+ will throw ForegroundServiceStartNotAllowedException if
        // setForeground isn't called within ~10s of doWork() starting. We only
        // parse the minimum needed to build a notification (fileName + seed hint).
        fileName = inputData.getString(KEY_FILE_NAME) ?: "download.pdf"
        val seedStageHint = inputData.getString(KEY_SERVER_STAGE_HINT)
        try {
            setForeground(makeForegroundInfo(
                DownloadNotifier.buildPreparing(
                    applicationContext, notificationId, id, fileName, seedStageHint
                )
            ))
        } catch (e: Exception) {
            FileLogger.w(TAG, "setForeground failed (permission? backgrounded?): ${e.message}")
        }

        // ── Rest of input parsing ────────────────────────────────────────────
        val seedDownloadUrl = inputData.getString(KEY_DOWNLOAD_URL)
        val statusUrl = inputData.getString(KEY_STATUS_URL)
        if (seedDownloadUrl.isNullOrEmpty() && statusUrl.isNullOrEmpty()) {
            return@withContext failWith(ERROR_NETWORK, "Missing download + status URL", fileName)
        }
        mimeType = inputData.getString(KEY_MIME_TYPE) ?: "application/pdf"
        val subPath = inputData.getString(KEY_DOWNLOAD_SUB_PATH) ?: "HospitalRecords"
        val authToken = inputData.getString(KEY_AUTH_TOKEN)
        val authHost = inputData.getString(KEY_AUTH_HOST)
        val maxRetries = inputData.getInt(KEY_MAX_RETRIES, DEFAULT_MAX_RETRIES)
        val httpMethod = (inputData.getString(KEY_HTTP_METHOD) ?: "GET").uppercase()
        val requestBodyJson = inputData.getString(KEY_REQUEST_BODY_JSON)
        val isPost = httpMethod == "POST"

        try {
            // ── PHASE 1: PREPARING ──────────────────────────────────────────
            // Seed the PREPARING notification so the user sees something
            // immediately, even before the first poll returns.
            emit(DownloadProgress(
                stage = DownloadStage.PREPARING,
                fileName = fileName,
                serverStageHint = seedStageHint
            ), force = true)

            // If a Cloud Run status URL was supplied, poll it to resolve the
            // final signed CDN URL (and surface live stage hints along the way).
            // The polled URL supersedes the seed KEY_DOWNLOAD_URL — which means
            // Retry after a signed-URL expiry also gets a fresh URL for free.
            val downloadUrl: String = if (!statusUrl.isNullOrEmpty()) {
                pollUntilReady(statusUrl, authToken, authHost, seedStageHint)
                    ?: return@withContext cancelled() // isStopped during polling
            } else {
                seedDownloadUrl!! // null-check done above
            }

            // POST flows can't reliably probe via HEAD (server-side merge
            // endpoints often reject HEAD), don't resume (the response body is
            // a fresh dynamic merge each call), and shouldn't fast-path the
            // disk cache since the inputs (folder set, mode) live in the body
            // we can't validate via Last-Modified. Mark them stale + skip both
            // probes, but still write to a content-hashed temp file so the
            // existing finalize/MediaStore flow stays the same.
            val headResult = if (isPost) {
                HeadResult(lastModified = "", acceptRanges = false)
            } else {
                headRequest(downloadUrl, authToken, authHost)
            }
            if (isStopped) return@withContext cancelled()

            val lastModified = headResult.lastModified
            // For POST flows, hash the URL + body so concurrent same-URL POSTs
            // with different bodies (e.g. merged vs per-folder PDF) don't
            // collide on disk.
            val contentHash = if (isPost) {
                computeHash("$downloadUrl|POST|${requestBodyJson ?: ""}", "")
            } else {
                computeHash(downloadUrl, lastModified)
            }
            val isStale = isPost || lastModified.isEmpty()

            // Cache hit fast path — POST flows skip this; the merge result is
            // dynamic and we shouldn't serve stale bytes.
            if (!isPost) {
                val cached = cacheDao.getByHash(contentHash)
                if (cached != null && !cached.isStale) {
                    val cachedFile = File(cached.localPath)
                    if (cachedFile.exists()) {
                        cacheDao.touchAccess(contentHash)
                        FileLogger.i(TAG, "cache_hit=true file=$fileName hash=${contentHash.take(12)}")
                        saveToMediaStore(cachedFile, fileName, mimeType, subPath)
                        finalizeReady(cachedFile)
                        return@withContext Result.success(
                            Data.Builder()
                                .putString(KEY_CACHED_PATH, cached.localPath)
                                .putString(KEY_STATUS, DownloadStage.READY.name)
                                .build()
                        )
                    }
                    cacheDao.deleteByHash(contentHash)
                }
            }

            FileLogger.i(TAG, "cache_hit=false method=$httpMethod file=$fileName hash=${contentHash.take(12)}")

            val cacheDir = File(applicationContext.filesDir, CACHE_DIR_NAME).also { it.mkdirs() }
            val tmpFile = File(cacheDir, "$contentHash.tmp")
            val finalFile = File(cacheDir, "$contentHash${extensionFor(fileName)}")
            val partialMetaFile = File(cacheDir, "$contentHash.meta")

            // Resume verification — only trust .tmp when Last-Modified matches.
            // POST flows always start from byte 0 (server can't honour Range).
            var resumeOffset = 0L
            if (!isPost) {
                if (tmpFile.exists() && partialMetaFile.exists()) {
                    val storedLastModified = partialMetaFile.readText().trim()
                    if (lastModified.isNotEmpty() && storedLastModified == lastModified) {
                        resumeOffset = tmpFile.length()
                        FileLogger.d(TAG, "resume from byte=$resumeOffset")
                    } else {
                        tmpFile.delete(); partialMetaFile.delete()
                    }
                } else if (tmpFile.exists()) {
                    tmpFile.delete()
                }
                if (lastModified.isNotEmpty()) partialMetaFile.writeText(lastModified)
            } else {
                // Wipe any stragglers from a prior run — POST isn't resumable.
                if (tmpFile.exists()) tmpFile.delete()
                if (partialMetaFile.exists()) partialMetaFile.delete()
            }

            val parsedUrl = URL(downloadUrl)
            val conn = (parsedUrl.openConnection() as HttpURLConnection).apply {
                // Bulk merges (PDF / ZIP) on the server can take a while —
                // give it a 10-minute timeout to match the backend/sidecar limits.
                connectTimeout = 30_000
                readTimeout = 600_000
                if (isPost) {
                    requestMethod = "POST"
                    doOutput = true
                    if (!requestBodyJson.isNullOrEmpty()) {
                        setRequestProperty("Content-Type", "application/json; charset=utf-8")
                        setRequestProperty("Accept", mimeType)
                    }
                }
                if (resumeOffset > 0 && headResult.acceptRanges) {
                    setRequestProperty("Range", "bytes=$resumeOffset-")
                }
                if (shouldAttachAuth(parsedUrl, authHost) && !authToken.isNullOrEmpty()) {
                    setRequestProperty("Authorization", "Bearer $authToken")
                }
            }

            try {
                conn.connect()
                // Write POST body after connect() so HttpURLConnection has
                // committed headers — this is the standard pattern for the
                // legacy URLConnection API.
                if (isPost && !requestBodyJson.isNullOrEmpty()) {
                    conn.outputStream.use { os ->
                        os.write(requestBodyJson.toByteArray(Charsets.UTF_8))
                        os.flush()
                    }
                }
                when (conn.responseCode) {
                    in 200..206 -> { /* OK */ }
                    401, 403 -> return@withContext failWith(
                        ERROR_AUTH_EXPIRED, "Auth expired (${conn.responseCode})", fileName
                    )
                    in 400..499 -> return@withContext failWith(
                        ERROR_SERVER, "Client error ${conn.responseCode}", fileName
                    )
                    in 500..599 -> return@withContext failWith(
                        ERROR_SERVER, "Server error ${conn.responseCode}", fileName
                    )
                    else -> return@withContext maybeRetry(
                        maxRetries, ERROR_NETWORK,
                        "Unexpected status ${conn.responseCode}", fileName
                    )
                }

                // 206 → we resumed; 200 → server ignored Range, start over.
                // Log loudly when we sent Range but got 200 back: some CDN edges
                // (notably older Cloudinary config) strip Range headers and
                // return the full body, which would silently re-download from
                // byte 0 while progress math thought it was resuming.
                val sentRange = resumeOffset > 0 && headResult.acceptRanges
                val contentRange = conn.getHeaderField("Content-Range")
                if (sentRange) {
                    if (conn.responseCode == 206) {
                        FileLogger.i(TAG, "resume OK 206 Content-Range=$contentRange offset=$resumeOffset")
                    } else {
                        FileLogger.w(TAG, "resume ignored — requested Range but got ${conn.responseCode} " +
                            "(Content-Range=$contentRange); restarting from byte 0")
                    }
                }
                val actualResumeOffset = if (conn.responseCode == 206) resumeOffset else 0L
                val declaredLen = conn.contentLengthLong
                val totalBytes = when {
                    conn.responseCode == 206 && declaredLen > 0 -> declaredLen + actualResumeOffset
                    declaredLen > 0 -> declaredLen
                    else -> 0L // unknown → indeterminate bar
                }

                // ── DOWNLOADING ─────────────────────────────────────────────
                emit(DownloadProgress(
                    stage = DownloadStage.DOWNLOADING,
                    bytesDownloaded = actualResumeOffset,
                    totalBytes = totalBytes,
                    speedBytesPerSec = 0L,
                    fileName = fileName
                ), force = true)

                RandomAccessFile(tmpFile, "rw").use { raf ->
                    raf.seek(actualResumeOffset)
                    conn.inputStream.use { input ->
                        val buffer = ByteArray(16 * 1024)
                        var bytesWritten = actualResumeOffset

                        var windowStartMs = System.currentTimeMillis()
                        var windowStartBytes = bytesWritten
                        var currentSpeed = 0L

                        while (true) {
                            if (isStopped) return@withContext cancelled()
                            val read = input.read(buffer)
                            if (read == -1) break
                            raf.write(buffer, 0, read)
                            bytesWritten += read

                            val now = System.currentTimeMillis()
                            val windowElapsed = now - windowStartMs
                            if (windowElapsed >= SPEED_WINDOW_MS) {
                                val delta = bytesWritten - windowStartBytes
                                if (windowElapsed > 0) {
                                    currentSpeed = (delta * 1000L / windowElapsed).coerceAtLeast(0)
                                }
                                windowStartMs = now
                                windowStartBytes = bytesWritten
                            }

                            emit(DownloadProgress(
                                stage = DownloadStage.DOWNLOADING,
                                bytesDownloaded = bytesWritten,
                                totalBytes = totalBytes,
                                speedBytesPerSec = currentSpeed,
                                fileName = fileName
                            ))
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }

            if (isStopped) return@withContext cancelled()

            tmpFile.renameTo(finalFile)
            partialMetaFile.delete()

            val now = System.currentTimeMillis()
            // POST results are always stored as stale so the next request
            // re-fetches from the server — see isStale assignment above.
            cacheDao.upsert(
                DownloadCache(
                    contentHash = contentHash,
                    downloadUrl = downloadUrl,
                    localPath = finalFile.absolutePath,
                    fileName = fileName,
                    sizeBytes = finalFile.length(),
                    lastAccessedAt = now,
                    createdAt = now,
                    lastModifiedHeader = lastModified,
                    isStale = isStale
                )
            )
            evictIfNeeded()
            saveToMediaStore(finalFile, fileName, mimeType, subPath)
            finalizeReady(finalFile)

            Result.success(
                Data.Builder()
                    .putString(KEY_CACHED_PATH, finalFile.absolutePath)
                    .putString(KEY_STATUS, DownloadStage.READY.name)
                    .build()
            )
        } catch (e: IOException) {
            FileLogger.e(TAG, "IO error", e)
            if (isStopped) return@withContext cancelled()
            if (e.message?.contains("No space", ignoreCase = true) == true) {
                failWith(ERROR_STORAGE_FULL, "Not enough storage space", fileName)
            } else {
                maybeRetry(
                    inputData.getInt(KEY_MAX_RETRIES, DEFAULT_MAX_RETRIES),
                    ERROR_NETWORK, e.message ?: "Network error", fileName
                )
            }
        } catch (e: Exception) {
            FileLogger.e(TAG, "error", e)
            if (isStopped) return@withContext cancelled()
            failWith(ERROR_NETWORK, e.message ?: "Unknown error", fileName)
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
     * Single emit pipeline: publish to WorkInfo.progress AND update the
     * foreground notification — both from the same payload.
     * DOWNLOADING ticks are throttled to [MIN_PROGRESS_INTERVAL_MS]; stage
     * transitions and [force]=true bypass the throttle.
     */
    private suspend fun emit(progress: DownloadProgress, force: Boolean = false) {
        if (!force && !throttle.shouldEmit(progress)) return

        setProgress(progress.toData())

        val notification = when (progress.stage) {
            DownloadStage.PREPARING -> DownloadNotifier.buildPreparing(
                applicationContext, notificationId, id, progress.fileName, progress.serverStageHint
            )
            DownloadStage.DOWNLOADING -> DownloadNotifier.buildDownloading(
                applicationContext, notificationId, id, progress
            )
            else -> null // READY / FAILED / RETRYING posted elsewhere (outside foreground)
        }
        if (notification != null) {
            try {
                setForeground(makeForegroundInfo(notification))
            } catch (e: Exception) {
                // Fallback — post via NotificationManager if setForeground is rejected
                // (e.g. after the worker has already stopped or permission revoked).
                DownloadNotifier.post(applicationContext, notificationId, notification)
            }
        }
    }

    private fun finalizeReady(finalFile: File) {
        // Foreground service teardown will remove the notification posted under
        // notificationId once doWork() returns. Post the Ready notification
        // under a distinct id so it survives, then cancel the foreground id.
        val readyId = DownloadNotifier.completionNotificationIdFor(id)
        val notification = DownloadNotifier.buildReady(
            applicationContext, readyId, finalFile, fileName, mimeType
        )
        DownloadNotifier.post(applicationContext, readyId, notification)
        DownloadNotifier.cancel(applicationContext, notificationId)
    }

    private fun cancelled(): Result {
        DownloadNotifier.cancel(applicationContext, notificationId)
        return Result.failure(
            Data.Builder()
                .putString(KEY_ERROR_REASON, ERROR_CANCELLED)
                .putString(KEY_STATUS, DownloadStage.FAILED.name)
                .build()
        )
    }

    private fun failWith(reason: String, message: String, fileNameForNotif: String): Result {
        // Same logout-race rationale as [maybeRetry]: if the OkHttp call came
        // back 401 because the token was just cleared, we don't want to show
        // a "Session expired" notification that gets cancelled instantly.
        if (isStopped) return cancelled()

        FileLogger.e(TAG, "failed [$reason]: $message")
        val progress = DownloadProgress(
            stage = DownloadStage.FAILED,
            fileName = fileNameForNotif,
            errorReason = reason
        )
        // Same survives-foreground-teardown rationale as finalizeReady:
        // post under the completion id, then cancel the foreground id.
        val failedId = DownloadNotifier.completionNotificationIdFor(id)
        val notification = DownloadNotifier.buildFailed(
            applicationContext, failedId, id, progress,
            retryable = false,
            retryInputData = buildRetryInputData()
        )
        DownloadNotifier.post(applicationContext, failedId, notification)
        DownloadNotifier.cancel(applicationContext, notificationId)
        return Result.failure(
            Data.Builder()
                .putString(KEY_ERROR_REASON, reason)
                .putString(KEY_STATUS, message)
                .build()
        )
    }

    /**
     * Scrubs the retry payload so tapping "Retry" 6 hours later doesn't hit an
     * expired signed URL:
     *   - If the original download was a polling flow (KEY_STATUS_URL set),
     *     drop KEY_DOWNLOAD_URL — the new Worker will re-resolve via polling.
     *   - If there was no status URL, we have no way to refresh a signed URL
     *     from the receiver alone. The retry reuses the original URL; callers
     *     that pass signed URLs should either (a) make KEY_DOWNLOAD_URL point
     *     to a permanent backend endpoint that re-issues the CDN redirect on
     *     each hit, or (b) supply KEY_STATUS_URL.
     */
    private fun buildRetryInputData(): Data {
        val statusUrl = inputData.getString(KEY_STATUS_URL)
        if (statusUrl.isNullOrEmpty()) return inputData

        val builder = Data.Builder()
        inputData.keyValueMap.forEach { (k, v) ->
            if (k == KEY_DOWNLOAD_URL) return@forEach // drop stale signed URL
            when (v) {
                is String -> builder.putString(k, v)
                is Int -> builder.putInt(k, v)
                is Long -> builder.putLong(k, v)
                is Boolean -> builder.putBoolean(k, v)
                is Float -> builder.putFloat(k, v)
                is Double -> builder.putDouble(k, v)
                else -> { /* other types not used in this Worker */ }
            }
        }
        return builder.build()
    }

    private suspend fun maybeRetry(
        maxRetries: Int,
        reason: String,
        message: String,
        fileNameForNotif: String
    ): Result {
        // Logout-cancel race: cancelAllWorkByTag is async. If the token was
        // cleared first, the OkHttp call fails with 401 before cancellation
        // lands here. Without this guard we'd post a "Waiting for connection"
        // notification that gets cancelled milliseconds later — the user sees
        // it flash on logout. Short-circuit to cancelled() so logout stays
        // silent.
        if (isStopped) return cancelled()

        return if (runAttemptCount < maxRetries) {
            // Approximate next backoff delay from WorkManager's exponential default.
            val approxSec = (30L shl runAttemptCount).coerceAtMost(5 * 60L).toInt()
            FileLogger.w(TAG, "retrying [$reason]: $message (attempt=${runAttemptCount + 1}/$maxRetries)")
            val progress = DownloadProgress(
                stage = DownloadStage.RETRYING,
                fileName = fileNameForNotif,
                retryInSeconds = approxSec,
                errorReason = reason
            )
            setProgress(progress.toData())
            DownloadNotifier.post(
                applicationContext,
                notificationId,
                DownloadNotifier.buildFailed(
                    applicationContext, notificationId, id, progress,
                    retryable = true
                )
            )
            Result.retry()
        } else {
            failWith(reason, message, fileNameForNotif)
        }
    }

    // ─── Phase 1: Cloud Run polling ─────────────────────────────────────────

    private data class StatusResponse(
        val status: String,
        val stage: String?,
        val url: String?,
        val message: String?
    )

    /**
     * Polls [statusUrl] every [POLL_INTERVAL_MS] until the server reports
     * `status: "ready"` and returns the resolved signed URL. Each poll surfaces
     * the current `stage` as the PREPARING notification's subtext — the emit
     * pipeline's throttle only bypasses it on actual stage-value changes, so a
     * static "Merging…" doesn't re-render on every 3.5s tick.
     *
     * Returns `null` when the Worker is asked to stop mid-polling.
     * Throws [IOException] on `status: "failed"` or when the wait ceiling
     * [POLL_MAX_WAIT_MS] is exceeded, routed through the usual retry logic.
     */
    private suspend fun pollUntilReady(
        statusUrl: String,
        authToken: String?,
        authHost: String?,
        seedHint: String?
    ): String? {
        var hint = seedHint
        val startedAt = System.currentTimeMillis()

        while (true) {
            if (isStopped) return null
            if (System.currentTimeMillis() - startedAt > POLL_MAX_WAIT_MS) {
                throw IOException("Server did not produce a download in ${POLL_MAX_WAIT_MS / 1000}s")
            }

            val response = fetchStatus(statusUrl, authToken, authHost)
            when (response.status.lowercase()) {
                "ready" -> {
                    val url = response.url
                    if (url.isNullOrEmpty()) {
                        throw IOException("Server reported ready but returned no url")
                    }
                    return url
                }
                "failed", "error" -> {
                    throw IOException(response.message ?: "Server reported failure")
                }
                else -> {
                    // "preparing" / "pending" / "merging" / etc. — surface stage
                    // only when the value actually changes so we don't fight the
                    // throttle on every 3.5s tick for a static hint.
                    if (!response.stage.isNullOrEmpty() && response.stage != hint) {
                        hint = response.stage
                        emit(DownloadProgress(
                            stage = DownloadStage.PREPARING,
                            fileName = fileName,
                            serverStageHint = hint
                        ), force = true)
                    }
                }
            }

            // Cancellable delay — if the Worker is stopped, this throws
            // CancellationException which the outer try/catch converts into
            // a cancelled() Result via the isStopped guard.
            delay(POLL_INTERVAL_MS)
        }
    }

    private fun fetchStatus(
        statusUrl: String,
        authToken: String?,
        authHost: String?
    ): StatusResponse {
        val parsedUrl = URL(statusUrl)
        val conn = (parsedUrl.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 10_000
            setRequestProperty("Accept", "application/json")
            if (shouldAttachAuth(parsedUrl, authHost) && !authToken.isNullOrEmpty()) {
                setRequestProperty("Authorization", "Bearer $authToken")
            }
        }
        try {
            conn.connect()
            when (val code = conn.responseCode) {
                in 200..299 -> { /* ok, parse */ }
                401, 403 -> throw IOException("Status poll auth failed ($code)")
                404, 410 -> throw IOException("Download job expired or not found ($code)")
                in 500..599 -> throw IOException("Status poll server error $code")
                else -> throw IOException("Unexpected status poll code $code")
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            val json = JSONObject(body)
            return StatusResponse(
                status = json.optString("status", "preparing"),
                stage = json.optString("stage").takeIf { it.isNotBlank() },
                url = json.optString("url").takeIf { it.isNotBlank() },
                message = json.optString("message").takeIf { it.isNotBlank() }
            )
        } finally {
            conn.disconnect()
        }
    }

    // ─── HTTP / cache helpers ───────────────────────────────────────────────

    private data class HeadResult(val lastModified: String, val acceptRanges: Boolean)

    private fun headRequest(url: String, authToken: String?, authHost: String?): HeadResult {
        return try {
            val parsedUrl = URL(url)
            val conn = (parsedUrl.openConnection() as HttpURLConnection).apply {
                requestMethod = "HEAD"
                connectTimeout = 10_000
                readTimeout = 10_000
                if (shouldAttachAuth(parsedUrl, authHost) && !authToken.isNullOrEmpty()) {
                    setRequestProperty("Authorization", "Bearer $authToken")
                }
            }
            try {
                conn.connect()
                HeadResult(
                    lastModified = conn.getHeaderField("Last-Modified") ?: "",
                    acceptRanges = conn.getHeaderField("Accept-Ranges")?.contains("bytes") == true
                )
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            FileLogger.w(TAG, "HEAD failed: ${e.message}")
            HeadResult(lastModified = "", acceptRanges = false)
        }
    }

    private fun shouldAttachAuth(url: URL, authHost: String?): Boolean {
        if (authHost.isNullOrEmpty()) return false
        return url.host.equals(authHost, ignoreCase = true)
    }

    private fun computeHash(url: String, lastModified: String): String {
        val input = if (lastModified.isNotEmpty()) "$url|$lastModified" else url
        val digest = MessageDigest.getInstance("SHA-256").digest(input.toByteArray())
        return digest.joinToString("") { "%02x".format(it) }
    }

    private fun extensionFor(fileName: String): String {
        val dot = fileName.lastIndexOf('.')
        return if (dot >= 0) fileName.substring(dot) else ""
    }

    private suspend fun evictIfNeeded() {
        val totalBytes = cacheDao.totalCacheBytes() ?: 0L
        if (totalBytes <= MAX_CACHE_BYTES) return

        var freed = 0L
        val target = totalBytes - MAX_CACHE_BYTES
        val candidates = cacheDao.getEvictionCandidates()
        for (entry in candidates) {
            if (freed >= target) break
            val file = File(entry.localPath)
            if (file.exists()) file.delete()
            cacheDao.deleteByHash(entry.contentHash)
            freed += entry.sizeBytes
            FileLogger.d(TAG, "evicted ${entry.fileName} (${entry.sizeBytes} B)")
        }
    }

    private fun saveToMediaStore(
        sourceFile: File,
        displayName: String,
        mimeType: String,
        subPath: String
    ) {
        try {
            val resolver = applicationContext.contentResolver
            val cv = android.content.ContentValues().apply {
                put(MediaStore.Downloads.DISPLAY_NAME, displayName)
                put(MediaStore.Downloads.MIME_TYPE, mimeType)
                put(MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$subPath")
                put(MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv) ?: return
            resolver.openOutputStream(uri)?.use { out ->
                sourceFile.inputStream().use { it.copyTo(out, bufferSize = 16 * 1024) }
            }
            cv.clear()
            cv.put(MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, cv, null, null)
        } catch (e: Exception) {
            FileLogger.e(TAG, "MediaStore save failed: ${e.message}")
        }
    }
}
