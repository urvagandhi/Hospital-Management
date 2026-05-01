package com.hospital.management.utils

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.utils.FileLogger
import androidx.work.WorkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.io.File
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
        val idempotencyKey = intent.getStringExtra(UploadNotifier.EXTRA_IDEMPOTENCY_KEY)

        FileLogger.i(TAG, "cancel requested work=$workId notif=$notificationId key=$idempotencyKey")
        WorkManager.getInstance(context.applicationContext).cancelWorkById(workId)
        if (notificationId != -1) UploadNotifier.cancel(context, notificationId)

        // Phase 4.6: Paired cleanup — delete row and durable file so no orphan remains
        if (!idempotencyKey.isNullOrEmpty()) {
            CoroutineScope(Dispatchers.IO).launch {
                try {
                    val db = AppDatabase.getDatabase(context.applicationContext)
                    val doc = db.documentDao().getDocumentByIdempotencyKey(idempotencyKey)
                    if (doc != null) {
                        db.documentDao().delete(doc)
                        val localFile = File(Uri.parse(doc.fileUri).path ?: "")
                        if (localFile.exists()) localFile.delete()
                        FileLogger.i(TAG, "Cancelled upload cleanup done: key=$idempotencyKey")
                    }
                } catch (e: Exception) {
                    FileLogger.w(TAG, "Cancel cleanup failed: ${e.message}")
                }
            }
        }
    }

    companion object {
        private const val TAG = "UploadActionRecv"
    }
}
