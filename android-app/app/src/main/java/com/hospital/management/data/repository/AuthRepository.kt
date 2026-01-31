package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.ChangePasswordResponse
import com.hospital.management.data.models.LoginResponse
import com.hospital.management.data.models.TotpSetupResponse
import com.hospital.management.data.models.TotpVerifyResponse
import kotlinx.coroutines.flow.firstOrNull
import retrofit2.Response

class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {

    suspend fun login(email: String, password: String, isBiometric: Boolean = false): Response<LoginResponse> {
        val body = mapOf(
            "email" to email,
            "password" to password,
            "isBiometric" to isBiometric
        )
        return apiService.login(body)
    }

    suspend fun verifyOtp(tempToken: String, otp: String): Response<Map<String, Any>> {
        val authHeader = "Bearer $tempToken"
        return apiService.verifyOtp(authHeader, mapOf("otp" to otp))
    }

    suspend fun resendOtp(tempToken: String): Response<Map<String, Any>> {
        val authHeader = "Bearer $tempToken"
        return apiService.resendOtp(authHeader)
    }

    suspend fun changePassword(tempToken: String, newPassword: String): Response<ChangePasswordResponse> {
           val authHeader = "Bearer $tempToken"
           return apiService.changePassword(authHeader, mapOf("newPassword" to newPassword))
    }

    suspend fun setupTotp(): Response<TotpSetupResponse> {
        // Need access token. Assuming we are logged in or have a token.
        // For setup, we usually expect the user to be fully logged in (AccessToken).
        val accessToken = tokenManager.accessToken.firstOrNull() ?: ""
        val authHeader = "Bearer $accessToken"
        return apiService.setupTotp(authHeader)
    }

    suspend fun verifyTotpSetup(totp: String): Response<TotpVerifyResponse> {
        val accessToken = tokenManager.accessToken.firstOrNull() ?: ""
        val authHeader = "Bearer $accessToken"
        return apiService.verifyTotpSetup(authHeader, mapOf("token" to totp))
    }

    suspend fun verifyTotpLogin(tempToken: String, totp: String): Response<LoginResponse> {
        val authHeader = "Bearer $tempToken"
        return apiService.verifyTotpLogin(authHeader, mapOf("token" to totp))
    }

    suspend fun recoveryLogin(tempToken: String, recoveryCode: String): Response<Map<String, Any>> {
         val authHeader = "Bearer $tempToken"
         return apiService.recoveryLogin(authHeader, mapOf("code" to recoveryCode))
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
        RetrofitClient.clearCookies()
    }
}
