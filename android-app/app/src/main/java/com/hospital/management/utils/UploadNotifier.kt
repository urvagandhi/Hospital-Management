package com.hospital.management.utils

import android.Manifest
import android.app.Notification
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.hospital.management.HospitalApplication
import com.hospital.management.R
import com.hospital.management.worker.UploadProgress
import com.hospital.management.worker.UploadStage
import com.hospital.management.worker.formatUploadSubtext
import java.util.UUID

/**
 * Builds and posts upload-stage notifications in the same style as
 * [DownloadNotifier]. Used by both the online direct upload path
 * ([com.hospital.management.worker.UploadWorker]) and the offline-queue
 * background sync ([com.hospital.management.worker.SyncDocumentsWorker]).
 *
 * ### Why two notification ids per worker
 * WorkManager calls `stopForeground(STOP_FOREGROUND_REMOVE)` when the worker
 * exits, which wipes any notification still posted under the foreground id.
 * Terminal-state notifications (COMPLETED / FAILED) MUST therefore be posted
 * under [completionNotificationIdFor] — a distinct id derived from the same
 * work UUID — so they survive the foreground teardown.
 *
 * ### Throttling
 * The byte-stream stage fires progress very frequently. Callers must build a
 * [ProgressThrottle] once per upload and ask it before rebuilding an UPLOADING
 * notification — it enforces a minimum interval (500 ms by default) but always
 * lets stage transitions, terminal stages, and the final 100 % tick through.
 */
object UploadNotifier {

    private const val TAG = "UploadNotifier"

    const val ACTION_CANCEL = "com.hospital.management.upload.action.CANCEL"

    const val EXTRA_WORK_ID = "work_id"
    const val EXTRA_NOTIFICATION_ID = "notif_id"

    // ────────────────────────────────────────────────────────────────────────
    // Public API — notification IDs + builders
    // ────────────────────────────────────────────────────────────────────────

    /**
     * Foreground-progress notification id, derived from the WorkRequest UUID so
     * concurrent uploads (one online + one sync) never collide and the same
     * Worker always updates the same notification across stage swaps.
     */
    fun notificationIdFor(workId: UUID): Int =
        (workId.mostSignificantBits xor workId.leastSignificantBits)
            .toInt()
            .let { if (it == 0) 1 else it and 0x7FFFFFFF }

