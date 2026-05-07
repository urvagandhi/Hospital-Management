package com.hospital.management.worker

import android.app.Notification
import android.content.Context
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.utils.FileLogger
import com.hospital.management.utils.PdfUtils
import com.hospital.management.utils.UploadNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Builds the merged scan PDF in the background so submit can return instantly.
 *
 * Runs as a foreground service (Android 12+ requires this for any non-trivial
 * worker), survives the source Activity's `finish()`, and updates the
 * OfflineDocument row when done so the rest of the app can take over:
 *   - On success: status flips BUILDING → PENDING (offline) or UPLOADING
 *     (online), `fileUri` already points at the newly-written file; the
 *     chained UploadWorker (when present) reads the same file URI from its
 *     own input and uploads it.
 *   - On failure: status → FAILED with errorMessage; the row stays in the
 *     queue so the user can retry or "Delete from Queue".
 */
class PdfBuildWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "PdfBuildWorker"

        const val TAG_PDF_BUILD = "hms_pdf_build"

        const val KEY_IDEMPOTENCY_KEY = "idempotency_key"
        const val KEY_FILE_NAME = "file_name"
        const val KEY_FOLDER_NAME = "folder_name"
        const val KEY_OUTPUT_PATH = "output_path"
        const val KEY_IMAGE_URIS = "image_uris"
        const val KEY_SCANNER_PDF_URI = "scanner_pdf_uri"
        const val KEY_PATIENT_ID = "patient_id"
        const val KEY_OWNER_HOSPITAL_ID = "owner_hospital_id"
        /** Whether the chained UploadWorker should fire after a successful build. */
        const val KEY_TARGET_ONLINE = "target_online"
    }

    private val notificationId by lazy { UploadNotifier.notificationIdFor(id) }

    override suspend fun getForegroundInfo(): ForegroundInfo {
        val name = inputData.getString(KEY_FILE_NAME).orEmpty()
        return makeForegroundInfo(
            UploadNotifier.buildPreparing(applicationContext, notificationId, id, name)
        )
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val fileName = inputData.getString(KEY_FILE_NAME).orEmpty()
        val idempotencyKey = inputData.getString(KEY_IDEMPOTENCY_KEY).orEmpty()
        val outputPath = inputData.getString(KEY_OUTPUT_PATH).orEmpty()
        val folderName = inputData.getString(KEY_FOLDER_NAME).orEmpty()
        val imageUris = inputData.getStringArray(KEY_IMAGE_URIS) ?: emptyArray()
        val scannerPdfUriStr = inputData.getString(KEY_SCANNER_PDF_URI).orEmpty()
        val targetOnline = inputData.getBoolean(KEY_TARGET_ONLINE, false)

        if (idempotencyKey.isEmpty() || outputPath.isEmpty() ||
            (imageUris.isEmpty() && scannerPdfUriStr.isEmpty())) {
            FileLogger.e(TAG, "INPUT INVALID — key=$idempotencyKey, out=$outputPath, " +
                    "imgs=${imageUris.size}, scannerPdf=${scannerPdfUriStr.isNotEmpty()}")
            markFailed(idempotencyKey, "Invalid build input")
            return@withContext Result.failure()
        }

        try {
            setForeground(makeForegroundInfo(
                UploadNotifier.buildPreparing(applicationContext, notificationId, id, fileName)
            ))
        } catch (e: Exception) {
            FileLogger.w(TAG, "setForeground failed: ${e.message}", e)
        }

        val outputFile = File(outputPath)
        outputFile.parentFile?.mkdirs()

        val builtFile: File? = try {
            when {
                scannerPdfUriStr.isNotEmpty() -> copyScannerPdf(scannerPdfUriStr, outputFile)
                else -> buildFromImages(imageUris, fileName, folderName, outputFile)
            }
        } catch (e: Exception) {
            FileLogger.e(TAG, "PDF build threw", e)
            null
        }

        if (builtFile == null || !builtFile.exists() || builtFile.length() == 0L) {
            markFailed(idempotencyKey, "PDF build failed")
            UploadNotifier.cancel(applicationContext, notificationId)
            return@withContext Result.failure()
        }

        // Success: flip the row out of BUILDING. UploadWorker (if chained)
        // reads the same fileUri from its own input data and uploads.
        val nextStatus = if (targetOnline) SyncStatus.UPLOADING else SyncStatus.PENDING
        markStatus(idempotencyKey, nextStatus, errorMessage = null)
        UploadNotifier.cancel(applicationContext, notificationId)

        return@withContext Result.success(
            Data.Builder()
                .putString(KEY_IDEMPOTENCY_KEY, idempotencyKey)
                .putString(KEY_OUTPUT_PATH, outputFile.absolutePath)
                .build()
        )
    }

    private fun copyScannerPdf(scannerUriStr: String, outputFile: File): File? {
        val src = File(Uri.parse(scannerUriStr).path ?: return null)
        if (!src.exists()) return null
        src.copyTo(outputFile, overwrite = true)
        return outputFile.takeIf { it.exists() && it.length() > 0 }
    }

    private fun buildFromImages(
        imageUriStrings: Array<String>,
        fileName: String,
        folderName: String,
        outputFile: File
    ): File? {
        val uris = imageUriStrings.map { Uri.parse(it) }
        val result = PdfUtils.createPdfFromImages(
            applicationContext,
            uris,
            fileName,
            folderName
        ) ?: return null
        val built = result.file
        if (built.absolutePath != outputFile.absolutePath) {
            built.copyTo(outputFile, overwrite = true)
            built.delete()
        }
        return outputFile.takeIf { it.exists() && it.length() > 0 }
    }

    private suspend fun markStatus(
        idempotencyKey: String,
        status: SyncStatus,
        errorMessage: String?
    ) {
        if (idempotencyKey.isEmpty()) return
        try {
            val dao = AppDatabase.getDatabase(applicationContext).documentDao()
            val doc = dao.getDocumentByIdempotencyKey(idempotencyKey) ?: return
            dao.update(doc.copy(status = status, errorMessage = errorMessage))
        } catch (e: Exception) {
            FileLogger.e(TAG, "markStatus failed: ${e.message}", e)
        }
    }

    private suspend fun markFailed(idempotencyKey: String, message: String) {
        markStatus(idempotencyKey, SyncStatus.FAILED, errorMessage = message)
    }

    private fun makeForegroundInfo(notification: Notification): ForegroundInfo =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(notificationId, notification)
        }
}
