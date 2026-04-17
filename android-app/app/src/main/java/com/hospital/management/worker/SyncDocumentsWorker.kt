package com.hospital.management.worker

import android.content.Context
import android.net.Uri
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.data.repository.DocumentRepository
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
        private const val MAX_RETRY_COUNT = 5
    }

    override suspend fun doWork(): Result {
        val context = applicationContext
        val database = AppDatabase.getDatabase(context)
        val documentDao = database.documentDao()
        val apiService = RetrofitClient.getApiService(context)
        val repository = DocumentRepository(apiService, documentDao, context)

        return withContext(Dispatchers.IO) {
            try {
                // Reset any docs stuck in UPLOADING (e.g. from a prior crashed worker run)
                // so they're retried rather than silently skipped
                documentDao.resetStuckUploading()

                val pendingDocs = repository.getPendingDocuments()
                if (pendingDocs.isEmpty()) {
                    Log.d(TAG, "No pending documents to sync")
                    return@withContext Result.success()
                }

                Log.d(TAG, "Starting sync for ${pendingDocs.size} pending documents")
                var successCount = 0
                var retryableFailureCount = 0
                var skippedExhaustedCount = 0

                for (doc in pendingDocs) {
                    // Skip permanently failed documents (exceeded max retries)
                    if (doc.retryCount >= MAX_RETRY_COUNT) {
                        Log.w(TAG, "Skipping document that exceeded max retries: ${doc.fileUri}")
                        skippedExhaustedCount++
                        continue
                    }

                    try {
                        repository.updateStatus(doc, SyncStatus.UPLOADING)

                        val uri = Uri.parse(doc.fileUri)
                        val file = getFileFromUri(context, uri)

                        if (file != null && file.exists()) {
                           // Legacy rows (pre-migration) have no key — backfill one so subsequent
                           // retries within this run dedupe against each other via the header.
                           val key = doc.idempotencyKey.ifEmpty { repository.newIdempotencyKey() }
                           if (key != doc.idempotencyKey) {
                               documentDao.update(doc.copy(idempotencyKey = key))
                           }
                           val result = repository.uploadDocument(doc.patientId, doc.folderName, file, key, doc.uploadProfileUsed)
                           if (result.isSuccess) {
                               Log.d(TAG, "Successfully uploaded document")

                               // Delete from database FIRST, then local file.
                               // If we crash between these two lines, the orphaned
                               // local file is harmless; the reverse (file deleted,
                               // DB entry alive) causes the stuck-pending bug.
                               repository.deleteDocument(doc)
                               deleteLocalFile(uri)

                               successCount++
                           } else {
                               Log.e(TAG, "Upload failed for document: ${result.message}")
                               val shouldRetry = result.retryable
                               val updatedDoc = doc.copy(
                                   status = SyncStatus.FAILED,
                                   retryCount = if (shouldRetry) doc.retryCount + 1 else MAX_RETRY_COUNT,
                                   errorMessage = result.message?.take(200) ?: "Upload returned error"
                               )
                               documentDao.update(updatedDoc)
                               if (shouldRetry) retryableFailureCount++
                           }
                        } else {
                            // File not found locally — likely already uploaded by a
                            // previously cancelled worker. Remove the orphaned DB entry.
                            Log.w(TAG, "File not found locally (already synced?), removing orphaned entry: ${doc.fileUri}")
                            repository.deleteDocument(doc)
                            successCount++ // Don't count as failure
                        }
                    } catch (e: Exception) {
                        Log.e(TAG, "Error syncing document", e)
                        val updatedDoc = doc.copy(
                            status = SyncStatus.FAILED,
                            retryCount = doc.retryCount + 1,
                            errorMessage = e.message?.take(200)
                        )
                        documentDao.update(updatedDoc)
                    }
                }

                Log.d(TAG, "Sync completed: $successCount/${pendingDocs.size} successful")

                val actionableCount = pendingDocs.size - skippedExhaustedCount
                if (actionableCount <= 0) {
                    Result.success()
                } else if (successCount == actionableCount) {
                    Result.success()
                } else if (retryableFailureCount > 0) {
                    // Retry when at least one failure is recoverable.
                    Result.retry()
                } else {
                    // Only unretryable failures remain; avoid infinite failing sync loops.
                    Result.success()
                }
            } catch (e: Exception) {
                Log.e(TAG, "Sync worker failed", e)
                Result.failure()
            }
        }
    }

    private fun deleteLocalFile(uri: Uri) {
        try {
            if (uri.scheme == "file") {
                val file = File(uri.path!!)
                if (file.exists()) {
                    val deleted = file.delete()
                    Log.d(TAG, "Local file deleted: $deleted - ${uri.path}")
                }
            }
            // For content:// URIs from app's private storage
            val path = uri.path
            if (path != null && path.contains(applicationContext.filesDir.path)) {
                val file = File(path)
                if (file.exists()) {
                    val deleted = file.delete()
                    Log.d(TAG, "Private file deleted: $deleted - $path")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error deleting local file: ${uri.path}", e)
        }
    }

    private fun getFileFromUri(context: Context, uri: Uri): File? {
        try {
            if (uri.scheme == "file") {
                return File(uri.path!!)
            } else if (uri.scheme == "content") {
                val mimeType = context.contentResolver.getType(uri) ?: "application/pdf"
                val extension = when (mimeType) {
                    "application/pdf" -> "pdf"
                    "image/jpeg", "image/jpg" -> "jpg"
                    "image/png" -> "png"
                    else -> "pdf"
                }
                val fileName = "temp_upload_${System.currentTimeMillis()}.$extension"
                val file = File(context.cacheDir, fileName)

                context.contentResolver.openInputStream(uri)?.use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                }
                return file
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error getting file from URI: $uri", e)
        }
        return null
    }
}
