package com.hospital.management.utils

import android.Manifest
import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.hospital.management.HospitalApplication
import com.hospital.management.R
import com.hospital.management.worker.DownloadProgress
import com.hospital.management.worker.DownloadStage
import com.hospital.management.worker.formatDownloadSubtext
import java.io.File
import java.util.UUID

/**
 * Builds and posts download-stage notifications that mirror the system download UX
 * (Chrome / Files app style). Also keeps the legacy [notifyCompleted] entry point
 * used by the folder-level ResponseBody save paths.
 *
 * ### Throttling
 * The byte-stream stage fires progress very frequently. Callers must build a
 * [ProgressThrottle] once per download and ask it before rebuilding a DOWNLOADING
 * notification — it enforces a minimum interval (500 ms by default) but always
 * lets stage transitions, terminal stages, and the final 100 % tick through.
 */
object DownloadNotifier {

    private const val TAG = "DownloadNotifier"

    const val ACTION_CANCEL = "com.hospital.management.download.action.CANCEL"
    const val ACTION_RETRY = "com.hospital.management.download.action.RETRY"

    const val EXTRA_WORK_ID = "work_id"
    const val EXTRA_NOTIFICATION_ID = "notif_id"
    const val EXTRA_RETRY_INPUT = "retry_input_data"

    // ────────────────────────────────────────────────────────────────────────
    // Public API — notification IDs + builders
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Derive a stable notification id from the WorkRequest UUID so concurrent
     * downloads (folder PDF + patient PDF + per-file) never collide and the
     * same Worker always updates the same notification across stage swaps.
     *
     * ### Stability across process restart
     * WorkManager persists each WorkRequest's UUID in its own Room database.
     * If the user force-stops the app mid-download and the OS later reruns
     * the Worker, the same UUID is used, so this function returns the same
     * notification id — the restarted Worker's first `setForeground()` call
     * **updates** the existing system-held notification rather than posting
     * a duplicate. A new WorkRequest (e.g. after tapping Retry) has a fresh
     * UUID and therefore a fresh notification id.
     *
     * ### Across app reinstall
     * Reinstalling wipes both WorkManager's DB *and* any posted notifications
     * owned by this package, so there's no ghost-notification concern.
     */
    fun notificationIdFor(workId: UUID): Int =
        (workId.mostSignificantBits xor workId.leastSignificantBits)
            .toInt()
            .let { if (it == 0) 1 else it and 0x7FFFFFFF }

    fun hasPostPermission(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(
            context, Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED
    }

    /** Post (or update) a notification. Silently no-ops if POST_NOTIFICATIONS is denied. */
    fun post(context: Context, notificationId: Int, notification: Notification) {
        if (!hasPostPermission(context)) {
            Log.d(TAG, "post skipped — POST_NOTIFICATIONS denied")
            return
        }
        try {
            NotificationManagerCompat.from(context).notify(notificationId, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "notify denied: ${e.message}")
        }
    }

    fun cancel(context: Context, notificationId: Int) {
        try {
            NotificationManagerCompat.from(context).cancel(notificationId)
        } catch (_: Exception) { /* ignore */ }
    }

    // ── Stage builders ──────────────────────────────────────────────────────

    fun buildPreparing(
        context: Context,
        notificationId: Int,
        workId: UUID,
        fileName: String,
        stageHint: String?
    ): Notification {
        val subtext = stageHint?.takeIf { it.isNotBlank() }
            ?: context.getString(R.string.download_preparing_subtext)

        return baseBuilder(context)
            .setContentTitle(context.getString(R.string.download_preparing_title, fileName))
            .setContentText(subtext)
            .setSubText(context.getString(R.string.download_stage_preparing))
            .setProgress(0, 0, true) // indeterminate
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .addAction(cancelAction(context, notificationId, workId))
            .build()
    }

    fun buildDownloading(
        context: Context,
        notificationId: Int,
        workId: UUID,
        progress: DownloadProgress
    ): Notification {
        val percent = progress.percent
        val indeterminate = percent < 0
        val builder = baseBuilder(context)
            .setContentTitle(context.getString(R.string.download_downloading_title, progress.fileName))
            .setContentText(context.formatDownloadSubtext(progress))
            .setSubText(context.getString(R.string.download_stage_downloading))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .addAction(cancelAction(context, notificationId, workId))

        if (indeterminate) {
            builder.setProgress(0, 0, true)
        } else {
            builder.setProgress(100, percent, false)
        }
        return builder.build()
    }

    fun buildReady(
        context: Context,
        notificationId: Int,
        file: File,
        fileName: String,
        mimeType: String
    ): Notification {
        val openPI = openFilePendingIntent(context, notificationId, file, mimeType)

        return baseBuilder(context)
            .setContentTitle(context.getString(R.string.download_ready_title))
            .setContentText(context.getString(R.string.download_ready_text))
            .setSubText(fileName)
            .setContentIntent(openPI)
            // setOngoing(true) blocks swipe-to-dismiss; setAutoCancel(true) still
            // clears the notification when the user taps and opens the file.
            .setOngoing(true)
            .setAutoCancel(true)
            .build()
    }

    /**
     * [retryable] = false when Worker has returned Result.failure and no more
     * automatic retries will run — we show a Retry action. When true, WorkManager
     * backoff is still in play and the notification text reflects that.
     */
    fun buildFailed(
        context: Context,
        notificationId: Int,
        workId: UUID,
        progress: DownloadProgress,
        retryable: Boolean,
        retryInputData: androidx.work.Data? = null
    ): Notification {
        val builder = baseBuilder(context)
            .setContentTitle(context.getString(R.string.download_failed_title))
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)

        if (retryable) {
            val secs = progress.retryInSeconds.coerceAtLeast(0)
            builder.setContentText(context.getString(R.string.download_retrying_text, secs))
                .setSubText(progress.fileName)
                .setProgress(0, 0, true)
                .addAction(cancelAction(context, notificationId, workId))
        } else {
            builder.setContentText(context.getString(R.string.download_failed_text))
                .setSubText(progress.fileName)
            if (retryInputData != null) {
                builder.addAction(retryAction(context, notificationId, retryInputData))
            }
        }
        return builder.build()
    }

