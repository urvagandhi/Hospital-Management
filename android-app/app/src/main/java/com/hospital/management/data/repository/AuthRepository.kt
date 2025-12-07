package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.TokenManager
import retrofit2.Response

class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    
    suspend fun login(email: String, password: String): Response<Map<String, Any>> {
        return apiService.login(mapOf("email" to email, "password" to password))
    }
    
    suspend fun verifyOtp(tempToken: String, otp: String): Response<Map<String, Any>> {
        val authHeader = "Bearer $tempToken"
        return apiService.verifyOtp(authHeader, mapOf("otp" to otp))
    }
    
    suspend fun resendOtp(tempToken: String): Response<Map<String, Any>> {
        val authHeader = "Bearer $tempToken"
        return apiService.resendOtp(authHeader)
    }
    
    suspend fun saveTempToken(token: String) {
        tokenManager.saveTempToken(token)
    }
    
    suspend fun saveTokens(accessToken: String, refreshToken: String) {
        tokenManager.saveTokens(accessToken, refreshToken)
    }
    
    suspend fun saveHospitalInfo(id: String, name: String, logoUrl: String = "") {
        tokenManager.saveHospitalInfo(id, name, logoUrl)
    }
    
    suspend fun logout() {
        tokenManager.clearAll()
    }
}