    /**
     * Distinct notification id for terminal-state notifications (COMPLETED /
     * FAILED). MUST NOT collide with [notificationIdFor] for the same UUID —
     * WorkManager calls `stopForeground(STOP_FOREGROUND_REMOVE)` on doWork()
     * return and would wipe any notification still under the foreground id.
     *
     * The sentinel constant is xor'd in to guarantee the two ids differ even
     * for the rare UUID that hashes to 0 / 1.
     */
    fun completionNotificationIdFor(workId: UUID): Int {
        val base = notificationIdFor(workId)
        // 0x4F is arbitrary but consistent — pick anything that flips a bit
        // outside the 0x7FFFFFFF mask used by notificationIdFor.
        val flipped = (base xor 0x4F4F4F4F) and 0x7FFFFFFF
        return if (flipped == base || flipped == 0) base + 1 else flipped
    }

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
        fileName: String
    ): Notification {
        val title = if (fileName.isBlank()) {
            context.getString(R.string.upload_preparing_title)
        } else {
            fileName
        }

        return baseBuilder(context)
            .setContentTitle(title)
            .setContentText(context.getString(R.string.upload_preparing_subtext))
            .setSubText(context.getString(R.string.upload_stage_preparing))
            .setProgress(0, 0, true) // indeterminate
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(false)
            .addAction(cancelAction(context, notificationId, workId))
            .build()
    }

    fun buildUploading(
        context: Context,
        notificationId: Int,
        workId: UUID,
        progress: UploadProgress
    ): Notification {
        val percent = progress.percent
        val indeterminate = percent < 0
        val titleSource = if (progress.fileName.isBlank()) {
            context.getString(R.string.upload_sync_title)
        } else {
            progress.fileName
        }
        val builder = baseBuilder(context)
            .setContentTitle(context.getString(R.string.upload_uploading_title, titleSource))
            .setContentText(context.formatUploadSubtext(progress))
            .setSubText(context.getString(R.string.upload_stage_uploading))
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

    /**
     * Builds a terminal "Upload complete" notification. Tapping it opens the
     * dashboard via the launcher activity ([com.hospital.management.ui.splash.SplashActivity],
     * which routes to the dashboard for a logged-in user). Pass [fileCount] = 1
     * for a single online upload; the multi-file copy fires for sync runs.
     *
     * MUST be posted under [completionNotificationIdFor] — never the foreground
     * id — otherwise WorkManager's `stopForeground(STOP_FOREGROUND_REMOVE)`
     * wipes it on worker exit.
     */
    fun buildCompleted(
        context: Context,
        notificationId: Int,
        fileCount: Int,
        primaryFileName: String? = null
    ): Notification {
        val openAppPI = openAppPendingIntent(context, notificationId)

        val isBatch = fileCount > 1
        val title = if (isBatch) {
            context.getString(R.string.upload_completed_batch_title)
        } else {
            context.getString(R.string.upload_completed_single_title)
        }
        val text = if (isBatch) {
            context.getString(R.string.upload_completed_batch_text, fileCount)
        } else {
            primaryFileName?.takeIf { it.isNotBlank() }
                ?.let { context.getString(R.string.upload_completed_single_text, it) }
                ?: context.getString(R.string.upload_completed_single_text, "")
        }

        return baseBuilder(context)
            .setContentTitle(title)
            .setContentText(text)
            .setContentIntent(openAppPI)
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .build()
    }

    /**
     * [retryable] = true when WorkManager backoff is still in play (Result.retry
     * imminent); false when the worker has returned Result.failure and no more
     * automatic retries will run. Posted under [completionNotificationIdFor]
     * so it survives worker teardown.
     */
    fun buildFailed(
        context: Context,
        notificationId: Int,
        workId: UUID,
        progress: UploadProgress,
        retryable: Boolean
    ): Notification {
        val builder = baseBuilder(context)
            .setContentTitle(context.getString(R.string.upload_failed_title))
            .setOngoing(false)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)

        if (retryable) {
            val secs = progress.retryInSeconds.coerceAtLeast(0)
            builder.setContentText(context.getString(R.string.upload_retrying_text, secs))
                .setSubText(progress.fileName)
                .setProgress(0, 0, true)
                .addAction(cancelAction(context, notificationId, workId))
        } else {
            builder.setContentText(context.getString(R.string.upload_failed_text))
                .setSubText(progress.fileName)
                .setContentIntent(openAppPendingIntent(context, notificationId))
        }
        return builder.build()
    }

    // ────────────────────────────────────────────────────────────────────────
    // Internals
    // ────────────────────────────────────────────────────────────────────────

    private fun baseBuilder(context: Context): NotificationCompat.Builder =
        NotificationCompat.Builder(context, HospitalApplication.CHANNEL_UPLOADS)
            .setSmallIcon(R.drawable.ic_upload)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setShowWhen(false)
            .setLocalOnly(true)

    /**
     * Cancel button — fires an [UploadActionReceiver] broadcast that cancels
     * the WorkRequest by id and dismisses the notification.
     */
    fun cancelAction(
        context: Context,
        notificationId: Int,
        workId: UUID
    ): NotificationCompat.Action {
        val intent = Intent(context, UploadActionReceiver::class.java).apply {
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

    /**
     * Opens the launcher activity (Splash → Dashboard for a logged-in user).
     * Reflection is intentional — keeps this util free of an Activity
     * compile-time dependency so it can be safely referenced from workers
     * that link against a more constrained classpath.
     */
    private fun openAppPendingIntent(context: Context, requestCode: Int): PendingIntent {
        val launchIntent = context.packageManager
            .getLaunchIntentForPackage(context.packageName)
            ?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP
            }
            ?: Intent() // fallback no-op

        return PendingIntent.getActivity(
            context,
            requestCode,
            launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
    }

    /**
     * Enforces a minimum interval between UPLOADING progress notifications.
     * Stage transitions, terminal stages, and the final 100 % tick always emit.
     */
    class ProgressThrottle(private val minIntervalMs: Long = 500L) {
        private var lastEmittedAtMs: Long = 0L
        private var lastStage: UploadStage? = null
        private var lastPercentTick: Int = -1
        private var lastFileIndex: Int = -1

        @Synchronized
        fun shouldEmit(progress: UploadProgress): Boolean {
            val now = System.currentTimeMillis()
            val stageChanged = progress.stage != lastStage
            val fileChanged = progress.currentFileIndex != lastFileIndex
            val isTerminal = progress.stage == UploadStage.COMPLETED ||
                progress.stage == UploadStage.FAILED ||
                progress.stage == UploadStage.RETRYING
            val hitHundred = progress.percent == 100 && lastPercentTick != 100

            val due = now - lastEmittedAtMs >= minIntervalMs
            val emit = stageChanged || fileChanged || isTerminal || hitHundred || due
            if (emit) {
                lastEmittedAtMs = now
                lastStage = progress.stage
                lastFileIndex = progress.currentFileIndex
                if (progress.percent >= 0) lastPercentTick = progress.percent
            }
            return emit
        }

        @Synchronized
        fun reset() {
            lastEmittedAtMs = 0L
            lastStage = null
            lastPercentTick = -1
            lastFileIndex = -1
        }
    }
}
