package com.hospital.management.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import com.hospital.management.utils.FileLogger
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import java.net.HttpURLConnection
import java.net.URL

enum class NetworkStatus {
    ONLINE,
    OFFLINE,
    RECONNECTING
}

/**
 * Singleton NetworkMonitor using ConnectivityManager + NetworkCallback.
 * Exposes a StateFlow<NetworkStatus> that ViewModels can collect.
 * Additionally pings /api/health for accurate detection.
 */
object NetworkMonitor {

    private val _status = MutableStateFlow(NetworkStatus.ONLINE)
    val status: StateFlow<NetworkStatus> = _status.asStateFlow()

    private var initialized = false
    private var healthCheckJob: Job? = null
    private var baseUrl: String = ""

    fun init(context: Context, serverBaseUrl: String) {
        if (initialized) return
        initialized = true
        baseUrl = serverBaseUrl.trimEnd('/')

        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager

        // Check initial state — assume ONLINE if network capability exists,
        // then verify with health ping in background
        val activeNetwork = connectivityManager.activeNetwork
        val capabilities = activeNetwork?.let { connectivityManager.getNetworkCapabilities(it) }
        val hasInternet = capabilities?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
        _status.value = if (hasInternet) NetworkStatus.ONLINE else NetworkStatus.OFFLINE
        FileLogger.i(TAG, "init — system reports hasInternet=$hasInternet → initial status=${_status.value}")

        // Verify with actual ping if we think we're online.
        // On first app launch the backend (Render.com free tier) may be cold-starting
        // and take 30–60 s to respond.  Don't flip to OFFLINE immediately — give it
        // up to 90 s (3 attempts × 20 s timeout + 10 s delays) before declaring offline.
        // This prevents the "You are offline" banner appearing on a perfectly good
        // connection just because the server hadn't warmed up yet.
        if (hasInternet) {
            CoroutineScope(Dispatchers.IO).launch {
                val ok = pingHealthWithRetry()
                if (!ok) {
                    FileLogger.w(TAG, "Startup ping failed after all retries → setting OFFLINE")
                    _status.value = NetworkStatus.OFFLINE
                }
            }
        }

        // Register callback
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                // Set ONLINE immediately if connectivity reports available,
                // then verify in background (with retries)
                FileLogger.i(TAG, "NetworkCallback.onAvailable — verifying with ping")
                _status.value = NetworkStatus.ONLINE
                CoroutineScope(Dispatchers.IO).launch {
                    delay(1000)
                    val ok = pingHealthWithRetry()
                    if (!ok) {
                        FileLogger.w(TAG, "onAvailable ping failed → setting OFFLINE")
                        _status.value = NetworkStatus.OFFLINE
                    }
                }
            }

            override fun onLost(network: Network) {
                // Check if there's still another active network before going offline
                val current = connectivityManager.activeNetwork
                val caps = current?.let { connectivityManager.getNetworkCapabilities(it) }
                val stillConnected = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                if (!stillConnected) {
                    FileLogger.w(TAG, "NetworkCallback.onLost — no remaining network → OFFLINE")
                    _status.value = NetworkStatus.OFFLINE
                } else {
                    FileLogger.i(TAG, "NetworkCallback.onLost — fallback network still active, staying ONLINE")
                }
            }
        })

        // Adaptive health ping: 2s when offline (fast reconnect detection), 30s when online
        healthCheckJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                val interval = if (_status.value == NetworkStatus.OFFLINE) 2_000L else 30_000L
                delay(interval)
                if (_status.value == NetworkStatus.OFFLINE) {
                    _status.value = NetworkStatus.RECONNECTING
                    if (pingHealth()) {
                        _status.value = NetworkStatus.ONLINE
                    } else {
                        _status.value = NetworkStatus.OFFLINE
                    }
                } else {
                    if (!pingHealth()) _status.value = NetworkStatus.OFFLINE
                }
            }
        }
    }

    private suspend fun pingHealthWithRetry(attempts: Int = 3, delayMs: Long = 10_000): Boolean {
        repeat(attempts) { i ->
            FileLogger.d(TAG, "pingHealthWithRetry attempt ${i + 1}/$attempts")
            if (pingHealth()) return true
            if (i < attempts - 1) {
                FileLogger.d(TAG, "pingHealthWithRetry attempt ${i + 1} failed, waiting ${delayMs}ms")
                delay(delayMs)
            }
        }
        return false
    }

    private fun pingHealth(): Boolean {
        val targetUrl = "$baseUrl/api/health"
        val startMs = System.currentTimeMillis()
        return try {
            val url = URL(targetUrl)
            val conn = url.openConnection() as HttpURLConnection
            // 20 s gives the Render.com free-tier server enough time to cold-start
            // (cold starts typically take 30–60 s but TLS handshake completes earlier).
            // The old 5 s was too short and caused false-offline on the very first open.
            conn.connectTimeout = 20_000
            conn.readTimeout = 20_000
            conn.requestMethod = "GET"
            val code = conn.responseCode
            val elapsedMs = System.currentTimeMillis() - startMs
            conn.disconnect()
            val success = code == 200
            FileLogger.i(TAG, "pingHealth → HTTP $code (${elapsedMs}ms) url=$targetUrl → ${if (success) "OK" else "FAIL"}")
            success
        } catch (e: Exception) {
            val elapsedMs = System.currentTimeMillis() - startMs
            // Log the full exception class + message + stack trace so we know exactly
            // WHY the ping failed (SSL error? Connection refused? Timeout? DNS failure?)
            FileLogger.e(TAG, "pingHealth EXCEPTION after ${elapsedMs}ms url=$targetUrl — ${e.javaClass.name}: ${e.message}", e)
            false
        }
    }

    private const val TAG = "NetworkMonitor"
}
