package com.hospital.management.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "hospital_prefs")

class TokenManager(private val context: Context) {
    
    companion object {
        private val ACCESS_TOKEN = stringPreferencesKey("access_token")
        private val REFRESH_TOKEN = stringPreferencesKey("refresh_token")
        private val TEMP_TOKEN = stringPreferencesKey("temp_token")
        private val HOSPITAL_ID = stringPreferencesKey("hospital_id")
        private val HOSPITAL_NAME = stringPreferencesKey("hospital_name")
        private val HOSPITAL_LOGO_URL = stringPreferencesKey("hospital_logo_url")
        private val DEVICE_ID = stringPreferencesKey("device_id")
    }
    
    val accessToken: Flow<String?> = context.dataStore.data.map { it[ACCESS_TOKEN] }
    val refreshToken: Flow<String?> = context.dataStore.data.map { it[REFRESH_TOKEN] }
    val tempToken: Flow<String?> = context.dataStore.data.map { it[TEMP_TOKEN] }
    val hospitalId: Flow<String?> = context.dataStore.data.map { it[HOSPITAL_ID] }
    val hospitalName: Flow<String?> = context.dataStore.data.map { it[HOSPITAL_NAME] }
    val hospitalLogoUrl: Flow<String?> = context.dataStore.data.map { it[HOSPITAL_LOGO_URL] }
    
    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        context.dataStore.edit { prefs ->
            prefs[ACCESS_TOKEN] = accessToken
            prefs[REFRESH_TOKEN] = refreshToken
        }
    }
    
    suspend fun saveTempToken(token: String) {
        context.dataStore.edit { prefs ->
            prefs[TEMP_TOKEN] = token
        }
    }
    
    suspend fun saveHospitalInfo(id: String, name: String, logoUrl: String = "") {
        context.dataStore.edit { prefs ->
            prefs[HOSPITAL_ID] = id
            prefs[HOSPITAL_NAME] = name
            prefs[HOSPITAL_LOGO_URL] = logoUrl
        }
    }
    
    suspend fun saveDeviceId(deviceId: String) {
        context.dataStore.edit { prefs ->
            prefs[DEVICE_ID] = deviceId
        }
    }
    
    suspend fun clearAll() {
        context.dataStore.edit { prefs ->
            prefs.clear()
        }
    }
    
    suspend fun getAccessToken(): String? {
        var token: String? = null
        context.dataStore.data.collect { prefs ->
            token = prefs[ACCESS_TOKEN]
        }
        return token
    }
}
