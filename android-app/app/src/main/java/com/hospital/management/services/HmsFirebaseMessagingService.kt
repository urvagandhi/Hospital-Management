package com.hospital.management.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import androidx.work.Constraints
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.worker.FcmTokenWorker
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class HmsFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "HmsFirebaseMsgService"
        private const val CHANNEL_ID = "hospital_notifications"
        private const val CHANNEL_NAME = "Hospital Notifications"
        private const val PENDING_FCM_TOKEN_KEY = "pending_fcm_token"
        const val ACTION_SESSION_REVOKED = "ACTION_SESSION_REVOKED"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token received")

        serviceScope.launch {
            try {
                val tokenManager = TokenManager(applicationContext)
                val accessToken = tokenManager.getAccessToken()

                if (accessToken.isNullOrEmpty()) {
                    savePendingTokenAndEnqueueWorker(token)
                    return@launch
                }

                val apiService = RetrofitClient.getApiService(applicationContext)
                val response = apiService.postFcmToken(mapOf("fcmToken" to token))

                if (!response.isSuccessful) {
                    Log.w(TAG, "Failed to post FCM token: ${response.code()}")
                    savePendingTokenAndEnqueueWorker(token)
                }
            } catch (e: Exception) {
                Log.e(TAG, "Error posting FCM token", e)
                savePendingTokenAndEnqueueWorker(token)
            }
        }
    }

    private fun savePendingTokenAndEnqueueWorker(token: String) {
        val prefs = applicationContext.getSharedPreferences("fcm_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString(PENDING_FCM_TOKEN_KEY, token).apply()

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val workRequest = OneTimeWorkRequestBuilder<FcmTokenWorker>()
            .setConstraints(constraints)
            .build()

        WorkManager.getInstance(applicationContext).enqueue(workRequest)
        Log.d(TAG, "Enqueued FcmTokenWorker for pending token")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "Message received: ${message.data}")

        val data = message.data

        when (data["type"]) {
            "SESSION_REVOKED" -> handleSessionRevoked()
            else -> showNotification(message)
        }
    }

    private fun handleSessionRevoked() {
        Log.d(TAG, "Session revoked by server")

        serviceScope.launch {
            val tokenManager = TokenManager(applicationContext)
            tokenManager.clearAll()
        }

        val intent = Intent(ACTION_SESSION_REVOKED)
        LocalBroadcastManager.getInstance(applicationContext).sendBroadcast(intent)
    }

    private fun showNotification(message: RemoteMessage) {
        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val title = message.notification?.title ?: message.data["title"] ?: "Hospital Management"
        val body = message.notification?.body ?: message.data["body"] ?: ""

        val notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
