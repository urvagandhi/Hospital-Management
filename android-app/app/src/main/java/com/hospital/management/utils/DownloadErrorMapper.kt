package com.hospital.management.utils

import com.hospital.management.worker.DownloadWorker
import org.json.JSONObject

object DownloadErrorMapper {
    private fun parseBody(errorBody: String?): JSONObject? {
        val text = errorBody?.trim().orEmpty()
        if (text.isBlank()) return null

        return try {
            JSONObject(text)
        } catch (_: Exception) {
            null
        }
    }

    fun resolveHttpErrorMessage(statusCode: Int, errorBody: String?): String {
        val body = parseBody(errorBody)
        val detail = body?.optString("detail")?.takeIf { it.isNotBlank() }
        val message = body?.optString("message")?.takeIf { it.isNotBlank() }
        val error = body?.optString("error")?.takeIf { it.isNotBlank() }
        val folderName = body?.optString("folder_name")?.takeIf { it.isNotBlank() }
        val minAchievable = body?.optDouble("min_achievable_mb", -1.0) ?: -1.0
        val retryAfter = body?.optInt("retry_after_seconds", -1) ?: -1
        val isRamConstrained = body?.optBoolean("ram_constrained", false) ?: false
        val folderLabel = folderName?.let { "folder \"$it\"" } ?: "this download"

        return when (statusCode) {
            401, 403 -> "Session expired. Please log in again."
            413 -> {
                if (minAchievable > 0) {
                    val floor = "%.2f".format(minAchievable)
                    if (isRamConstrained) {
                        "The server is busy right now and cannot compress the ${folderLabel} below ${floor} MB. Please try again in a moment."
                    } else {
                        "Even at maximum compression, the ${folderLabel} stays at ${floor} MB. Try downloading fewer documents or a higher limit."
                    }
                } else {
                    detail ?: message ?: "The ${folderLabel} cannot be compressed enough for the current limit."
                }
            }
            503 -> {
                if (error == "busy") {
                    if (folderName != null) {
                        "The compression queue is busy while processing folder \"$folderName\". Please retry in a moment."
                    } else {
                        "Compression service is busy. Your request is waiting for a free slot and will continue automatically."
                    }
                } else if (retryAfter > 0) {
                    "Compression service is busy. Please retry in about ${retryAfter} seconds."
                } else {
                    detail ?: message ?: "Compression service is busy. Please try again shortly."
                }
            }
            504 -> detail ?: message ?: "Compression took too long. Please try again or download smaller sections."
            in 500..599 -> detail ?: message ?: "Server error. Try again later."
            else -> detail ?: message ?: "Download failed. Please try again."
        }
    }

    fun resolveWorkerFailureMessage(reason: String, detail: String?): String {
        val cleanDetail = detail?.trim().orEmpty()
        return when (reason) {
            DownloadWorker.ERROR_AUTH_EXPIRED -> "Session expired. Please log in again."
            DownloadWorker.ERROR_STORAGE_FULL -> "Not enough storage space."
            DownloadWorker.ERROR_CANCELLED -> "Download cancelled."
            DownloadWorker.ERROR_BUSY -> cleanDetail.ifBlank {
                "Compression service is busy. Your request is waiting for a free slot and will continue automatically."
            }
            DownloadWorker.ERROR_SERVER -> cleanDetail.ifBlank {
                "Server error. Please try again later."
            }
            DownloadWorker.ERROR_NETWORK -> cleanDetail.ifBlank {
                "Download failed. Please try again."
            }
            else -> cleanDetail.ifBlank {
                "Download failed. Please try again."
            }
        }
    }
}
