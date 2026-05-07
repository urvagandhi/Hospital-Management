package com.hospital.management.worker

import android.content.Context
import androidx.work.Data
import com.hospital.management.R
import java.util.Locale

enum class DownloadStage {
    PREPARING,
    DOWNLOADING,
    READY,
    FAILED,
    RETRYING;

    companion object {
        fun fromNameOrNull(name: String?): DownloadStage? =
            name?.let { runCatching { valueOf(it) }.getOrNull() }
    }
}

/**
 * Single source of truth for download progress surfaced from [DownloadWorker].
 * Serialized into [androidx.work.Data] so that:
 *   - the worker foreground notification,
 *   - the in-app progress UI (via WorkInfo.progress),
 * read the exact same payload.
 */
data class DownloadProgress(
    val stage: DownloadStage,
    val bytesDownloaded: Long = 0L,
    val totalBytes: Long = 0L,
    val speedBytesPerSec: Long = 0L,
    val serverStageHint: String? = null,
    val retryInSeconds: Int = 0,
    val fileName: String = "",
    val errorReason: String? = null,
    val targetSizeMb: Int = 0
) {

    /** 0..100, or -1 when the total is unknown (indeterminate bar). */
    val percent: Int
        get() = if (totalBytes > 0L) {
            ((bytesDownloaded * 100L) / totalBytes).toInt().coerceIn(0, 100)
        } else -1

    fun toData(): Data = Data.Builder()
        .putString(KEY_STAGE, stage.name)
        .putLong(KEY_BYTES, bytesDownloaded)
        .putLong(KEY_TOTAL, totalBytes)
        .putLong(KEY_SPEED, speedBytesPerSec)
        .putString(KEY_HINT, serverStageHint)
        .putInt(KEY_RETRY_SEC, retryInSeconds)
        .putString(KEY_FILE_NAME, fileName)
        .putString(KEY_ERROR, errorReason)
        .putInt(KEY_TARGET_SIZE, targetSizeMb)
        .build()

    companion object {
        const val KEY_STAGE = "dp_stage"
        const val KEY_BYTES = "dp_bytes"
        const val KEY_TOTAL = "dp_total"
        const val KEY_SPEED = "dp_speed"
        const val KEY_HINT = "dp_hint"
        const val KEY_RETRY_SEC = "dp_retry_sec"
        const val KEY_FILE_NAME = "dp_file_name"
        const val KEY_ERROR = "dp_error"
        const val KEY_TARGET_SIZE = "dp_target_size"

        fun fromData(data: Data?): DownloadProgress? {
            if (data == null) return null
            val stage = DownloadStage.fromNameOrNull(data.getString(KEY_STAGE)) ?: return null
            return DownloadProgress(
                stage = stage,
                bytesDownloaded = data.getLong(KEY_BYTES, 0L),
                totalBytes = data.getLong(KEY_TOTAL, 0L),
                speedBytesPerSec = data.getLong(KEY_SPEED, 0L),
                serverStageHint = data.getString(KEY_HINT),
                retryInSeconds = data.getInt(KEY_RETRY_SEC, 0),
                fileName = data.getString(KEY_FILE_NAME).orEmpty(),
                errorReason = data.getString(KEY_ERROR),
                targetSizeMb = data.getInt(KEY_TARGET_SIZE, 0)
            )
        }
    }
}

/** Formats a byte count as "2.4 MB" / "512 KB" / "800 B". Uses locale-aware decimal. */
fun Context.formatBytes(bytes: Long): String {
    if (bytes <= 0L) return getString(R.string.download_bytes, 0)
    val kb = 1024.0
    val mb = kb * 1024
    val gb = mb * 1024
    val b = bytes.toDouble()
    return when {
        b >= gb -> getString(R.string.download_gb, b / gb)
        b >= mb -> getString(R.string.download_mb, b / mb)
        b >= kb -> getString(R.string.download_kb, b / kb)
        else    -> getString(R.string.download_bytes, bytes)
    }
}

/** Formats a speed as "1.2 MB/s". Zero/negative returns empty string. */
fun Context.formatSpeed(bytesPerSec: Long): String {
    if (bytesPerSec <= 0L) return ""
    return getString(R.string.download_speed_fmt, formatBytes(bytesPerSec))
}

/** Builds a "2.4 MB of 3.8 MB · 1.2 MB/s" subtext for the notification. */
fun Context.formatDownloadSubtext(progress: DownloadProgress): String {
    val of = getString(R.string.download_of_separator)
    val dot = getString(R.string.download_middle_dot)
    val done = formatBytes(progress.bytesDownloaded)
    val sizePart = if (progress.totalBytes > 0L) {
        val total = formatBytes(progress.totalBytes)
        String.format(Locale.getDefault(), "%s %s %s", done, of, total)
    } else {
        done
    }
    val speed = formatSpeed(progress.speedBytesPerSec)
    return if (speed.isNotEmpty()) "$sizePart $dot $speed" else sizePart
}
