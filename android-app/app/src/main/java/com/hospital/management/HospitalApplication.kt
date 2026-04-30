package com.hospital.management

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.widget.Toast
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import com.hospital.management.data.api.AuthInterceptor
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.utils.NetworkMonitor
import com.hospital.management.utils.FileLogger
import com.hospital.management.utils.SecurityUtils
import com.hospital.management.utils.SessionManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.worker.SyncDocumentsWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class HospitalApplication : Application() {

    private var activityReferences = 0
    private var isActivityChangingConfigurations = false
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var heartbeatJob: Job? = null

    override fun onCreate() {
        super.onCreate()

        // Create notification channels (Android 8+)
        createNotificationChannels()

        // Initialize file-based logging
        FileLogger.init(this)

        // Install global crash handler so crashes are logged to file
        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
            FileLogger.e("CRASH", "Uncaught exception on thread ${thread.name}", throwable)
            defaultHandler?.uncaughtException(thread, throwable)
        }

        // Root Detection
        if (SecurityUtils.isDeviceRooted()) {
            Toast.makeText(this, "Warning: Device appears to be rooted. App security may be compromised.", Toast.LENGTH_LONG).show()
        }

        // Initialize NetworkMonitor singleton (online/offline indicator)
        NetworkMonitor.init(this, BuildConfig.BASE_URL)

        // Register network connectivity listener for auto-sync
        registerNetworkCallback()

        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

            override fun onActivityStarted(activity: Activity) {
                if (++activityReferences == 1 && !isActivityChangingConfigurations) {
                    // App enters foreground - check for pending uploads and start heartbeat
                    scheduleSyncIfNeeded()
                    startSessionHeartbeat()
                }
            }

            override fun onActivityResumed(activity: Activity) {
                // Check for session timeout
                // We only force logout if the session was explicitly marked active (user logged in)
                // and the time has expired.
                val isAuthScreen = (activity as? BaseActivity)?.isAuthScreen == true
                if (SessionManager.isSessionActive && !isAuthScreen) {
                    applicationScope.launch {
                        if (!SessionManager.isSessionValid(activity)) {
                            Toast.makeText(activity, "Session expired due to inactivity", Toast.LENGTH_LONG).show()
                            SessionManager.logoutUser(activity)
                        }
                    }
                }
            }

            override fun onActivityPaused(activity: Activity) {
                // Update interaction time when app pauses (going background or rotation)
                // This implements "Background Timeout" logic.
                if (SessionManager.isSessionActive) {
                    SessionManager.updateLastInteractionTime(activity)
                }
            }

            override fun onActivityStopped(activity: Activity) {
                isActivityChangingConfigurations = activity.isChangingConfigurations
                if (--activityReferences == 0 && !isActivityChangingConfigurations) {
                    // App enters background — stop heartbeat to save battery
                    stopSessionHeartbeat()
                }
            }

            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

            override fun onActivityDestroyed(activity: Activity) {}
        })
    }

    private fun registerNetworkCallback() {
        val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        networkCallback = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                super.onAvailable(network)
                // Network became available - trigger sync for pending documents
                scheduleSyncIfNeeded()
            }

            override fun onCapabilitiesChanged(network: Network, capabilities: NetworkCapabilities) {
                super.onCapabilitiesChanged(network, capabilities)
                // Check if we have internet capability
                if (capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) {
                    scheduleSyncIfNeeded()
                }
            }
        }

        val networkRequest = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .addTransportType(NetworkCapabilities.TRANSPORT_WIFI)
            .addTransportType(NetworkCapabilities.TRANSPORT_CELLULAR)
            .build()

        try {
            connectivityManager.registerNetworkCallback(networkRequest, networkCallback!!)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /**
     * Start a periodic heartbeat that validates the session with the server.
     * Catches SESSION_CONFLICT even when no user-initiated API calls are happening.
     * Runs every 60s while the app is in the foreground.
     */
    private fun startSessionHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = applicationScope.launch(Dispatchers.IO) {
            while (true) {
                delay(HEARTBEAT_INTERVAL_MS)
                if (!SessionManager.isSessionActive) continue
                try {
                    val tokenManager = TokenManager(this@HospitalApplication)
                    val hasToken = tokenManager.hasValidToken()
                    if (!hasToken) continue

                    val apiService = RetrofitClient.getApiService(this@HospitalApplication)
                    val response = apiService.validateSession()

                    if (!response.isSuccessful) {
                        // Session revoked on server — broadcast so BaseActivity picks it up
                        val body = response.errorBody()?.string() ?: ""
                        FileLogger.w(TAG, "Session heartbeat: server rejected session (${response.code()}): $body")
                        val intent = Intent(AuthInterceptor.ACTION_SESSION_REVOKED)
                        val reason = if (body.contains("SESSION_CONFLICT") || body.contains("another device", ignoreCase = true)) {
                            "SESSION_CONFLICT"
                        } else {
                            "SESSION_EXPIRED"
                        }
                        intent.putExtra(AuthInterceptor.EXTRA_SESSION_REASON, reason)
                        intent.setPackage(packageName)
                        sendBroadcast(intent)
                        break // Stop heartbeat after revocation
                    }
                } catch (e: Exception) {
                    // Network error — skip this cycle, try again next interval
                    FileLogger.w(TAG, "Session heartbeat failed (network?): ${e.message}")
                }
            }
        }
    }

    private fun stopSessionHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = null
    }

    private fun scheduleSyncIfNeeded() {
        applicationScope.launch(Dispatchers.IO) {
            try {
                val database = AppDatabase.getDatabase(this@HospitalApplication)
                val pendingCount = database.documentDao().getPendingCount()

                if (pendingCount > 0) {
                    // Schedule sync worker with network constraint
                    val constraints = Constraints.Builder()
                        .setRequiredNetworkType(NetworkType.CONNECTED)
                        .build()

                    val syncRequest = OneTimeWorkRequestBuilder<SyncDocumentsWorker>()
                        .setConstraints(constraints)
                        .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
                        .build()

                    WorkManager.getInstance(this@HospitalApplication)
                        .enqueueUniqueWork(
                            "auto_sync_documents",
                            ExistingWorkPolicy.KEEP, // Don't duplicate if already running
                            syncRequest
                        )
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    private fun createNotificationChannels() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val manager = getSystemService(android.app.NotificationManager::class.java)
            val downloads = android.app.NotificationChannel(
                CHANNEL_DOWNLOADS,
                "Downloads",
                android.app.NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "File download progress and completion"
            }
            manager.createNotificationChannel(downloads)

            val uploads = android.app.NotificationChannel(
                CHANNEL_UPLOADS,
                getString(R.string.upload_channel_name),
                android.app.NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = getString(R.string.upload_channel_desc)
            }
            manager.createNotificationChannel(uploads)
        }
    }

    companion object {
        private const val HEARTBEAT_INTERVAL_MS = 60_000L // 60 seconds
        private const val TAG = "HospitalApplication"
        const val CHANNEL_DOWNLOADS = "downloads"
        const val CHANNEL_UPLOADS = "uploads"
    }

    // Note: onTerminate() is never called on real Android devices,
    // only in emulators. Network callback cleanup is unnecessary here.
}
