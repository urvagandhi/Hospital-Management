package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.AuthCodeVerifyRequest
import com.hospital.management.data.models.AuthCodeVerifyResponse
import com.hospital.management.data.models.ChangePasswordResponse
import com.hospital.management.data.models.LoginRequest
import com.hospital.management.data.models.LoginResponse
import retrofit2.Response

class AuthRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {

    suspend fun login(identifier: String, password: String): Response<LoginResponse> {
        return apiService.login(
            LoginRequest(
                identifier = identifier,
                email = identifier, // Legacy compat
                password = password
            )
        )
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
        // Notify backend FIRST so it can hard-delete the session, send the
        // logout-confirmation email, and clean up FCM token state.
        //
        // NonCancellable: AuthViewModel.logout() runs in viewModelScope, which
        // gets canceled the moment DashboardActivity calls finish(). Without
        // NonCancellable the apiService.logout() call would be aborted mid-
        // flight and the backend session would linger as a ghost.
        //
        // try-catch so a network failure (offline, 5xx) still proceeds to the
        // local cleanup below — the user must always end up signed out
        // locally, and the backend session will fall off via TTL.
        kotlinx.coroutines.withContext(kotlinx.coroutines.NonCancellable) {
            try {
                apiService.logout()
            } catch (_: Throwable) { /* best-effort */ }
            tokenManager.clearAll()
            RetrofitClient.clearCookies()
        }
    }

    // ── Forgot password (Task #27) ──────────────────────────────────────
    suspend fun forgotPasswordInit(identifier: String) =
        apiService.forgotPasswordInit(mapOf("identifier" to identifier))

    suspend fun forgotPasswordVerify(identifier: String, otp: String) =
        apiService.forgotPasswordVerify(mapOf("identifier" to identifier, "otp" to otp))

    suspend fun forgotPasswordReset(tempToken: String, newPassword: String) =
        apiService.forgotPasswordReset("Bearer $tempToken", mapOf("newPassword" to newPassword))

    // ── Settings-based change password (Task #28) ───────────────────────
    suspend fun changePasswordSettings(currentPassword: String, newPassword: String) =
        apiService.changePasswordSettings(
            mapOf("currentPassword" to currentPassword, "newPassword" to newPassword)
        )

    // ── Sessions ───────────────────────────────────────────────────────
    suspend fun listSessions() = apiService.listSessions()
    suspend fun revokeSession(id: String) = apiService.revokeSession(id)
    suspend fun revokeAllOtherSessions() = apiService.revokeAllOtherSessions()
}
