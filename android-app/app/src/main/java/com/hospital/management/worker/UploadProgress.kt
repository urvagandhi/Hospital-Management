package com.hospital.management.worker

import android.content.Context
import androidx.work.Data
import com.hospital.management.R
import java.util.Locale

enum class UploadStage {
    PREPARING,
    UPLOADING,
    COMPLETED,
    FAILED,
    RETRYING;

    companion object {
        fun fromNameOrNull(name: String?): UploadStage? =
            name?.let { runCatching { valueOf(it) }.getOrNull() }
    }
}

/**
 * Single source of truth for upload progress surfaced from [UploadWorker] /
 * [SyncDocumentsWorker]. Sibling of [DownloadProgress] — same toData / fromData
 * contract so the foreground notification builder and any in-app progress UI
 * (via WorkInfo.progress) read the exact same payload.
 *
 * For batch syncs, [currentFileIndex] is 1-based ("File 2 of 5"); for a
 * single-file upload it stays at 0 and the UI omits the batch prefix.
 */
data class UploadProgress(
    val stage: UploadStage,
    val bytesUploaded: Long = 0L,
    val totalBytes: Long = 0L,
    val speedBytesPerSec: Long = 0L,
    val fileName: String = "",
    val currentFileIndex: Int = 0, // 0 for single, 1..total for batch
    val totalFiles: Int = 1,
    val errorReason: String? = null,
    val retryInSeconds: Int = 0,
) {

    /** 0..100, or -1 when the total is unknown (indeterminate bar). */
    val percent: Int
        get() = if (totalBytes > 0L) {
            ((bytesUploaded * 100L) / totalBytes).toInt().coerceIn(0, 100)
        } else -1

    fun toData(): Data = Data.Builder()
        .putString(KEY_STAGE, stage.name)
        .putLong(KEY_BYTES, bytesUploaded)
        .putLong(KEY_TOTAL, totalBytes)
        .putLong(KEY_SPEED, speedBytesPerSec)
        .putString(KEY_FILE_NAME, fileName)
        .putInt(KEY_CURRENT_INDEX, currentFileIndex)
        .putInt(KEY_TOTAL_FILES, totalFiles)
        .putString(KEY_ERROR, errorReason)
        .putInt(KEY_RETRY_SEC, retryInSeconds)
        .build()

    companion object {
        const val KEY_STAGE = "up_stage"
        const val KEY_BYTES = "up_bytes"
        const val KEY_TOTAL = "up_total"
        const val KEY_SPEED = "up_speed"
        const val KEY_FILE_NAME = "up_file_name"
        const val KEY_CURRENT_INDEX = "up_current_index"
        const val KEY_TOTAL_FILES = "up_total_files"
        const val KEY_ERROR = "up_error"
        const val KEY_RETRY_SEC = "up_retry_sec"

        fun fromData(data: Data?): UploadProgress? {
            if (data == null) return null
            val stage = UploadStage.fromNameOrNull(data.getString(KEY_STAGE)) ?: return null
            return UploadProgress(
                stage = stage,
                bytesUploaded = data.getLong(KEY_BYTES, 0L),
                totalBytes = data.getLong(KEY_TOTAL, 0L),
                speedBytesPerSec = data.getLong(KEY_SPEED, 0L),
                fileName = data.getString(KEY_FILE_NAME).orEmpty(),
                currentFileIndex = data.getInt(KEY_CURRENT_INDEX, 0),
                totalFiles = data.getInt(KEY_TOTAL_FILES, 1),
                errorReason = data.getString(KEY_ERROR),
                retryInSeconds = data.getInt(KEY_RETRY_SEC, 0)
            )
        }
    }
}

/**
 * Builds a notification subtext for an upload.
 *
 *  - single-file: "4.2 MB of 12.4 MB · 1.1 MB/s"
 *  - multi-file:  "File 2 of 5 · 4.2 MB of 12.4 MB · 1.1 MB/s"
 *
 * Reuses the existing [Context.formatBytes] / [Context.formatSpeed] helpers
 * declared on [DownloadProgress] so byte/speed formatting stays consistent
 * across upload + download notifications.
 */
fun Context.formatUploadSubtext(progress: UploadProgress): String {
    val of = getString(R.string.download_of_separator)
    val dot = getString(R.string.download_middle_dot)

    val done = formatBytes(progress.bytesUploaded)
    val sizePart = if (progress.totalBytes > 0L) {
        val total = formatBytes(progress.totalBytes)
        String.format(Locale.getDefault(), "%s %s %s", done, of, total)
    } else {
        done
    }
    val speed = formatSpeed(progress.speedBytesPerSec)

    val core = if (speed.isNotEmpty()) "$sizePart $dot $speed" else sizePart

    val isBatch = progress.totalFiles > 1 && progress.currentFileIndex > 0
    return if (isBatch) {
        val batchPrefix = getString(
            R.string.upload_batch_prefix,
            progress.currentFileIndex,
            progress.totalFiles
        )
        "$batchPrefix $dot $core"
    } else {
        core
    }
}
