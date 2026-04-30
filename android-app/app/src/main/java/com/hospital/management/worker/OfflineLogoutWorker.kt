package com.hospital.management.worker

import android.content.Context
import com.hospital.management.utils.FileLogger
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.hospital.management.data.api.RetrofitClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Tells the backend that this device's session was logged out, even when the
 * user tapped Logout while offline.
 *
 * Why a dedicated worker:
 *   The user's Logout tap clears local tokens immediately so the UX feels
 *   instant. But if we don't tell the backend, the server-side Session row
 *   stays `isActive=true` for 365 days — counting toward the 2-mobile-session
 *   limit, blocking FCM cleanup, and skipping the logout-confirmation email.
 *   This worker carries the refresh token snapshot we captured BEFORE the
 *   local clearAll(), and posts /api/auth/logout once the network is back.
 *
 * Critical correctness properties:
 *   • Uses a bare OkHttpClient (no AuthInterceptor) so it doesn't try to
 *     attach the now-cleared bearer token, and won't trip the 401-refresh
 *     path. The backend logout endpoint reads the refreshToken from the
 *     request body, not from cookies/headers.
 *   • Idempotent: backend returns 200 even if the session row is already
 *     gone, and we treat any 2xx OR 4xx (including 404) as success — the
 *     session is not coming back. Only 5xx and network failures retry.
 *   • Unique work name keyed on the refresh token hash, so duplicate
 *     enqueues collapse instead of stacking.
 */
class OfflineLogoutWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    companion object {
        private const val TAG = "OfflineLogoutWorker"
        const val KEY_REFRESH_TOKEN = "refresh_token"

        /**
         * Enqueue the worker. Safe to call from anywhere; if no token was
         * captured (already cleared, never logged in) this is a no-op.
         */
        fun enqueue(context: Context, refreshToken: String?) {
            if (refreshToken.isNullOrEmpty()) return

            val data = Data.Builder()
                .putString(KEY_REFRESH_TOKEN, refreshToken)
                .build()

            val request = OneTimeWorkRequestBuilder<OfflineLogoutWorker>()
                .setConstraints(
                    Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()
                )
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                .setInputData(data)
                .build()

            // Hash so we never log the raw token, but still get a stable
            // unique-name per session.
            val workName = "offline_logout_${refreshToken.hashCode()}"
            WorkManager.getInstance(context).enqueueUniqueWork(
                workName,
                ExistingWorkPolicy.KEEP, // dupe enqueues collapse
                request,
            )
        }
    }

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val refreshToken = inputData.getString(KEY_REFRESH_TOKEN)
        if (refreshToken.isNullOrEmpty()) {
            FileLogger.w(TAG, "No refresh token in input data — nothing to send")
            return@withContext Result.success()
        }

        try {
            val payload = JSONObject().put("refreshToken", refreshToken).toString()
            val request = Request.Builder()
                .url(RetrofitClient.BASE_URL + "/api/auth/logout")
                .post(payload.toRequestBody("application/json".toMediaTypeOrNull()))
                .build()

            // Bare client — no AuthInterceptor. Avoids attaching stale
            // headers and avoids the 401-refresh stampede.
            client.newCall(request).execute().use { resp ->
                when {
                    resp.isSuccessful -> {
                        FileLogger.i(TAG, "Backend logout acknowledged (${resp.code})")
                        Result.success()
                    }
                    resp.code in 400..499 -> {
                        // 401/403/404: session is gone or token rejected. Either
                        // way the row will not come back — treat as success so
                        // we don't loop forever.
                        FileLogger.w(TAG, "Backend logout returned ${resp.code} — treating as success (session already gone)")
                        Result.success()
                    }
                    else -> {
                        FileLogger.w(TAG, "Backend logout 5xx (${resp.code}) — will retry")
                        Result.retry()
                    }
                }
            }
        } catch (e: Exception) {
            FileLogger.w(TAG, "Backend logout network error: ${e.message} — will retry")
            Result.retry()
        }
    }

    private val client: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
