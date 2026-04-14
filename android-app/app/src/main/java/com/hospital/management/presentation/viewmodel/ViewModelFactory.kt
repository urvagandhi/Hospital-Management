package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.domain.usecase.*

class ViewModelFactory(
    private val authRepository: AuthRepository? = null,
    private val patientRepository: PatientRepository? = null
) : ViewModelProvider.Factory {

    @Suppress("UNCHECKED_CAST")
    override fun <T : ViewModel> create(modelClass: Class<T>): T {
        if (modelClass.isAssignableFrom(AuthViewModel::class.java)) {
            if (authRepository == null) throw IllegalArgumentException("AuthRepository required for AuthViewModel")
            return AuthViewModel(
                LoginUseCase(authRepository),
                VerifyAuthCodeLoginUseCase(authRepository),
                ChangePasswordUseCase(authRepository),
                LogoutUseCase(authRepository),
                SaveTokensUseCase(authRepository),
                SaveHospitalInfoUseCase(authRepository)
            ) as T
        }
        if (modelClass.isAssignableFrom(PatientViewModel::class.java)) {
            if (patientRepository == null) throw IllegalArgumentException("PatientRepository required for PatientViewModel")
            return PatientViewModel(
                GetPatientsUseCase(patientRepository),
                CreatePatientUseCase(patientRepository),
                GetPatientByIdUseCase(patientRepository),
                CreateFolderUseCase(patientRepository),
                GetFolderFilesUseCase(patientRepository),
                UploadFileUseCase(patientRepository),
                DownloadFolderPdfUseCase(patientRepository),
                DownloadAllPdfUseCase(patientRepository),
                DownloadFolderZipUseCase(patientRepository),
                DownloadAllZipUseCase(patientRepository),
                UpdatePatientUseCase(patientRepository)
            ) as T
        }
        throw IllegalArgumentException("Unknown ViewModel class")
    }
}
