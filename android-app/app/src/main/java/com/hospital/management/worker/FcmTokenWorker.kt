package com.hospital.management.worker

import android.content.Context
import com.hospital.management.utils.FileLogger
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager

class FcmTokenWorker(
    context: Context,
    workerParams: WorkerParameters
) : CoroutineWorker(context, workerParams) {

    companion object {
        private const val TAG = "FcmTokenWorker"
        private const val PENDING_FCM_TOKEN_KEY = "pending_fcm_token"
    }

    override suspend fun doWork(): Result {
        val prefs = applicationContext.getSharedPreferences("fcm_prefs", Context.MODE_PRIVATE)
        val pendingToken = prefs.getString(PENDING_FCM_TOKEN_KEY, null)

        if (pendingToken.isNullOrEmpty()) {
            FileLogger.d(TAG, "No pending FCM token found")
            return Result.success()
        }

        val tokenManager = TokenManager(applicationContext)
        val accessToken = tokenManager.getAccessToken()

        if (accessToken.isNullOrEmpty()) {
            FileLogger.w(TAG, "No auth token available, will retry")
            return Result.retry()
        }

        return try {
            val apiService = RetrofitClient.getApiService(applicationContext)
            val response = apiService.postFcmToken(mapOf("fcmToken" to pendingToken))

            if (response.isSuccessful) {
                prefs.edit().remove(PENDING_FCM_TOKEN_KEY).apply()
                FileLogger.d(TAG, "FCM token posted successfully")
                Result.success()
            } else {
                FileLogger.w(TAG, "Failed to post FCM token: ${response.code()}")
                Result.retry()
            }
        } catch (e: Exception) {
            FileLogger.e(TAG, "Error posting FCM token", e)
            Result.retry()
        }
    }
}
