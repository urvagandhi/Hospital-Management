package com.hospital.management.utils

import android.content.Context
import android.content.Intent
import androidx.work.WorkManager
import com.hospital.management.HospitalApplication
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.worker.DownloadWorker
import com.hospital.management.worker.OfflineLogoutWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import com.hospital.management.utils.FileLogger

object SessionManager {
    // Align client-side inactivity timeout with the server's 7-day session TTL.
    // The previous 15-minute value aggressively logged users out any time they
    // backgrounded the app for more than 15 minutes, even though the server
    // session was still valid. Auto-refresh-on-401 in AuthInterceptor covers
    // access-token expiry transparently, so we only force logout when the
    // server-side session actually ends.
    private const val SESSION_TIMEOUT_MS = 7L * 24 * 60 * 60 * 1000 // 7 days

    @Volatile
    private var _isSessionActive = false

    // Cached TokenManager per-context to avoid repeated crypto init
    @Volatile
    private var cachedTokenManager: TokenManager? = null

    val isSessionActive: Boolean
        get() = _isSessionActive

    private fun getTokenManager(context: Context): TokenManager {
        return cachedTokenManager ?: TokenManager(context.applicationContext).also {
            cachedTokenManager = it
        }
    }

    /**
     * Start a new session and persist the timestamp
     */
    suspend fun startSession(context: Context) {
        _isSessionActive = true
        kotlinx.coroutines.withContext(Dispatchers.IO) {
            getTokenManager(context).saveSessionTimestamp(System.currentTimeMillis())
        }
    }

