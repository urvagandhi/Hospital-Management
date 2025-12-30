package com.hospital.management.utils

import android.content.Context
import android.content.Intent
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

object SessionManager {
    private const val SESSION_TIMEOUT_MS = 15 * 60 * 1000L // 15 minutes
    private var lastInteractionTime: Long = 0
    var isSessionActive = false

    fun startSession() {
        lastInteractionTime = System.currentTimeMillis()
        isSessionActive = true
    }

    fun updateLastInteractionTime() {
        lastInteractionTime = System.currentTimeMillis()
    }

    fun isSessionValid(): Boolean {
        if (!isSessionActive) return false
        val currentTime = System.currentTimeMillis()
        return (currentTime - lastInteractionTime) < SESSION_TIMEOUT_MS
    }

    fun logoutUser(context: Context) {
        isSessionActive = false
        val tokenManager = TokenManager(context)
        CoroutineScope(Dispatchers.IO).launch {
            tokenManager.clearAll()

            val intent = Intent(context, LoginActivity::class.java)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK)
            context.startActivity(intent)
        }
    }
}
