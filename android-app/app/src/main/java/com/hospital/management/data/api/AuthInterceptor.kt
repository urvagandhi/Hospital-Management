package com.hospital.management.data.api

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import okhttp3.Interceptor
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.util.concurrent.TimeUnit

/**
 * Injects auth headers and transparently refreshes the access token when it
 * expires mid-request.
 *
 * Flow:
 *  1. Attach Authorization + X-Client-Type + X-Hospital-Id headers.
 *  2. Proceed with the request.
 *  3. If the server returns 401 AND the reason is SESSION_CONFLICT, broadcast
 *     ACTION_SESSION_REVOKED so UI can force-logout. (No refresh — the server
 *     session is dead, refreshing won't help.)
 *  4. For any OTHER 401 (expired access token), POST /api/auth/refresh-token
 *     once (guarded by a lock so parallel requests don't all refresh), save
 *     the new tokens, and retry the original request with the new access
 *     token. Only one retry — if that also 401s, let it bubble up.
 */
class AuthInterceptor(private val context: Context) : Interceptor {

    companion object {
        const val ACTION_SESSION_REVOKED = "com.hospital.management.SESSION_REVOKED"
        private const val TAG = "AuthInterceptor"

        // A single monitor shared across all AuthInterceptor instances so
        // concurrent 401s don't stampede the refresh endpoint.
        private val refreshLock = Any()
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

    /** Bare OkHttpClient used for the refresh-token call itself. Intentionally
     *  has no interceptors so it doesn't recurse back into this one. */
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    override fun intercept(chain: Interceptor.Chain): Response {
        val original = chain.request()
        val authed = attachAuthHeaders(original)
        var response = chain.proceed(authed)

        if (response.code != 401) return response

        // Peek body to classify the 401
        val body = try {
            response.peekBody(1024).string()
        } catch (_: Exception) {
            ""
        }

        if (body.contains("SESSION_CONFLICT") || body.contains("signed in on another device")) {
            // Server has revoked this session (another device logged in or
            // admin-revoke). Refreshing won't help — force logout via UI.
            val intent = Intent(ACTION_SESSION_REVOKED)
            intent.setPackage(context.packageName)
            context.sendBroadcast(intent)
            return response
        }

        // Otherwise, assume access token expired → try to refresh once.
        val refreshToken = prefs.getString("refresh_token", null)
        if (refreshToken.isNullOrEmpty()) return response

        val newAccessToken = synchronized(refreshLock) {
            // Double-check: maybe another in-flight 401 already refreshed the
            // token while we were waiting on the lock. If so, use the fresh
            // one instead of hitting the server again.
            val current = prefs.getString("access_token", null)
            val sentBearer = authed.header("Authorization")
            if (!current.isNullOrEmpty() && sentBearer != "Bearer $current") {
                current
            } else {
                performRefresh(refreshToken)
            }
        } ?: return response

        // Close the old 401 body before reissuing
        response.close()

        val retried = original.newBuilder()
            .header("Authorization", "Bearer $newAccessToken")
            .also { b ->
                val hid = prefs.getString("hospital_id", null)
                if (!hid.isNullOrEmpty()) b.header("X-Hospital-Id", hid)
                b.header("X-Client-Type", "Android")
            }
            .build()

        return chain.proceed(retried)
    }

    private fun attachAuthHeaders(request: Request): Request {
        val builder = request.newBuilder()
        try {
            val accessToken = prefs.getString("access_token", null)
            if (!accessToken.isNullOrEmpty()) {
                builder.header("Authorization", "Bearer $accessToken")
            }
            val hospitalId = prefs.getString("hospital_id", null)
            if (!hospitalId.isNullOrEmpty()) {
                builder.header("X-Hospital-Id", hospitalId)
            }
            builder.header("X-Client-Type", "Android")
        } catch (e: Exception) {
            e.printStackTrace()
        }
        return builder.build()
    }

    /**
     * POST /api/auth/refresh-token with the stored refresh token. Returns the
     * new access token on success, null on any failure (network, 4xx, parse).
     * Also persists the new access + refresh tokens in EncryptedSharedPreferences
     * so subsequent requests pick them up.
     */
    private fun performRefresh(refreshToken: String): String? {
        return try {
            val payload = JSONObject().put("refreshToken", refreshToken).toString()
            val request = Request.Builder()
                .url(RetrofitClient.BASE_URL + "/api/auth/refresh-token")
                .post(payload.toRequestBody("application/json".toMediaTypeOrNull()))
                .build()

            refreshClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    Log.w(TAG, "Refresh failed with code ${resp.code}")
                    return null
                }
                val bodyStr = resp.body?.string() ?: return null
                val json = JSONObject(bodyStr)
                if (!json.optBoolean("success", false)) return null
                val data = json.optJSONObject("data") ?: return null
                val newAccess = data.optString("accessToken", "")
                val newRefresh = data.optString("refreshToken", "")
                if (newAccess.isEmpty()) return null

                val editor = prefs.edit().putString("access_token", newAccess)
                if (newRefresh.isNotEmpty()) {
                    editor.putString("refresh_token", newRefresh)
                }
                editor.apply()
                newAccess
            }
        } catch (e: Exception) {
            Log.w(TAG, "Refresh-token call threw: ${e.message}")
            null
        }
    }
}