    /**
     * Update the last interaction time (for session timeout tracking)
     */
    fun updateLastInteractionTime(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            getTokenManager(context).saveSessionTimestamp(System.currentTimeMillis())
        }
    }

    /**
     * Check if session is valid based on persisted timestamp
     */
    suspend fun isSessionValid(context: Context): Boolean {
        val tokenManager = getTokenManager(context)
        val accessToken = tokenManager.getAccessToken()

        if (accessToken.isNullOrEmpty()) {
            _isSessionActive = false
            return false
        }

        val lastTimestamp = tokenManager.getSessionTimestamp()
        if (lastTimestamp == 0L) {
            _isSessionActive = false
            return false
        }

        val currentTime = System.currentTimeMillis()
        val isValid = (currentTime - lastTimestamp) < SESSION_TIMEOUT_MS
        _isSessionActive = isValid

        return isValid
    }

    /**
     * Restore session from persisted state (call on app startup)
     */
    suspend fun restoreSession(context: Context): Boolean {
        return isSessionValid(context)
    }

    /**
     * Logout user and clear all session data.
     * Suspends until tokens are fully cleared before navigating.
     *
     * Best-effort calls the backend `/api/auth/logout` so the server hard-
     * deletes the session record (otherwise it lingers as a "ghost" that
     * counts toward the 2-mobile-session limit). Notification failures and
     * 401s never block local cleanup — the user must always end up signed
     * out locally even if the network is down.
     */
    /**
     * Logout user and clear all session data.
     *
     * Sequence (this order matters):
     *   1. Snapshot the refresh token + hospitalId BEFORE clearing locals.
     *   2. Cancel any in-flight upload-sync worker so it can't race the
     *      pending-doc deletion below.
     *   3. Cancel + delete every pending upload owned by this hospital so
     *      patient documents are not silently uploaded to a different
     *      account if a new user logs in next (healthcare-compliance).
     *   4. Try the direct backend logout call (NonCancellable so it survives
     *      activity teardown).
     *   5. If the direct call succeeded, we're done. If it failed (offline,
     *      5xx, exception), enqueue an OfflineLogoutWorker carrying the
     *      refresh-token snapshot — it retries with backoff until the
     *      backend acknowledges, then the server-side session row is
     *      hard-deleted, FCM token cleaned up, and the logout email sent.
     *   6. Clear local tokens and navigate to login.
     */
    suspend fun logoutUser(context: Context) {
        _isSessionActive = false
        val appCtx = context.applicationContext

        kotlinx.coroutines.withContext(Dispatchers.IO + kotlinx.coroutines.NonCancellable) {
            val tm = getTokenManager(context)

            // 1. Snapshot — must happen BEFORE clearAll().
            val refreshTokenSnapshot = tm.getRefreshToken()
            val hadValidToken = tm.hasValidToken()

            // 2. Stop the upload-sync worker so it can't race the cancellation below.
            try {
                WorkManager.getInstance(appCtx).cancelUniqueWork("auto_sync_documents")
            } catch (_: Throwable) { /* WorkManager unavailable is fine */ }

            // 2a. Cancel any in-flight download workers. The auth token they
            //     captured at enqueue time is about to be revoked, and a
            //     download continuing after logout would drop patient PDFs
            //     onto a device where a different hospital may log in next —
            //     same healthcare-compliance rationale as the upload cleanup
            //     below. Also dismiss any ongoing/failed download
            //     notifications so they don't linger post-logout.
            try {
                WorkManager.getInstance(appCtx).cancelAllWorkByTag(DownloadWorker.TAG_DOWNLOAD)
            } catch (_: Throwable) { /* WorkManager unavailable is fine */ }
            try {
                // Same rationale for in-flight UploadWorkers — drop any
                // foreground upload running under the logging-out account.
                WorkManager.getInstance(appCtx).cancelAllWorkByTag(
                    com.hospital.management.worker.UploadWorker.TAG_UPLOAD
                )
            } catch (_: Throwable) { /* WorkManager unavailable is fine */ }
            try {
                // PdfBuildWorker is part of the same submit chain — cancel it
                // too so a half-built PDF doesn't continue to assemble after
                // the owning account has logged out.
                WorkManager.getInstance(appCtx).cancelAllWorkByTag(
                    com.hospital.management.worker.PdfBuildWorker.TAG_PDF_BUILD
                )
            } catch (_: Throwable) { /* WorkManager unavailable is fine */ }
            try {
                val nm = appCtx.getSystemService(Context.NOTIFICATION_SERVICE)
                    as? android.app.NotificationManager
                nm?.activeNotifications?.forEach { sbn ->
                    val channelId = sbn.notification?.channelId
                    if (channelId == HospitalApplication.CHANNEL_DOWNLOADS ||
                        channelId == HospitalApplication.CHANNEL_UPLOADS) {
                        nm.cancel(sbn.id)
                    }
                }
            } catch (_: Throwable) { /* permission / API gaps — best-effort */ }

            // 3. Keep pending uploads (Phase 4.3). We no longer delete them
            //    on logout so they remain available for the same hospital
            //    after relogin. Owner-scoping ensures other hospitals
            //    won't see them.
            /*
            if (hospitalIdSnapshot.isNotEmpty()) {
                try {
                    val dao = AppDatabase.getDatabase(appCtx).documentDao()
                    val cancelled = dao.deleteAllForHospital(hospitalIdSnapshot)
                    if (cancelled > 0) {
                        FileLogger.w("SessionManager", "Logout cancelled $cancelled pending upload(s) for hospital $hospitalIdSnapshot")
                    }
                } catch (e: Throwable) {
                    FileLogger.w("SessionManager", "Failed to clear pending uploads on logout: ${e.message}")
                }
            }
            */

            // 4. Direct backend logout (best-effort, survives cancellation).
            var directOk = false
            if (hadValidToken) {
                try {
                    val resp = RetrofitClient.getApiService(appCtx).logout()
                    directOk = resp.isSuccessful
                } catch (_: Throwable) { /* offline / 5xx → fall through to worker */ }
            }

            // 5. If direct call didn't land, queue the retrying worker so the
            //    server-side session is cleaned up when network returns.
            if (!directOk && !refreshTokenSnapshot.isNullOrEmpty()) {
                OfflineLogoutWorker.enqueue(appCtx, refreshTokenSnapshot)
            }

            // 6. Clear local state.
            tm.clearAll()

            // 7. Rotate log file so the next user cannot read this session's log entries.
            FileLogger.rotate()
        }

        // Reset Retrofit client (clear cookies + cached instance).
        RetrofitClient.reset()
        cachedTokenManager = null

        val intent = Intent(context, LoginActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        context.startActivity(intent)
    }
}
