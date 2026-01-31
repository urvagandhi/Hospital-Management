package com.hospital.management

import android.app.Activity
import android.app.Application
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Bundle
import android.widget.Toast
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.utils.SecurityUtils
import com.hospital.management.utils.SessionManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.worker.SyncDocumentsWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HospitalApplication : Application() {

    private var activityReferences = 0
    private var isActivityChangingConfigurations = false
    private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    override fun onCreate() {
        super.onCreate()

        // Root Detection
        if (SecurityUtils.isDeviceRooted()) {
            Toast.makeText(this, "Warning: Device appears to be rooted. App security may be compromised.", Toast.LENGTH_LONG).show()
        }

        // Register network connectivity listener for auto-sync
        registerNetworkCallback()

        registerActivityLifecycleCallbacks(object : ActivityLifecycleCallbacks {
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}

            override fun onActivityStarted(activity: Activity) {
                if (++activityReferences == 1 && !isActivityChangingConfigurations) {
                    // App enters foreground - check for pending uploads
                    scheduleSyncIfNeeded()
                }
            }

            override fun onActivityResumed(activity: Activity) {
                // Check for session timeout
                // We only force logout if the session was explicitly marked active (user logged in)
                // and the time has expired.
                if (SessionManager.isSessionActive && activity !is LoginActivity) {
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
                    // App enters background
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

    override fun onTerminate() {
        super.onTerminate()
        // Unregister network callback
        networkCallback?.let {
            val connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
            try {
                connectivityManager.unregisterNetworkCallback(it)
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
