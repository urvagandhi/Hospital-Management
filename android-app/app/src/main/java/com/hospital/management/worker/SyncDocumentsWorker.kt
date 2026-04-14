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
                val pendingDocs = repository.getPendingDocuments()
                if (pendingDocs.isEmpty()) {
                    Log.d(TAG, "No pending documents to sync")
                    return@withContext Result.success()
                }

                Log.d(TAG, "Starting sync for ${pendingDocs.size} pending documents")
                var successCount = 0
                
                for (doc in pendingDocs) {
                    // Skip permanently failed documents (exceeded max retries)
                    if (doc.retryCount >= MAX_RETRY_COUNT) {
                        Log.w(TAG, "Skipping document that exceeded max retries: ${doc.fileUri}")
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
                           val result = repository.uploadDocument(doc.patientId, doc.folderName, file, key)
                           if (result.isSuccess) {
                               Log.d(TAG, "Successfully uploaded document")

                               // Delete from database
                               repository.deleteDocument(doc)

                               // Delete local file to free up storage
                               deleteLocalFile(uri)

                               successCount++
                           } else {
                               Log.e(TAG, "Upload failed for document")
                               val updatedDoc = doc.copy(
                                   status = SyncStatus.FAILED,
                                   retryCount = doc.retryCount + 1,
                                   errorMessage = "Upload returned error"
                               )
                               documentDao.update(updatedDoc)
                           }
                        } else {
                            // File not found locally, remove the database entry
                            Log.w(TAG, "File not found locally, removing entry")
                            repository.deleteDocument(doc)
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
                
                if (successCount == pendingDocs.size) {
                    Result.success()
                } else if (successCount > 0) {
                    // Some succeeded, some failed - retry later
                    Result.retry()
                } else {
                    Result.failure()
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
