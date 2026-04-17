package com.hospital.management.worker

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.FileProvider
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.WorkerParameters
import com.hospital.management.HospitalApplication
import com.hospital.management.R
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.DownloadCache
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

class DownloadWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "DownloadWorker"
        private const val CACHE_DIR_NAME = "download_cache"
        private const val MAX_CACHE_BYTES = 500L * 1024 * 1024 // 500 MB

        // Input keys
        const val KEY_DOWNLOAD_URL = "download_url"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_PATIENT_NAME = "patient_name"
        const val KEY_HOSPITAL_NAME = "hospital_name"
        const val KEY_FOLDER_NAME = "folder_name"
        const val KEY_MIME_TYPE = "mime_type"
        const val KEY_DOWNLOAD_SUB_PATH = "download_sub_path"

        // Output keys
        const val KEY_CACHED_PATH = "cached_path"
        const val KEY_STATUS = "status"
        const val KEY_ERROR_REASON = "error_reason"

        // Progress keys
        const val KEY_PROGRESS = "progress"
        const val KEY_PROGRESS_STATE = "progress_state"

        // Progress states
        const val STATE_PREPARING = "PREPARING"
        const val STATE_DOWNLOADING = "DOWNLOADING"
        const val STATE_READY = "READY"

        // Error categories
        const val ERROR_NETWORK = "NETWORK"
        const val ERROR_STORAGE_FULL = "STORAGE_FULL"
        const val ERROR_AUTH_EXPIRED = "AUTH_EXPIRED"
        const val ERROR_SERVER = "SERVER_ERROR"
    }

    private val cacheDao by lazy { AppDatabase.getDatabase(applicationContext).downloadCacheDao() }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val downloadUrl = inputData.getString(KEY_DOWNLOAD_URL) ?: return@withContext failWith(ERROR_NETWORK, "Missing download URL")
        val fileName = inputData.getString(KEY_FILE_NAME) ?: "download.pdf"
        val mimeType = inputData.getString(KEY_MIME_TYPE) ?: "application/pdf"
        val subPath = inputData.getString(KEY_DOWNLOAD_SUB_PATH) ?: "HospitalRecords"

        try {
            // --- PREPARING ---
            reportProgress(STATE_PREPARING, 0)

            // HEAD request to get Last-Modified for cache key
            val headResult = headRequest(downloadUrl)
            val lastModified = headResult.lastModified
            val contentHash = computeHash(downloadUrl, lastModified)
            val isStale = lastModified.isEmpty()

            // Check cache
            val cached = cacheDao.getByHash(contentHash)
            if (cached != null && !cached.isStale) {
                val cachedFile = File(cached.localPath)
                if (cachedFile.exists()) {
                    cacheDao.touchAccess(contentHash)
                    Log.i(TAG, "download cache_hit=true file=$fileName hash=${contentHash.take(12)}")
                    // Still save to Downloads for user access
                    saveToMediaStore(cachedFile, fileName, mimeType, subPath)
                    showCompletionNotification(cachedFile, fileName, mimeType)
                    return@withContext Result.success(
                        Data.Builder()
                            .putString(KEY_CACHED_PATH, cached.localPath)
                            .putString(KEY_STATUS, STATE_READY)
                            .build()
                    )
                }
                // Cached entry but file missing — clean up and re-download
                cacheDao.deleteByHash(contentHash)
            }

            Log.i(TAG, "download cache_hit=false file=$fileName hash=${contentHash.take(12)}")

            // --- DOWNLOADING ---
            reportProgress(STATE_DOWNLOADING, 0)

            val cacheDir = File(applicationContext.filesDir, CACHE_DIR_NAME).also { it.mkdirs() }
            val tmpFile = File(cacheDir, "$contentHash.tmp")
            val finalFile = File(cacheDir, "$contentHash${extensionFor(fileName)}")

            // Check for partial download — verify Last-Modified matches
            var resumeOffset = 0L
            val partialMetaFile = File(cacheDir, "$contentHash.meta")
            if (tmpFile.exists() && partialMetaFile.exists()) {
                val storedLastModified = partialMetaFile.readText().trim()
                if (lastModified.isNotEmpty() && storedLastModified == lastModified) {
                    resumeOffset = tmpFile.length()
                    Log.d(TAG, "Resuming from byte $resumeOffset")
                } else {
                    // Last-Modified changed — partial is garbage
                    Log.d(TAG, "Last-Modified mismatch, restarting download")
                    tmpFile.delete()
                    partialMetaFile.delete()
                }
            } else if (tmpFile.exists()) {
                tmpFile.delete()
            }

            // Save Last-Modified for partial resume verification
            if (lastModified.isNotEmpty()) {
                partialMetaFile.writeText(lastModified)
            }

            // Download
            val conn = (URL(downloadUrl).openConnection() as HttpURLConnection).apply {
                connectTimeout = 15_000
                readTimeout = 60_000
                if (resumeOffset > 0 && headResult.acceptRanges) {
                    setRequestProperty("Range", "bytes=$resumeOffset-")
                }
            }

            try {
                conn.connect()

                when (conn.responseCode) {
                    in 200..206 -> { /* OK */ }
                    401, 403 -> return@withContext failWith(ERROR_AUTH_EXPIRED, "Auth expired (${conn.responseCode})")
                    in 400..499 -> return@withContext failWith(ERROR_SERVER, "Client error ${conn.responseCode}")
                    in 500..599 -> return@withContext failWith(ERROR_SERVER, "Server error ${conn.responseCode}")
                    else -> return@withContext failWith(ERROR_NETWORK, "Unexpected status ${conn.responseCode}")
                }

                // If server returned 200 (not 206), it's sending the full file — reset offset
                val actualResumeOffset = if (conn.responseCode == 206) resumeOffset else 0L
                val totalBytes = if (conn.responseCode == 206) {
                    conn.contentLength.toLong() + actualResumeOffset
                } else {
                    conn.contentLength.toLong()
                }

                RandomAccessFile(tmpFile, "rw").use { raf ->
                    raf.seek(actualResumeOffset)
                    conn.inputStream.use { input ->
                        val buffer = ByteArray(16 * 1024)
                        var bytesWritten = actualResumeOffset
                        var lastProgressReport = 0

                        while (true) {
                            val read = input.read(buffer)
                            if (read == -1) break
                            raf.write(buffer, 0, read)
                            bytesWritten += read

                            if (totalBytes > 0) {
                                val pct = ((bytesWritten * 100) / totalBytes).toInt().coerceIn(0, 100)
                                if (pct > lastProgressReport) {
                                    lastProgressReport = pct
                                    reportProgress(STATE_DOWNLOADING, pct)
                                }
                            }
                        }
                    }
                }
            } finally {
                conn.disconnect()
            }

            // Rename .tmp → final
            tmpFile.renameTo(finalFile)
            partialMetaFile.delete()

            // Persist to cache DB
            val now = System.currentTimeMillis()
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

            // LRU eviction
            evictIfNeeded()

            // Save to public Downloads
            saveToMediaStore(finalFile, fileName, mimeType, subPath)

            // Notification
            showCompletionNotification(finalFile, fileName, mimeType)

            // --- READY ---
            reportProgress(STATE_READY, 100)

            Result.success(
                Data.Builder()
                    .putString(KEY_CACHED_PATH, finalFile.absolutePath)
                    .putString(KEY_STATUS, STATE_READY)
                    .build()
            )

        } catch (e: java.io.IOException) {
            Log.e(TAG, "Download IO error", e)
            if (e.message?.contains("No space", ignoreCase = true) == true) {
                failWith(ERROR_STORAGE_FULL, "Not enough storage space")
            } else {
                failWith(ERROR_NETWORK, e.message ?: "Network error")
            }
        } catch (e: Exception) {
            Log.e(TAG, "Download error", e)
            failWith(ERROR_NETWORK, e.message ?: "Unknown error")
        }
    }

    private data class HeadResult(val lastModified: String, val acceptRanges: Boolean)

    private fun headRequest(url: String): HeadResult {
        return try {
            val conn = (URL(url).openConnection() as HttpURLConnection).apply {
                requestMethod = "HEAD"
                connectTimeout = 10_000
                readTimeout = 10_000
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
            Log.w(TAG, "HEAD request failed: ${e.message}")
            HeadResult(lastModified = "", acceptRanges = false)
        }
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

    private suspend fun reportProgress(state: String, percent: Int) {
        setProgress(
            Data.Builder()
                .putString(KEY_PROGRESS_STATE, state)
                .putInt(KEY_PROGRESS, percent)
                .build()
        )
    }

    private fun failWith(reason: String, message: String): Result {
        Log.e(TAG, "Download failed [$reason]: $message")
        return Result.failure(
            Data.Builder()
                .putString(KEY_ERROR_REASON, reason)
                .putString(KEY_STATUS, message)
                .build()
        )
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
            Log.d(TAG, "Evicted ${entry.fileName} (${entry.sizeBytes} bytes)")
        }
    }

    private fun saveToMediaStore(sourceFile: File, displayName: String, mimeType: String, subPath: String) {
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
            Log.e(TAG, "Failed to save to MediaStore: ${e.message}")
        }
    }

    private fun showCompletionNotification(file: File, displayName: String, mimeType: String) {
        try {
            val uri = FileProvider.getUriForFile(
                applicationContext,
                "${applicationContext.packageName}.provider",
                file
            )
            val openIntent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            val pendingIntent = PendingIntent.getActivity(
                applicationContext, file.hashCode(), openIntent,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )

            val notification = NotificationCompat.Builder(applicationContext, HospitalApplication.CHANNEL_DOWNLOADS)
                .setContentTitle("Download Complete")
                .setContentText(displayName)
                .setSmallIcon(R.drawable.ic_file_document)
                .setContentIntent(pendingIntent)
                .setAutoCancel(true)
                .build()

            val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
            nm.notify(file.hashCode(), notification)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to show notification: ${e.message}")
        }
    }
}
