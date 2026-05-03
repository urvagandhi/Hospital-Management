package com.hospital.management.data.api

import android.content.Context
import android.content.Intent
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.hospital.management.utils.FileLogger
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
        const val ACTION_AUTH_CODE_REQUIRED = "com.hospital.management.AUTH_CODE_REQUIRED"
        const val EXTRA_SESSION_REASON = "session_reason"
        private const val TAG = "AuthInterceptor"

        // A single monitor shared across all AuthInterceptor instances so
        // concurrent 401s don't stampede the refresh endpoint.
        private val refreshLock = Any()
    }

    private val prefs by lazy {
        try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                "secure_hospital_prefs",
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            ).also {
                FileLogger.i(TAG, "EncryptedSharedPreferences initialised successfully")
            }
        } catch (e: Exception) {
            // Log the full stack trace — this is a critical init failure that would
            // cause every network request to be sent without auth headers.
            FileLogger.e(TAG, "CRITICAL: EncryptedSharedPreferences init FAILED — requests will have no auth headers. ${e.javaClass.name}: ${e.message}", e)
            throw e
        }
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
        val response = chain.proceed(authed)

        FileLogger.d(TAG, "→ ${original.method} ${original.url} — HTTP ${response.code}")

        if (response.code != 401) return response

        // Peek body to classify the 401
        val body = try {
            response.peekBody(1024).string()
        } catch (_: Exception) {
            ""
        }

        FileLogger.w(TAG, "401 received for ${original.url} — body preview: $body")

        // Prefer the stable `errorCode` JSON field (TD-A07). Fall back to
        // substring matching for one release cycle so a stale APK paired with
        // the updated backend still classifies correctly.
        val errorCode: String = try {
            JSONObject(body).optString("errorCode", "")
        } catch (_: Exception) {
            ""
        }

        // 1. Check for explicit session revocation reasons (Logout required)
        if (errorCode == "SESSION_CONFLICT"
            || body.contains("SESSION_CONFLICT") || body.contains("signed in on another device")) {
            FileLogger.w(TAG, "401 reason: SESSION_CONFLICT — broadcasting revoke")
            val intent = Intent(ACTION_SESSION_REVOKED)
            intent.putExtra(EXTRA_SESSION_REASON, "SESSION_CONFLICT")
            intent.setPackage(context.packageName)
            context.sendBroadcast(intent)
            return response
        }

        if (errorCode == "ACCOUNT_DISABLED"
            || body.contains("ACCOUNT_DISABLED")) {
            FileLogger.w(TAG, "401 reason: ACCOUNT_DISABLED — broadcasting revoke")
            val intent = Intent(ACTION_SESSION_REVOKED)
            intent.putExtra(EXTRA_SESSION_REASON, "ACCOUNT_DISABLED")
            intent.setPackage(context.packageName)
            context.sendBroadcast(intent)
            return response
        }

        // 2. Check for 7-day Auth Code re-verification gate (Dialog required, NOT logout)
        if (errorCode == "AUTH_CODE_REQUIRED"
            || body.contains("AUTH_CODE_REQUIRED") || body.contains("AUTH_CODE_STALE")) {
            FileLogger.w(TAG, "401 reason: AUTH_CODE_REQUIRED/STALE — broadcasting reverify dialog")
            val intent = Intent(ACTION_AUTH_CODE_REQUIRED)
            intent.setPackage(context.packageName)
            context.sendBroadcast(intent)
            // CRITICAL: Return the response immediately. Do NOT fall through to the
            // token refresh logic below, as a refresh failure would trigger a logout.
            return response
        }

        // 3. Otherwise, assume access token expired → try to refresh once.
        val refreshToken = prefs.getString("refresh_token", null)
        if (refreshToken.isNullOrEmpty()) {
            FileLogger.w(TAG, "401 but no refresh_token stored — cannot recover")
            return response
        }

        FileLogger.i(TAG, "401 — attempting token refresh")
        val newAccessToken = synchronized(refreshLock) {
            // Double-check: maybe another in-flight 401 already refreshed the
            // token while we were waiting on the lock. If so, use the fresh
            // one instead of hitting the server again.
            val current = prefs.getString("access_token", null)
            val sentBearer = authed.header("Authorization")
            if (!current.isNullOrEmpty() && sentBearer != "Bearer $current") {
                FileLogger.d(TAG, "Token already refreshed by another thread — reusing")
                current
            } else {
                performRefresh(refreshToken)
            }
        }

        if (newAccessToken == null) {
            FileLogger.w(TAG, "Token refresh failed — session dead")
            if (authed.header("Authorization") != null) {
                val intent = Intent(ACTION_SESSION_REVOKED)
                intent.putExtra(EXTRA_SESSION_REASON, "SESSION_EXPIRED")
                intent.setPackage(context.packageName)
                context.sendBroadcast(intent)
            }
            return response
        }
        FileLogger.i(TAG, "Token refresh succeeded — retrying original request")

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
            val hasToken = !accessToken.isNullOrEmpty()
            if (hasToken) {
                builder.header("Authorization", "Bearer $accessToken")
            }
            val hospitalId = prefs.getString("hospital_id", null)
            if (!hospitalId.isNullOrEmpty()) {
                builder.header("X-Hospital-Id", hospitalId)
            }
            builder.header("X-Client-Type", "Android")
            FileLogger.d(TAG, "attachAuthHeaders — hasToken=$hasToken hospitalId=${hospitalId?.take(6)}…")
        } catch (e: Exception) {
            // Log full exception — if EncryptedSharedPreferences is broken this fires on every request
            FileLogger.e(TAG, "attachAuthHeaders FAILED — requests sent without auth. ${e.javaClass.name}: ${e.message}", e)
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

            FileLogger.d(TAG, "performRefresh → POST /api/auth/refresh-token")
            refreshClient.newCall(request).execute().use { resp ->
                if (!resp.isSuccessful) {
                    FileLogger.w(TAG, "performRefresh HTTP ${resp.code} — refresh rejected by server")
                    FileLogger.w(TAG, "Refresh failed with code ${resp.code}")
                    return null
                }
                val bodyStr = resp.body?.string() ?: return null
                val json = JSONObject(bodyStr)
                if (!json.optBoolean("success", false)) {
                    FileLogger.w(TAG, "performRefresh success=false — body: ${bodyStr.take(200)}")
                    return null
                }
                val data = json.optJSONObject("data") ?: return null
                val newAccess = data.optString("accessToken", "")
                val newRefresh = data.optString("refreshToken", "")
                if (newAccess.isEmpty()) {
                    FileLogger.w(TAG, "performRefresh — server returned empty accessToken")
                    return null
                }

                val editor = prefs.edit().putString("access_token", newAccess)
                if (newRefresh.isNotEmpty()) {
                    editor.putString("refresh_token", newRefresh)
                }
                editor.apply()
                FileLogger.i(TAG, "performRefresh — new tokens saved successfully")
                newAccess
            }
        } catch (e: Exception) {
            // Full stack trace logged — tells us if it's a network error, SSL error, JSON parse error, etc.
            FileLogger.e(TAG, "performRefresh EXCEPTION — ${e.javaClass.name}: ${e.message}", e)
            FileLogger.w(TAG, "Refresh-token call threw: ${e.message}")
            null
        }
    }
}
