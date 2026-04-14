package com.hospital.management.utils

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
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

        // Verify with actual ping if we think we're online.
        // Retry a few times before flipping to OFFLINE so a single transient
        // failure (cold TLS handshake, DNS miss) doesn't surface a bogus
        // "You are offline" banner right after login.
        if (hasInternet) {
            CoroutineScope(Dispatchers.IO).launch {
                if (!pingHealthWithRetry()) _status.value = NetworkStatus.OFFLINE
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
                _status.value = NetworkStatus.ONLINE
                CoroutineScope(Dispatchers.IO).launch {
                    delay(1000)
                    if (!pingHealthWithRetry()) _status.value = NetworkStatus.OFFLINE
                }
            }

            override fun onLost(network: Network) {
                // Check if there's still another active network before going offline
                val current = connectivityManager.activeNetwork
                val caps = current?.let { connectivityManager.getNetworkCapabilities(it) }
                val stillConnected = caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) == true
                if (!stillConnected) {
                    _status.value = NetworkStatus.OFFLINE
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

    private suspend fun pingHealthWithRetry(attempts: Int = 3, delayMs: Long = 1500): Boolean {
        repeat(attempts) { i ->
            if (pingHealth()) return true
            if (i < attempts - 1) delay(delayMs)
        }
        return false
    }

    private fun pingHealth(): Boolean {
        return try {
            val url = URL("$baseUrl/api/health")
            val conn = url.openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 5000
            conn.requestMethod = "GET"
            val code = conn.responseCode
            conn.disconnect()
            code == 200
        } catch (e: Exception) {
            false
        }
    }
}
