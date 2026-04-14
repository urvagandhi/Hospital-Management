package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.AuthCodeVerifyRequest
import com.hospital.management.data.models.AuthCodeVerifyResponse
import com.hospital.management.data.models.ChangePasswordResponse
import com.hospital.management.data.models.LoginResponse
import retrofit2.Response

class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {

    suspend fun login(identifier: String, password: String): Response<LoginResponse> {
        val body = mapOf(
            "identifier" to identifier,
            "email" to identifier, // Legacy compat
            "password" to password
        )
        return apiService.login(body)
    }

    suspend fun verifyAuthCodeLogin(tempToken: String, authCode: String): Response<AuthCodeVerifyResponse> {
        return apiService.verifyAuthCodeLogin("Bearer $tempToken", AuthCodeVerifyRequest(authCode))
    }

    suspend fun changePassword(tempToken: String, newPassword: String): Response<ChangePasswordResponse> {
        val authHeader = "Bearer $tempToken"
        return apiService.changePassword(authHeader, mapOf("newPassword" to newPassword))
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

    suspend fun registerBiometric(publicKey: String, deviceId: String): Response<Map<String, Any>> {
        return apiService.registerBiometric(mapOf("publicKey" to publicKey, "deviceId" to deviceId))
    }

    suspend fun biometricChallenge(identifier: String, deviceId: String): Response<Map<String, Any>> {
        return apiService.biometricChallenge(mapOf("identifier" to identifier, "deviceId" to deviceId))
    }

    suspend fun verifyBiometric(hospitalId: String, deviceId: String, signature: String): Response<LoginResponse> {
        return apiService.verifyBiometric(mapOf("hospitalId" to hospitalId, "deviceId" to deviceId, "signature" to signature))
    }

    suspend fun validateSession(): Response<Map<String, Any>> {
        return apiService.validateSession()
    }

    suspend fun logout() {
        tokenManager.clearAll()
        RetrofitClient.clearCookies()
    }
}
