package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.hospital.management.data.models.Hospital
import com.hospital.management.data.models.SessionItem
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.ProfileRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.File

sealed class ProfileEvent {
    object Idle : ProfileEvent()
    object Loading : ProfileEvent()
    data class Loaded(val hospital: Hospital) : ProfileEvent()
    data class Saved(val hospital: Hospital, val message: String = "Profile updated") : ProfileEvent()
    data class OtpSent(val field: String, val message: String) : ProfileEvent()
    data class ContactChanged(val hospital: Hospital) : ProfileEvent()
    data class PasswordChanged(val message: String) : ProfileEvent()
    data class SessionsLoaded(val sessions: List<SessionItem>) : ProfileEvent()
    data class Error(val message: String) : ProfileEvent()
}

class ProfileViewModel(
    private val profileRepo: ProfileRepository,
    private val authRepo: AuthRepository,
) : ViewModel() {

    private val _event = MutableStateFlow<ProfileEvent>(ProfileEvent.Idle)
    val event: StateFlow<ProfileEvent> = _event.asStateFlow()

    // ── Profile load + save ──────────────────────────────────────────────
    fun loadProfile() {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = profileRepo.getCurrentHospital()
                val hospital = response.body()?.data
                if (response.isSuccessful && hospital != null) {
                    _event.value = ProfileEvent.Loaded(hospital)
                } else {
                    _event.value = ProfileEvent.Error(response.body()?.message ?: "Failed to load profile")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    fun saveProfile(hospitalName: String?, address: String?, logo: File?) {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = profileRepo.patchProfile(hospitalName, address, logo)
                val hospital = response.body()?.data
                if (response.isSuccessful && hospital != null) {
                    _event.value = ProfileEvent.Saved(hospital)
                } else {
                    _event.value = ProfileEvent.Error(response.body()?.message ?: "Failed to update profile")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    // ── Contact change (email/phone) ─────────────────────────────────────
    fun initContactChange(newEmail: String?, newPhone: String?) {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = profileRepo.initContactChange(newEmail, newPhone)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _event.value = ProfileEvent.OtpSent(
                        body.data?.field ?: (if (newEmail != null) "email" else "phone"),
                        body.message,
                    )
                } else {
                    _event.value = ProfileEvent.Error(body?.message ?: "Failed to send code")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    fun verifyContactChange(otp: String) {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = profileRepo.verifyContactChange(otp)
                val hospital = response.body()?.data
                if (response.isSuccessful && hospital != null) {
                    _event.value = ProfileEvent.ContactChanged(hospital)
                } else {
                    _event.value = ProfileEvent.Error(response.body()?.message ?: "Verification failed")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    // ── Settings-based change password ───────────────────────────────────
    fun changePassword(currentPassword: String, newPassword: String) {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = authRepo.changePasswordSettings(currentPassword, newPassword)
                val body = response.body()
                if (response.isSuccessful && body?.success == true) {
                    _event.value = ProfileEvent.PasswordChanged(body.message)
                } else {
                    _event.value = ProfileEvent.Error(body?.message ?: "Password change failed")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    // ── Sessions ─────────────────────────────────────────────────────────
    fun loadSessions() {
        viewModelScope.launch {
            _event.value = ProfileEvent.Loading
            try {
                val response = authRepo.listSessions()
                if (response.isSuccessful && response.body()?.success == true) {
                    _event.value = ProfileEvent.SessionsLoaded(response.body()?.data ?: emptyList())
                } else {
                    _event.value = ProfileEvent.Error("Failed to load sessions")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    fun revokeSession(id: String) {
        viewModelScope.launch {
            try {
                val response = authRepo.revokeSession(id)
                if (response.isSuccessful && response.body()?.success == true) {
                    loadSessions()
                } else {
                    _event.value = ProfileEvent.Error(response.body()?.message ?: "Failed to revoke session")
                }
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    fun revokeAllOthers() {
        viewModelScope.launch {
            try {
                authRepo.revokeAllOtherSessions()
                loadSessions()
            } catch (e: Exception) {
                _event.value = ProfileEvent.Error(e.message ?: "Network error")
            }
        }
    }

    fun reset() {
        _event.value = ProfileEvent.Idle
    }
}