    // ────────────────────────────────────────────────────────────────────────
    // Legacy non-worker completion (folder ResponseBody save path)
    // ────────────────────────────────────────────────────────────────────────

    fun notifyCompleted(
        context: Context,
        contentUri: Uri,
        displayName: String,
        mimeType: String,
    ) {
        val openIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(contentUri, mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        val requestCode = (contentUri.toString() + displayName).hashCode()
        val pendingIntent = PendingIntent.getActivity(
            context,
            requestCode,
            Intent.createChooser(openIntent, context.getString(R.string.download_open_with)),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = baseBuilder(context)
            .setContentTitle(context.getString(R.string.download_ready_title))
            .setContentText(displayName)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        post(context, requestCode, notification)
    }

    // ────────────────────────────────────────────────────────────────────────
    // Internals
    // ────────────────────────────────────────────────────────────────────────

    private fun baseBuilder(context: Context): NotificationCompat.Builder =
        NotificationCompat.Builder(context, HospitalApplication.CHANNEL_DOWNLOADS)
            .setSmallIcon(R.drawable.ic_file_document)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .setLocalOnly(true)

    private fun cancelAction(
        context: Context,
        notificationId: Int,
        workId: UUID
    ): NotificationCompat.Action {
        val intent = Intent(context, DownloadActionReceiver::class.java).apply {
            action = ACTION_CANCEL
            setPackage(context.packageName)
            putExtra(EXTRA_WORK_ID, workId.toString())
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        }
        val pi = PendingIntent.getBroadcast(
            context, notificationId, intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_close,
            context.getString(R.string.cancel),
            pi
        ).build()
    }

    private fun retryAction(
        context: Context,
        notificationId: Int,
        retryInputData: androidx.work.Data
    ): NotificationCompat.Action {
        val intent = Intent(context, DownloadActionReceiver::class.java).apply {
            action = ACTION_RETRY
            setPackage(context.packageName)
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_RETRY_INPUT, retryInputData.toByteArray())
        }
        val pi = PendingIntent.getBroadcast(
            context,
            notificationId xor 0x52, // distinct request code from cancel
            intent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        return NotificationCompat.Action.Builder(
            R.drawable.ic_file_document,
            context.getString(R.string.retry),
            pi
        ).build()
    }

    private fun openFilePendingIntent(
        context: Context,
        requestCode: Int,
        file: File,
        mimeType: String
    ): PendingIntent {
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.provider",
            file
        )
        val viewIntent = Intent(Intent.ACTION_VIEW).apply {
            setDataAndType(uri, mimeType)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        return PendingIntent.getActivity(
            context,
            requestCode,
            viewIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    /**
     * Enforces a minimum interval between DOWNLOADING progress notifications.
     * Stage transitions, terminal stages, and the final 100 % tick always emit.
     */
    class ProgressThrottle(private val minIntervalMs: Long = 500L) {
        private var lastEmittedAtMs: Long = 0L
        private var lastStage: DownloadStage? = null
        private var lastPercentTick: Int = -1

        @Synchronized
        fun shouldEmit(progress: DownloadProgress): Boolean {
            val now = System.currentTimeMillis()
            val stageChanged = progress.stage != lastStage
            val isTerminal = progress.stage == DownloadStage.READY ||
                progress.stage == DownloadStage.FAILED ||
                progress.stage == DownloadStage.RETRYING
            val hitHundred = progress.percent == 100 && lastPercentTick != 100

            val due = now - lastEmittedAtMs >= minIntervalMs
            val emit = stageChanged || isTerminal || hitHundred || due
            if (emit) {
                lastEmittedAtMs = now
                lastStage = progress.stage
                if (progress.percent >= 0) lastPercentTick = progress.percent
            }
            return emit
        }

        @Synchronized
        fun reset() {
            lastEmittedAtMs = 0L
            lastStage = null
            lastPercentTick = -1
        }
    }
}
