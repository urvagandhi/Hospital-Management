package com.hospital.management.utils

import android.content.Context
import android.content.Intent
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking

object SessionManager {
    private const val SESSION_TIMEOUT_MS = 15 * 60 * 1000L // 15 minutes

    @Volatile
    private var _isSessionActive = false

    val isSessionActive: Boolean
        get() = _isSessionActive

    /**
     * Start a new session and persist the timestamp
     */
    suspend fun startSession(context: Context) {
        _isSessionActive = true
        kotlinx.coroutines.withContext(Dispatchers.IO) {
            val tokenManager = TokenManager(context)
            tokenManager.saveSessionTimestamp(System.currentTimeMillis())
        }
    }

    /**
     * Update the last interaction time (for session timeout tracking)
     */
    fun updateLastInteractionTime(context: Context) {
        CoroutineScope(Dispatchers.IO).launch {
            val tokenManager = TokenManager(context)
            tokenManager.saveSessionTimestamp(System.currentTimeMillis())
        }
    }

    /**
     * Check if session is valid based on persisted timestamp
     */
    suspend fun isSessionValid(context: Context): Boolean {
        val tokenManager = TokenManager(context)
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
     * Logout user and clear all session data
     */
    fun logoutUser(context: Context) {
        _isSessionActive = false
        CoroutineScope(Dispatchers.IO).launch {
            val tokenManager = TokenManager(context)
            tokenManager.clearAll()
        }

        val intent = Intent(context, LoginActivity::class.java)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
        context.startActivity(intent)
    }
}
