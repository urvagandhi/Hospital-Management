package com.hospital.management.data.api

import android.content.Context
import android.content.Intent
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val context: Context) : Interceptor {

    companion object {
        const val ACTION_SESSION_REVOKED = "com.hospital.management.SESSION_REVOKED"
    }

    private val prefs by lazy {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        EncryptedSharedPreferences.create(
            context,
            "secure_hospital_prefs",
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()

        try {
            val accessToken = prefs.getString("access_token", null)
            if (!accessToken.isNullOrEmpty()) {
                builder.addHeader("Authorization", "Bearer $accessToken")
            }

            val hospitalId = prefs.getString("hospital_id", null)
            if (!hospitalId.isNullOrEmpty()) {
                builder.addHeader("X-Hospital-Id", hospitalId)
            }

            builder.addHeader("X-Client-Type", "Android")
        } catch (e: Exception) {
            e.printStackTrace()
        }

        val response = chain.proceed(builder.build())

        // Handle SESSION_REVOKED: 401 with reason=SESSION_CONFLICT
        if (response.code == 401) {
            try {
                val body = response.peekBody(1024).string()
                if (body.contains("SESSION_CONFLICT") || body.contains("signed in on another device")) {
                    // Broadcast session revoked event — activities will handle forced logout
                    val intent = Intent(ACTION_SESSION_REVOKED)
                    intent.setPackage(context.packageName)
                    context.sendBroadcast(intent)
                }
            } catch (e: Exception) {
                // Ignore peek errors
            }
        }

        return response
    }
}
