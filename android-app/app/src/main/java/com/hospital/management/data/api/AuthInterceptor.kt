package com.hospital.management.data.api

import android.content.Context
import okhttp3.Interceptor
import okhttp3.Response

class AuthInterceptor(private val context: Context) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val builder = chain.request().newBuilder()
        try {
            val tokenManagerClass = Class.forName("com.hospital.management.data.local.TokenManager")
            val tokenManager = tokenManagerClass.getConstructor(Context::class.java).newInstance(context)
            val getAccessToken = tokenManagerClass.getMethod("getAccessToken")
            val accessToken = getAccessToken.invoke(tokenManager) as? String
            if (!accessToken.isNullOrEmpty()) {
                builder.addHeader("Authorization", "Bearer $accessToken")
            }
        } catch (e: Exception) {
            // Fallback: do nothing
        }
        return chain.proceed(builder.build())
    }
}
