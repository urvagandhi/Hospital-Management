package com.hospital.management.data.models

import com.google.gson.annotations.SerializedName

// Typed request body for POST /api/auth/login.
// Replaces the previous Map<String, Any> body — Gson + R8 + `Any` resolution
// through reflection is a known fragile combo in release builds.
data class LoginRequest(
    @SerializedName("identifier") val identifier: String,
    @SerializedName("email") val email: String,
    @SerializedName("password") val password: String
)

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
    // Gson uses reflection and bypasses Kotlin null checks — treat every server
    // field as nullable to avoid release-only crashes when the backend omits one.
    @SerializedName("accessToken") val accessToken: String? = null,
    @SerializedName("refreshToken") val refreshToken: String? = null,
    @SerializedName("hospital") val hospital: Hospital? = null
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
    // Gson bypasses Kotlin null checks; a missing server field would crash in
    // release with a cryptic NPE/ClassCastException. Keep everything nullable.
    @SerializedName("accessToken") val accessToken: String? = null,
    @SerializedName("refreshToken") val refreshToken: String? = null,
    @SerializedName("tokenType") val tokenType: String? = null,
    @SerializedName("expiresIn") val expiresIn: String? = null,
    @SerializedName("hospital") val hospital: Hospital? = null
)

data class HospitalResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String? = null,
    @SerializedName("data") val data: Hospital? = null
)
