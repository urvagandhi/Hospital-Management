package com.hospital.management.data.api

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val context: Context) : Interceptor {
    
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
            // Get access token directly from SharedPreferences (not suspend)
            val accessToken = prefs.getString("access_token", null)
            if (!accessToken.isNullOrEmpty()) {
                builder.addHeader("Authorization", "Bearer $accessToken")
            }
            
            // Get hospital ID and add to headers
            val hospitalId = prefs.getString("hospital_id", null)
            if (!hospitalId.isNullOrEmpty()) {
                builder.addHeader("X-Hospital-Id", hospitalId)
            }
            
            builder.addHeader("X-Client-Type", "Android")
        } catch (e: Exception) {
            e.printStackTrace()
        }
        
        return chain.proceed(builder.build())
    }
}
