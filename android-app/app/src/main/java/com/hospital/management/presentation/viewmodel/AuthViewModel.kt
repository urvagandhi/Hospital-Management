package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hospital.management.domain.usecase.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch

sealed class AuthState {
    object Idle : AuthState()
    object Loading : AuthState()
    data class Success(val message: String, val tempToken: String? = null) : AuthState()
    data class Error(val message: String) : AuthState()
}

class AuthViewModel(
    private val loginUseCase: LoginUseCase,
    private val verifyOtpUseCase: VerifyOtpUseCase,
    private val resendOtpUseCase: ResendOtpUseCase
) : ViewModel() {
    
    private val _authState = MutableStateFlow<AuthState>(AuthState.Idle)
    val authState: StateFlow<AuthState> = _authState
    
    fun login(email: String, password: String) {
        viewModelScope.launch {
            _authState.value = AuthState.Loading
            try {
                val response = loginUseCase(email, password)
                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    val tempToken = data?.tempToken
                    _authState.value = AuthState.Success("OTP sent successfully", tempToken)
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
    
    fun resetState() {
        _authState.value = AuthState.Idle
    }
}
