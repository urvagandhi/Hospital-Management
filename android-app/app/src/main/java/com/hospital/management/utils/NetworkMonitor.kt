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

        // Verify with actual ping if we think we're online
        if (hasInternet) {
            CoroutineScope(Dispatchers.IO).launch {
                val ok = pingHealth()
                if (!ok) _status.value = NetworkStatus.OFFLINE
            }
        }

        // Register callback
        val request = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()

        connectivityManager.registerNetworkCallback(request, object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                // Set ONLINE immediately if connectivity reports available,
                // then verify in background
                _status.value = NetworkStatus.ONLINE
                CoroutineScope(Dispatchers.IO).launch {
                    delay(1000)
                    val ok = pingHealth()
                    if (!ok) _status.value = NetworkStatus.OFFLINE
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

        // Periodic health ping every 30s when online
        healthCheckJob = CoroutineScope(Dispatchers.IO).launch {
            while (isActive) {
                delay(30_000)
                if (_status.value == NetworkStatus.ONLINE) {
                    val ok = pingHealth()
                    if (!ok) _status.value = NetworkStatus.OFFLINE
                }
            }
        }
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
