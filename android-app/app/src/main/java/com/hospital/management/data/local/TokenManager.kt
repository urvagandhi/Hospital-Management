package com.hospital.management.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.onStart

class TokenManager(private val context: Context) {

    companion object {
        private const val PREFS_NAME = "secure_hospital_prefs"
        private const val ACCESS_TOKEN = "access_token"
        private const val REFRESH_TOKEN = "refresh_token"
        private const val TEMP_TOKEN = "temp_token"
        private const val HOSPITAL_ID = "hospital_id"
        private const val HOSPITAL_NAME = "hospital_name"
        private const val HOSPITAL_LOGO_URL = "hospital_logo_url"
        private const val DEVICE_ID = "device_id"
        private const val USER_EMAIL = "user_email"
        private const val USER_PASSWORD = "user_password"
        private const val SESSION_TIMESTAMP = "session_timestamp"
    }

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    // Helper to generic flow from preferences
    private fun getFlow(key: String): Flow<String?> = callbackFlow {
        val listener = SharedPreferences.OnSharedPreferenceChangeListener { sharedPreferences, k ->
            if (key == k) {
                trySend(sharedPreferences.getString(key, null))
            }
        }
        prefs.registerOnSharedPreferenceChangeListener(listener)
        // Send initial value
        trySend(prefs.getString(key, null))

        awaitClose { prefs.unregisterOnSharedPreferenceChangeListener(listener) }
    }.onStart { emit(prefs.getString(key, null)) }.distinctUntilChanged()

    val accessToken: Flow<String?> = getFlow(ACCESS_TOKEN)
    val refreshToken: Flow<String?> = getFlow(REFRESH_TOKEN)
    val tempToken: Flow<String?> = getFlow(TEMP_TOKEN)
    val hospitalId: Flow<String?> = getFlow(HOSPITAL_ID)
    val hospitalName: Flow<String?> = getFlow(HOSPITAL_NAME)
    val hospitalLogoUrl: Flow<String?> = getFlow(HOSPITAL_LOGO_URL)

    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        prefs.edit().apply {
            putString(ACCESS_TOKEN, accessToken)
            putString(REFRESH_TOKEN, refreshToken)
            apply()
        }
    }

    suspend fun saveTempToken(token: String) {
        prefs.edit().apply {
            putString(TEMP_TOKEN, token)
            apply()
        }
    }

    suspend fun saveHospitalInfo(id: String, name: String, logoUrl: String = "") {
        prefs.edit().apply {
            putString(HOSPITAL_ID, id)
            putString(HOSPITAL_NAME, name)
            putString(HOSPITAL_LOGO_URL, logoUrl)
            apply()
        }
    }

    suspend fun saveDeviceId(deviceId: String) {
        prefs.edit().apply {
            putString(DEVICE_ID, deviceId)
            apply()
        }
    }

    suspend fun clearAll() {
        prefs.edit().apply {
            remove(ACCESS_TOKEN)
            remove(REFRESH_TOKEN)
            remove(TEMP_TOKEN)
            remove(HOSPITAL_ID)
            remove(HOSPITAL_NAME)
            remove(HOSPITAL_LOGO_URL)
            remove(SESSION_TIMESTAMP)
            apply()
        }
    }

    suspend fun getAccessToken(): String? {
        return prefs.getString(ACCESS_TOKEN, null)
    }

    suspend fun getHospitalName(): String? {
        return prefs.getString(HOSPITAL_NAME, null)
    }

    suspend fun getHospitalLogoUrl(): String? {
        return prefs.getString(HOSPITAL_LOGO_URL, null)
    }

    suspend fun saveCredentials(email: String, password: String) {
        prefs.edit().apply {
            putString(USER_EMAIL, email)
            putString(USER_PASSWORD, password)
            apply()
        }
    }

    suspend fun getEmail(): String? = prefs.getString(USER_EMAIL, null)
    suspend fun getPassword(): String? = prefs.getString(USER_PASSWORD, null)

    // Session timestamp methods for persistent session state
    suspend fun saveSessionTimestamp(timestamp: Long) {
        prefs.edit().apply {
            putLong(SESSION_TIMESTAMP, timestamp)
            apply()
        }
    }

    suspend fun getSessionTimestamp(): Long {
        return prefs.getLong(SESSION_TIMESTAMP, 0L)
    }

    suspend fun hasValidToken(): Boolean {
        return !prefs.getString(ACCESS_TOKEN, null).isNullOrEmpty()
    }
}

