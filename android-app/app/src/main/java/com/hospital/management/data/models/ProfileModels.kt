package com.hospital.management.data.models

import com.google.gson.annotations.SerializedName

// ═══════════════════════════════════════════════════════════════════════════
// Forgot password flow (Task #27)
// ═══════════════════════════════════════════════════════════════════════════

data class ForgotInitResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: ForgotInitData? = null
)

data class ForgotInitData(
    @SerializedName("otpExpiresInSeconds") val otpExpiresInSeconds: Int? = null,
    @SerializedName("resendAvailableInSeconds") val resendAvailableInSeconds: Int? = null,
    @SerializedName("retryAfterSeconds") val retryAfterSeconds: Int? = null
)

data class ForgotVerifyResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: ForgotVerifyData? = null
)

data class ForgotVerifyData(
    @SerializedName("tempToken") val tempToken: String? = null,
    @SerializedName("expiresInSeconds") val expiresInSeconds: Int? = null,
    @SerializedName("attemptsLeft") val attemptsLeft: Int? = null
)

data class GenericMessageResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String
)

// ═══════════════════════════════════════════════════════════════════════════
// Profile / Contact-change (Task #28)
// ═══════════════════════════════════════════════════════════════════════════

data class ContactChangeInitResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String,
    @SerializedName("data") val data: ContactChangeInitData? = null
)

data class ContactChangeInitData(
    @SerializedName("field") val field: String? = null,
    @SerializedName("otpChannel") val otpChannel: String? = null,
    @SerializedName("otpExpiresInSeconds") val otpExpiresInSeconds: Int? = null
)

// ═══════════════════════════════════════════════════════════════════════════
// Session listing
// ═══════════════════════════════════════════════════════════════════════════

data class SessionListResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: List<SessionItem> = emptyList()
)

data class SessionItem(
    @SerializedName("_id") val id: String,
    @SerializedName("platform") val platform: String? = null,
    @SerializedName("isMobile") val isMobile: Boolean? = null,
    @SerializedName("userAgent") val userAgent: String? = null,
    @SerializedName("ipAddress") val ipAddress: String? = null,
    @SerializedName("lastSeenAt") val lastSeenAt: String? = null,
    @SerializedName("createdAt") val createdAt: String? = null,
    @SerializedName("isCurrent") val isCurrent: Boolean? = null
)
