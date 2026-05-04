package com.hospital.management.services

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.hospital.management.utils.FileLogger
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
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

        // Fixed notification IDs so same-type alerts replace each other
        private const val NOTIF_ID_SESSION_REVOKED = 2001
        private const val NOTIF_ID_PASSWORD_CHANGED = 2002
        private const val NOTIF_ID_LOGIN_SUMMARY = 2000
        private const val NOTIF_GROUP_LOGINS = "hospital_new_logins"
    }

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        FileLogger.d(TAG, "New FCM token received")

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
                    FileLogger.w(TAG, "Failed to post FCM token: ${response.code()}")
                    savePendingTokenAndEnqueueWorker(token)
                }
            } catch (e: Exception) {
                FileLogger.e(TAG, "Error posting FCM token", e)
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
        FileLogger.d(TAG, "Enqueued FcmTokenWorker for pending token")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        FileLogger.d(TAG, "Message received: ${message.data}")

        val data = message.data

        when (data["type"]) {
            "SESSION_REVOKED" -> {
                showNotification(message)
                handleSessionRevoked()
            }
            else -> showNotification(message)
        }
    }

    private fun handleSessionRevoked() {
        FileLogger.d(TAG, "Session revoke push received; validating current session before logout")

        serviceScope.launch {
            try {
                val tokenManager = TokenManager(applicationContext)
                if (!tokenManager.hasValidToken()) {
                    FileLogger.d(TAG, "No active local token; ignoring session revoke push")
                    return@launch
                }

                // IMPORTANT: SESSION_REVOKED push is account-scoped (not per-session).
                // Validate this device's own session first; AuthInterceptor handles
                // 401 broadcasts only when this session is actually invalid.
                val apiService = RetrofitClient.getApiService(applicationContext)
                val response = apiService.validateSession()
                if (response.isSuccessful) {
                    FileLogger.d(TAG, "Current session is still valid; ignoring revoke push for another device")
                } else {
                    FileLogger.w(TAG, "Current session is invalid after revoke push: code=${response.code()}")
                }
            } catch (e: Exception) {
                FileLogger.w(TAG, "Session validation after revoke push failed: ${e.message}")
            }
        }
    }

    private fun showNotification(message: RemoteMessage) {
        val notificationManager =
            getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Security alerts for your hospital account"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val title = message.notification?.title ?: message.data["title"] ?: "MyMediVault"
        val body = message.notification?.body ?: message.data["body"] ?: ""
        val type = message.data["type"]

        val launcherIntent = packageManager.getLaunchIntentForPackage(packageName)
        val targetIntent = when (type) {
            "NEW_LOGIN", "PASSWORD_CHANGED" ->
                Intent(this, com.hospital.management.ui.profile.SessionsActivity::class.java)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            else -> launcherIntent
        }

        val pendingFlags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        else PendingIntent.FLAG_UPDATE_CURRENT

        val brandColor = ContextCompat.getColor(this, R.color.primary)

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(brandColor)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)

        when (type) {
            "NEW_LOGIN" -> {
                val notifId = System.currentTimeMillis().toInt()
                val contentIntent = PendingIntent.getActivity(
                    this, notifId, targetIntent ?: Intent(), pendingFlags
                )
                notificationManager.notify(
                    notifId,
                    builder.setGroup(NOTIF_GROUP_LOGINS).setContentIntent(contentIntent).build()
                )
                // Group summary so stacked login alerts collapse neatly
                val summaryIntent = PendingIntent.getActivity(
                    this, NOTIF_ID_LOGIN_SUMMARY,
                    Intent(this, com.hospital.management.ui.profile.SessionsActivity::class.java)
                        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
                    pendingFlags
                )
                notificationManager.notify(
                    NOTIF_ID_LOGIN_SUMMARY,
                    NotificationCompat.Builder(this, CHANNEL_ID)
                        .setSmallIcon(R.drawable.ic_notification)
                        .setColor(brandColor)
                        .setContentTitle("New Sign-in Alerts")
                        .setContentText("Multiple new sign-ins detected")
                        .setGroup(NOTIF_GROUP_LOGINS)
                        .setGroupSummary(true)
                        .setAutoCancel(true)
                        .setPriority(NotificationCompat.PRIORITY_HIGH)
                        .setContentIntent(summaryIntent)
                        .build()
                )
            }
            "SESSION_REVOKED" -> {
                val contentIntent = PendingIntent.getActivity(
                    this, NOTIF_ID_SESSION_REVOKED, launcherIntent ?: Intent(), pendingFlags
                )
                notificationManager.notify(
                    NOTIF_ID_SESSION_REVOKED,
                    builder.setContentIntent(contentIntent).build()
                )
            }
            "PASSWORD_CHANGED" -> {
                val contentIntent = PendingIntent.getActivity(
                    this, NOTIF_ID_PASSWORD_CHANGED, targetIntent ?: Intent(), pendingFlags
                )
                notificationManager.notify(
                    NOTIF_ID_PASSWORD_CHANGED,
                    builder.setContentIntent(contentIntent).build()
                )
            }
            else -> {
                val notifId = System.currentTimeMillis().toInt()
                val contentIntent = PendingIntent.getActivity(
                    this, notifId, launcherIntent ?: Intent(), pendingFlags
                )
                notificationManager.notify(
                    notifId,
                    builder.setContentIntent(contentIntent).build()
                )
            }
        }
    }
}
