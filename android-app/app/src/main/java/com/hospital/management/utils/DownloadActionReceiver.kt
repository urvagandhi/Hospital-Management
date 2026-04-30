package com.hospital.management.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.hospital.management.utils.FileLogger
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.hospital.management.worker.DownloadWorker
import java.util.UUID

/**
 * Handles Cancel / Retry actions fired from the download notifications built by
 * [DownloadNotifier]. Kept intentionally small — no business logic here, it just
 * routes to WorkManager and dismisses the notification.
 */
class DownloadActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val notificationId = intent.getIntExtra(DownloadNotifier.EXTRA_NOTIFICATION_ID, -1)
        when (intent.action) {
            DownloadNotifier.ACTION_CANCEL -> handleCancel(context, intent, notificationId)
            DownloadNotifier.ACTION_RETRY  -> handleRetry(context, intent, notificationId)
            else -> FileLogger.w(TAG, "Unknown action: ${intent.action}")
        }
    }

    private fun handleCancel(context: Context, intent: Intent, notificationId: Int) {
        val workIdStr = intent.getStringExtra(DownloadNotifier.EXTRA_WORK_ID) ?: return
        val workId = runCatching { UUID.fromString(workIdStr) }.getOrNull() ?: return

        FileLogger.i(TAG, "cancel requested work=$workId notif=$notificationId")
        WorkManager.getInstance(context.applicationContext).cancelWorkById(workId)
        if (notificationId != -1) DownloadNotifier.cancel(context, notificationId)
    }

    private fun handleRetry(context: Context, intent: Intent, notificationId: Int) {
        val bytes = intent.getByteArrayExtra(DownloadNotifier.EXTRA_RETRY_INPUT) ?: run {
            FileLogger.w(TAG, "retry missing input data")
            return
        }
        val inputData = runCatching { Data.fromByteArray(bytes) }.getOrNull() ?: run {
            FileLogger.w(TAG, "retry failed to deserialize input data")
            return
        }

        if (notificationId != -1) DownloadNotifier.cancel(context, notificationId)

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(inputData)
            .setConstraints(constraints)
            .addTag(DownloadWorker.TAG_DOWNLOAD)
            .build()

        val url = inputData.getString(DownloadWorker.KEY_DOWNLOAD_URL) ?: ""
        val workName = "download_${url.hashCode()}"
        FileLogger.i(TAG, "retry enqueued work=${request.id} name=$workName")

        WorkManager.getInstance(context.applicationContext)
            .enqueueUniqueWork(workName, ExistingWorkPolicy.REPLACE, request)
    }

    companion object {
        private const val TAG = "DownloadActionRecv"
    }
}
