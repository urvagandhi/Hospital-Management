package com.hospital.management.data.models

import com.google.gson.annotations.SerializedName

data class LoginResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("requirePasswordChange") val requirePasswordChange: Boolean? = null,
    @SerializedName("requireAuthCode") val requireAuthCode: Boolean? = null,
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
    @SerializedName("data") val data: PasswordChangeData? = null
)

data class PasswordChangeData(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("hospital") val hospital: Hospital
)

// ── Auth Code verification (step 2 of login) ─────────────────────────────────

data class AuthCodeVerifyRequest(
    @SerializedName("authCode") val authCode: String
)

data class AuthCodeVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: AuthCodeVerifyData? = null
)

data class AuthCodeVerifyData(
    @SerializedName("accessToken") val accessToken: String,
    @SerializedName("refreshToken") val refreshToken: String,
    @SerializedName("tokenType") val tokenType: String? = null,
    @SerializedName("expiresIn") val expiresIn: String? = null,
    @SerializedName("hospital") val hospital: Hospital
)

data class HospitalResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("data") val data: Hospital? = null
)
