package com.hospital.management.data.local

import android.content.Context
import android.content.SharedPreferences
import com.hospital.management.utils.FileLogger
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.onStart

class TokenManager(private val context: Context) {

    suspend fun getHospitalId(): String? {
        return prefs.getString(HOSPITAL_ID, null)
    }

    companion object {
        private const val TAG = "TokenManager"
        private const val PREFS_NAME = "secure_hospital_prefs"
        private const val ACCESS_TOKEN = "access_token"
        private const val REFRESH_TOKEN = "refresh_token"
        private const val TEMP_TOKEN = "temp_token"
        private const val HOSPITAL_ID = "hospital_id"
        private const val HOSPITAL_NAME = "hospital_name"
        private const val HOSPITAL_LOGO_URL = "hospital_logo_url"
        private const val DEVICE_ID = "device_id"
        private const val USER_EMAIL = "user_email"
        private const val BIOMETRIC_ENABLED = "biometric_enabled"
        private const val SESSION_TIMESTAMP = "session_timestamp"
        private const val LAST_BIOMETRIC_HOSPITAL_ID = "last_biometric_hospital_id"
    }

    private val prefs: SharedPreferences = createEncryptedPrefs()

    private fun createEncryptedPrefs(): SharedPreferences {
        return try {
            val masterKey = MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build()
            EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            )
        } catch (e: Exception) {
            FileLogger.e(TAG, "EncryptedSharedPreferences corrupted, clearing and recreating", e)
            // Delete the corrupted prefs file and retry
            context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).edit().clear().apply()
            try {
                val file = java.io.File(context.filesDir.parent, "shared_prefs/$PREFS_NAME.xml")
                if (file.exists()) file.delete()
            } catch (_: Exception) {}
            try {
                val masterKey = MasterKey.Builder(context)
                    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                    .build()
                EncryptedSharedPreferences.create(
                    context,
                    PREFS_NAME,
                    masterKey,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
                )
            } catch (e2: Exception) {
                FileLogger.e(TAG, "Failed to recreate EncryptedSharedPreferences, falling back", e2)
                // Last resort: use regular SharedPreferences so the app doesn't crash
                context.getSharedPreferences("${PREFS_NAME}_fallback", Context.MODE_PRIVATE)
            }
        }
    }

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

    suspend fun getRefreshToken(): String? {
        return prefs.getString(REFRESH_TOKEN, null)
    }

    suspend fun getHospitalName(): String? {
        return prefs.getString(HOSPITAL_NAME, null)
    }

    suspend fun getHospitalLogoUrl(): String? {
        return prefs.getString(HOSPITAL_LOGO_URL, null)
    }

    // ── Biometric enrollment state (per-hospital) ───────────────────────────
    // The flag, the enrolled email, and the keystore alias are all scoped by
    // hospitalId so multiple hospital accounts on the same device enrol
    // independently — critical for dev/testing with multiple accounts and for
    // production where a device might be shared across staff.
    //
    // Legacy (global) keys remain for migration but new code must pass hospitalId.

    private fun bioEnabledKey(hospitalId: String) = "biometric_enabled_$hospitalId"
    private fun bioEmailKey(hospitalId: String) = "biometric_email_$hospitalId"

    suspend fun setBiometricEnabled(hospitalId: String, enabled: Boolean) {
        prefs.edit().apply {
            if (enabled) {
                putBoolean(bioEnabledKey(hospitalId), true)
                putString(LAST_BIOMETRIC_HOSPITAL_ID, hospitalId)
            } else {
                remove(bioEnabledKey(hospitalId))
                // If we're disabling the last-used one, drop the pointer too
                if (prefs.getString(LAST_BIOMETRIC_HOSPITAL_ID, null) == hospitalId) {
                    remove(LAST_BIOMETRIC_HOSPITAL_ID)
                }
            }
            apply()
        }
    }

    suspend fun isBiometricEnabled(hospitalId: String): Boolean =
        prefs.getBoolean(bioEnabledKey(hospitalId), false)

    /** Email remembered against a specific hospital's biometric enrolment. */
    suspend fun saveBiometricEmail(hospitalId: String, email: String) {
        prefs.edit().putString(bioEmailKey(hospitalId), email).apply()
    }

    suspend fun getBiometricEmail(hospitalId: String): String? =
        prefs.getString(bioEmailKey(hospitalId), null)

    /**
     * The hospitalId that enrolled biometric most recently — used by the login
     * screen to decide which account's biometric button to surface on a fresh
     * app launch (before any account is selected).
     */
    suspend fun getLastBiometricHospitalId(): String? =
        prefs.getString(LAST_BIOMETRIC_HOSPITAL_ID, null)

    /** Wipe all per-hospital biometric state for this hospital (used on key
     *  invalidation recovery — user re-enrols fresh). */
    suspend fun clearBiometricForHospital(hospitalId: String) {
        prefs.edit().apply {
            remove(bioEnabledKey(hospitalId))
            remove(bioEmailKey(hospitalId))
            if (prefs.getString(LAST_BIOMETRIC_HOSPITAL_ID, null) == hospitalId) {
                remove(LAST_BIOMETRIC_HOSPITAL_ID)
            }
            apply()
        }
    }

    suspend fun getEmail(): String? = prefs.getString(USER_EMAIL, null)

    suspend fun saveEmail(email: String) {
        prefs.edit().apply {
            putString(USER_EMAIL, email)
            apply()
        }
    }

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

