package com.hospital.management.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.hospital.management.utils.FileLogger
import androidx.work.WorkManager
import java.util.UUID

/**
 * Handles the Cancel action fired from upload notifications built by
 * [UploadNotifier]. Sibling of [DownloadActionReceiver] — kept intentionally
 * small, no business logic.
 */
class UploadActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val notificationId = intent.getIntExtra(UploadNotifier.EXTRA_NOTIFICATION_ID, -1)
        when (intent.action) {
            UploadNotifier.ACTION_CANCEL -> handleCancel(context, intent, notificationId)
            else -> FileLogger.w(TAG, "Unknown action: ${intent.action}")
        }
    }

    private fun handleCancel(context: Context, intent: Intent, notificationId: Int) {
        val workIdStr = intent.getStringExtra(UploadNotifier.EXTRA_WORK_ID) ?: return
        val workId = runCatching { UUID.fromString(workIdStr) }.getOrNull() ?: return

        FileLogger.i(TAG, "cancel requested work=$workId notif=$notificationId")
        WorkManager.getInstance(context.applicationContext).cancelWorkById(workId)
        if (notificationId != -1) UploadNotifier.cancel(context, notificationId)
    }

    companion object {
        private const val TAG = "UploadActionRecv"
    }
}
