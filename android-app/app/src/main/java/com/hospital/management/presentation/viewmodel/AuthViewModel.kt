package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hospital.management.data.models.Hospital
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
    private val saveHospitalInfoUseCase: SaveHospitalInfoUseCase
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
                    val errorMsg = response.body()?.message ?: "Login failed"
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
}
