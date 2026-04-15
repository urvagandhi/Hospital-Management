package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hospital.management.data.models.Hospital
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.domain.usecase.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class RequireAuthCode(val tempToken: String, val hospitalName: String?, val logoUrl: String?) : AuthState()
    data class RequirePasswordChange(val tempToken: String) : AuthState()
    data class LoggedIn(val hospital: Hospital?) : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(
    private val loginUseCase: LoginUseCase,
    private val verifyAuthCodeLoginUseCase: VerifyAuthCodeLoginUseCase,
    private val changePasswordUseCase: ChangePasswordUseCase,
    private val logoutUseCase: LogoutUseCase,
    private val saveTokensUseCase: SaveTokensUseCase,
    private val saveHospitalInfoUseCase: SaveHospitalInfoUseCase,
    private val authRepository: AuthRepository? = null,
) : ViewModel() {

    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = loginUseCase(email, password)
                if (response.isSuccessful && response.body()?.success == true) {
                    val body = response.body()!!
                    val data = body.data
                    android.util.Log.d("AuthViewModel", "Login response: requireAuthCode=${body.requireAuthCode} requirePasswordChange=${body.requirePasswordChange}")

                    when {
                        body.requirePasswordChange == true -> {
                            val tempToken = data?.tempToken ?: ""
                            _authState.value = AuthState.RequirePasswordChange(tempToken)
                        }
                        body.requireAuthCode == true -> {
                            val tempToken = data?.tempToken ?: ""
                            _authState.value = AuthState.RequireAuthCode(
                                tempToken = tempToken,
                                hospitalName = data?.hospitalName,
                                logoUrl = data?.logoUrl
                            )
                        }
                        else -> {
                            // Biometric path — tokens already in response
                            val accessToken = data?.accessToken
                            val refreshToken = data?.refreshToken
                            if (accessToken != null && refreshToken != null) {
                                saveTokensUseCase(accessToken, refreshToken)
                                val hospitalName = data.hospitalName ?: data.hospital?.hospitalName ?: ""
                                val hospitalId = data.hospital?._id ?: ""
                                val logoUrl = data.logoUrl ?: data.hospital?.logoUrl ?: ""
                                saveHospitalInfoUseCase(hospitalId, hospitalName, logoUrl)
                                _authState.value = AuthState.LoggedIn(data.hospital)
                            } else {
                                _authState.value = AuthState.Error("Invalid server response")
                            }
                        }
                    }
                } else {
                    val errBody = try { response.errorBody()?.string() } catch (_: Exception) { null }
                    val parsedMsg = errBody?.let {
                        try {
                            val json = org.json.JSONObject(it)
                            json.optString("message").takeIf { m -> m.isNotEmpty() }
                        } catch (_: Exception) { null }
                    }
                    val errorMsg = parsedMsg ?: response.body()?.message ?: "Login failed"
                    _authState.value = AuthState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _authState.value = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun verifyAuthCode(tempToken: String, authCode: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = verifyAuthCodeLoginUseCase(tempToken, authCode)
                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data?.accessToken != null && data.refreshToken != null) {
                        saveTokensUseCase(data.accessToken, data.refreshToken)
                        saveHospitalInfoUseCase(
                            data.hospital._id,
                            data.hospital.hospitalName,
                            data.hospital.logoUrl ?: ""
                        )
                        _authState.value = AuthState.LoggedIn(data.hospital)
                    } else {
                        _authState.value = AuthState.Error("Invalid token response")
                    }
                } else {
                    val errorMsg = response.body()?.message ?: "Invalid auth code"
                    _authState.value = AuthState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _authState.value = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun changePassword(tempToken: String, newPassword: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = changePasswordUseCase(tempToken, newPassword)
                if (response.isSuccessful && response.body()?.success == true) {
                    val body = response.body()!!
                    if (body.data != null) {
                        saveTokensUseCase(body.data.accessToken, body.data.refreshToken)
                        saveHospitalInfoUseCase(body.data.hospital._id, body.data.hospital.hospitalName, "")
                    }
                    _authState.value = AuthState.LoggedIn(body.data?.hospital)
                } else {
                    val errorMsg = response.body()?.message ?: "Change password failed"
                    _authState.value = AuthState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _authState.value = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            try {
                logoutUseCase()
                _authState.value = AuthState.Idle
            } catch (e: Exception) {
                _authState.value = AuthState.Idle
            }
        }
    }

    fun resetState() {
        _authState.value = AuthState.Idle
    }

    // ── Forgot password (Task #27) ──────────────────────────────────────
    //
    // Exposed as a separate StateFlow so LoginActivity's collector doesn't
    // accidentally react to reset-flow progression. Activities for the
    // forgot-password screens collect _forgotState directly.

    sealed class ForgotState {
        object Idle : ForgotState()
        object Loading : ForgotState()
        data class InitSent(val message: String) : ForgotState()
        data class Verified(val tempToken: String) : ForgotState()
        object ResetDone : ForgotState()
        data class Error(val message: String) : ForgotState()
    }

    private val _forgotState = MutableStateFlow<ForgotState>(ForgotState.Idle)
    val forgotState: StateFlow<ForgotState> = _forgotState.asStateFlow()

    fun forgotInit(identifier: String) {
        val repo = authRepository ?: return run { _forgotState.value = ForgotState.Error("Not configured") }
        viewModelScope.launch {
            _forgotState.value = ForgotState.Loading
            try {
                val response = repo.forgotPasswordInit(identifier)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _forgotState.value = ForgotState.InitSent(body.message)
                } else {
                    _forgotState.value = ForgotState.Error(body?.message ?: "Unable to send code")
                }
            } catch (e: Exception) {
                _forgotState.value = ForgotState.Error(e.message ?: "Network error")
            }
        }
    }

    fun forgotVerify(identifier: String, otp: String) {
        val repo = authRepository ?: return run { _forgotState.value = ForgotState.Error("Not configured") }
        viewModelScope.launch {
            _forgotState.value = ForgotState.Loading
            try {
                val response = repo.forgotPasswordVerify(identifier, otp)
                val body = response.body()
                val token = body?.data?.tempToken
                if (response.isSuccessful && body?.success == true && !token.isNullOrEmpty()) {
                    _forgotState.value = ForgotState.Verified(token)
                } else {
                    _forgotState.value = ForgotState.Error(body?.message ?: "Invalid or expired code")
                }
            } catch (e: Exception) {
                _forgotState.value = ForgotState.Error(e.message ?: "Network error")
            }
        }
    }

    fun forgotReset(tempToken: String, newPassword: String) {
        val repo = authRepository ?: return run { _forgotState.value = ForgotState.Error("Not configured") }
        viewModelScope.launch {
            _forgotState.value = ForgotState.Loading
            try {
                val response = repo.forgotPasswordReset(tempToken, newPassword)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _forgotState.value = ForgotState.ResetDone
                } else {
                    _forgotState.value = ForgotState.Error(body?.message ?: "Password reset failed")
                }
            } catch (e: Exception) {
                _forgotState.value = ForgotState.Error(e.message ?: "Network error")
            }
        }
    }

    fun resetForgotState() {
        _forgotState.value = ForgotState.Idle
    }
}
