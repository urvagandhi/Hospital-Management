package com.hospital.management.data.models

import com.google.gson.annotations.SerializedName

data class LoginResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("requirePasswordChange") val requirePasswordChange: Boolean? = null,
    @SerializedName("requireTotp") val requireTotp: Boolean? = null,
    @SerializedName("requireTotpSetup") val requireTotpSetup: Boolean? = null,
    @SerializedName("data") val data: LoginData? = null
)

data class LoginData(
    @SerializedName("tempToken") val tempToken: String? = null,
    @SerializedName("accessToken") val accessToken: String? = null,
    @SerializedName("refreshToken") val refreshToken: String? = null,
    @SerializedName("hospital") val hospital: Hospital? = null,
    @SerializedName("hospitalName") val hospitalName: String? = null,
    @SerializedName("logoUrl") val logoUrl: String? = null
)

data class ChangePasswordResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("requireTotpSetup") val requireTotpSetup: Boolean? = null,
    @SerializedName("data") val data: PasswordChangeData? = null
)

data class PasswordChangeData(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("hospital") val hospital: Hospital
)

data class TotpSetupResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: TotpSetupData? = null
)

data class TotpSetupData(
    @SerializedName("qrCodeUrl") val qrCodeUrl: String,
    @SerializedName("secret") val secret: String,
    @SerializedName("issuer") val issuer: String
)

data class TotpVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: TotpVerifyData? = null
)

data class TotpVerifyData(
    @SerializedName("backupCodes") val backupCodes: List<String>
)

data class HospitalResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("data") val data: Hospital? = null
)
