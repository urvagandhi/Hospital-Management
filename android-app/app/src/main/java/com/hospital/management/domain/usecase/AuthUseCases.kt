package com.hospital.management.domain.usecase

import com.hospital.management.data.repository.AuthRepository

class LoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(email: String, password: String, isBiometric: Boolean = false) = repository.login(email, password, isBiometric)
}

class VerifyOtpUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, otp: String) = repository.verifyOtp(tempToken, otp)
}

class ResendOtpUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String) = repository.resendOtp(tempToken)
}

class ChangePasswordUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, newPassword: String) = repository.changePassword(tempToken, newPassword)
}

class SetupTotpUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke() = repository.setupTotp()
}

class VerifyTotpSetupUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(totp: String) = repository.verifyTotpSetup(totp)
}

class VerifyTotpLoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, totp: String) = repository.verifyTotpLogin(tempToken, totp)
}

class RecoveryLoginUseCase(private val repository: AuthRepository) {
    suspend operator fun invoke(tempToken: String, recoveryCode: String) = repository.recoveryLogin(tempToken, recoveryCode)
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
