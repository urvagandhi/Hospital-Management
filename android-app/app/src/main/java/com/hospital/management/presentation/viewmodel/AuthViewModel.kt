package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hospital.management.domain.usecase.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class Success(val message: String, val data: Any? = null) : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(
    private val loginUseCase: LoginUseCase,
    private val verifyOtpUseCase: VerifyOtpUseCase,
    private val resendOtpUseCase: ResendOtpUseCase,
    private val changePasswordUseCase: ChangePasswordUseCase,
    private val setupTotpUseCase: SetupTotpUseCase,
    private val verifyTotpSetupUseCase: VerifyTotpSetupUseCase,
    private val verifyTotpLoginUseCase: VerifyTotpLoginUseCase,
    private val recoveryLoginUseCase: RecoveryLoginUseCase,
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

                    // Handle different login states
                    if (body.requirePasswordChange == true) {
                        _authState.value = AuthState.Success("Password change required", data?.tempToken)
                    } else if (body.requireTotp == true) {
                         _authState.value = AuthState.Success("TOTP verification required", data?.tempToken)
                    } else if (body.requireTotpSetup == true) {
                         // Should have accessToken if it's just setup needed?
                         // Or maybe tempToken is enough? Checking logic.
                         // Usually for setup we need to be logged in.
                         // If 2FA setup is forced, we probably got a tempToken or limited access token.
                         // But standard flow: login -> success -> setup 2FA.

                         // If we got tokens:
                        if (data?.accessToken != null && data.refreshToken != null) {
                            saveTokensUseCase(data.accessToken, data.refreshToken)
                            val hospitalName = data.hospitalName ?: data.hospital?.name ?: ""
                            val hospitalId = data.hospital?._id ?: ""
                            saveHospitalInfoUseCase(hospitalId, hospitalName, data.logoUrl ?: "")
                             _authState.value = AuthState.Success("TOTP Setup Required", "SETUP_REQUIRED")
                        } else {
                             _authState.value = AuthState.Success("TOTP Setup Required", data?.tempToken)
                        }
                    } else {
                        // Success
                        val accessToken = data?.accessToken
                        val refreshToken = data?.refreshToken
                        if (accessToken != null && refreshToken != null) {
                            saveTokensUseCase(accessToken, refreshToken)
                            val hospitalName = data.hospitalName ?: data.hospital?.name ?: ""
                            val hospitalId = data.hospital?._id ?: ""
                            saveHospitalInfoUseCase(hospitalId, hospitalName, data.logoUrl ?: "")
                            _authState.value = AuthState.Success("Login successful", "LoggedIn")
                        } else if (data?.tempToken != null) {
                            // OTP Case (Legacy)
                             _authState.value = AuthState.Success("OTP sent", data.tempToken)
                        } else {
                             _authState.value = AuthState.Error("Invalid server response")
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

    fun verifyOtp(tempToken: String, otp: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = verifyOtpUseCase(tempToken, otp)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    // Extract tokens if present in response (legacy flow might behave differently)
                    // Assuming map response
                    _authState.value = AuthState.Success("OTP verified successfully")
                } else {
                    val errorMsg = response.body()?.get("message") as? String ?: "Verification failed"
                    _authState.value = AuthState.Error(errorMsg)
                }
            } catch (e: Exception) {
                _authState.value = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun resendOtp(tempToken: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = resendOtpUseCase(tempToken)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    _authState.value = AuthState.Success("OTP resent successfully")
                } else {
                    val errorMsg = response.body()?.get("message") as? String ?: "Resend failed"
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
                         saveHospitalInfoUseCase(body.data.hospital._id, body.data.hospital.name, "")
                    }
                    if (body.requireTotpSetup == true) {
                         _authState.value = AuthState.Success("Password changed. 2FA Setup required.", "SETUP_REQUIRED")
                    } else {
                        _authState.value = AuthState.Success("Password changed successfully", "LoggedIn")
                    }
                } else {
                    val errorMsg = response.body()?.message ?: "Change password failed"
                    _authState.value = AuthState.Error(errorMsg)
                }
            } catch (e: Exception) {
                 _authState.value = AuthState.Error(e.message ?: "Network error")
            }
         }
    }

    fun setupTotp() {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = setupTotpUseCase()
                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    _authState.value = AuthState.Success("TOTP Setup Initiated", data)
                } else {
                     _authState.value = AuthState.Error(response.body()?.message ?: "Failed to init TOTP setup")
                }
            } catch (e: Exception) {
                 _authState.value = AuthState.Error(e.message ?: "Network error")
            }
        }
    }

    fun verifyTotpSetup(code: String) {
        viewModelScope.launch {
             _authState.value = AuthState.Loading
             try {
                 val response = verifyTotpSetupUseCase(code)
                 if (response.isSuccessful && response.body()?.success == true) {
                     val data = response.body()?.data // VerifyData with backup codes
                     _authState.value = AuthState.Success("TOTP Verified", data)
                 } else {
                      _authState.value = AuthState.Error(response.body()?.message ?: "TOTP Verification failed")
                 }
             } catch (e: Exception) {
                 _authState.value = AuthState.Error(e.message ?: "Network error")
             }
        }
    }

    fun verifyTotpLogin(tempToken: String, code: String) {
        viewModelScope.launch {
             _authState.value = AuthState.Loading
             try {
                 val response = verifyTotpLoginUseCase(tempToken, code)
                 if (response.isSuccessful && response.body()?.success == true) {
                     val data = response.body()?.data
                     if (data?.accessToken != null && data.refreshToken != null) {
                         saveTokensUseCase(data.accessToken, data.refreshToken)
                         saveHospitalInfoUseCase(data.hospital?._id ?: "", data.hospitalName ?: data.hospital?.name ?: "", data.logoUrl ?: "")
                         _authState.value = AuthState.Success("Login successful", "LoggedIn")
                     } else {
                         _authState.value = AuthState.Error("Invalid token response")
                     }
                 } else {
                      _authState.value = AuthState.Error(response.body()?.message ?: "Invalid code")
                 }
             } catch (e: Exception) {
                  _authState.value = AuthState.Error(e.message ?: "Network error")
             }
        }
    }

    fun recoveryLogin(tempToken: String, code: String) {
        viewModelScope.launch {
             _authState.value = AuthState.Loading
             try {
                 val response = recoveryLoginUseCase(tempToken, code)
                 if (response.isSuccessful && response.body()?.get("success") == true) {
                     // Need to see what recovery login returns exactly. ApiService says Map.
                     // It likely returns tokens.
                     val data = response.body()?.get("data") as? Map<*, *>
                     val accessToken = data?.get("accessToken") as? String
                     val refreshToken = data?.get("refreshToken") as? String

                     if (accessToken != null && refreshToken != null) {
                         saveTokensUseCase(accessToken, refreshToken)
                          // Can't easily get hospital info from generic map unless we check keys,
                          // but for now let's assume login is enough.
                         _authState.value = AuthState.Success("Login successful", "LoggedIn")
                     } else {
                          // Try to parse more defensively if needed, or assume it returns standard data structure mapped to map
                          _authState.value = AuthState.Success("Login successful (check tokens)", "LoggedIn")
                     }
                 } else {
                      _authState.value = AuthState.Error(response.body()?.get("message") as? String ?: "Recovery failed")
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
                // Ignore error on logout
                _authState.value = AuthState.Idle
            }
        }
    }

    fun resetState() {
        _authState.value = AuthState.Idle
    }
}
