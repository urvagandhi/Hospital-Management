package com.hospital.management.data.models

data class LoginResponse(
    val success: Boolean,
    val message: String,
    val requirePasswordChange: Boolean? = null,
    val requireTotp: Boolean? = null,
    val requireTotpSetup: Boolean? = null,
    val data: LoginData? = null
)

data class LoginData(
    val tempToken: String? = null,
    val accessToken: String? = null,
    val refreshToken: String? = null,
    val hospital: Hospital? = null,
    val hospitalName: String? = null,
    val logoUrl: String? = null
)

data class ChangePasswordResponse(
    val success: Boolean,
    val message: String,
    val requireTotpSetup: Boolean? = null,
    val data: PasswordChangeData? = null
)

data class PasswordChangeData(
    val accessToken: String,
    val refreshToken: String,
    val hospital: Hospital
)

data class TotpSetupResponse(
    val success: Boolean,
    val message: String,
    val data: TotpSetupData? = null
)

data class TotpSetupData(
    val qrCodeUrl: String,
    val secret: String,
    val issuer: String
)

data class TotpVerifyResponse(
    val success: Boolean,
    val message: String,
    val data: TotpVerifyData? = null
)

data class TotpVerifyData(
    val backupCodes: List<String>
)
