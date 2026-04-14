package com.hospital.management.domain.usecase

import com.hospital.management.data.repository.AuthRepository

class LoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(email: String, password: String) = repository.login(email, password)
}

class VerifyAuthCodeLoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, authCode: String) =
        repository.verifyAuthCodeLogin(tempToken, authCode)
}

class ChangePasswordUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, newPassword: String) = repository.changePassword(tempToken, newPassword)
}

class LogoutUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke() = repository.logout()
}

class SaveTokensUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(accessToken: String, refreshToken: String) = repository.saveTokens(accessToken, refreshToken)
}

class SaveHospitalInfoUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(id: String, name: String, logoUrl: String) = repository.saveHospitalInfo(id, name, logoUrl)
}
