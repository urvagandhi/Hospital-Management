package com.hospital.management.data.models


import com.google.gson.annotations.SerializedName

data class Hospital(
    @SerializedName("_id") val _id: String,
    @SerializedName("hospitalName") val hospitalName: String,
    @SerializedName("authCode") val authCode: String? = null,
    @SerializedName("email") val email: String,
    @SerializedName("phone") val phone: String,
    @SerializedName("logoUrl") val logoUrl: String? = null,
    @SerializedName("role") val role: String? = "hospital",
    @SerializedName("address") val address: String? = null,
    @SerializedName("city") val city: String? = null,
    @SerializedName("state") val state: String? = null,
    @SerializedName("zipCode") val zipCode: String? = null,
    @SerializedName("isActive") val isActive: Boolean = true,
    @SerializedName("notificationPrefs") val notificationPrefs: NotificationPrefs? = null
) {
    val isAdmin: Boolean get() = role == "admin"
}

data class NotificationPrefs(
    @SerializedName("newLoginAlert") val newLoginAlert: Boolean = true,
    @SerializedName("securityAlerts") val securityAlerts: Boolean = true,
    @SerializedName("marketing") val marketing: Boolean = false
)

data class AppVersionInfo(
    @SerializedName("updateRequired") val updateRequired: Boolean = false,
    @SerializedName("forceUpdate") val forceUpdate: Boolean = false,
    @SerializedName("latestVersion") val latestVersion: String = "",
    @SerializedName("minVersion") val minVersion: String = "",
    @SerializedName("updateUrl") val updateUrl: String = "",
    @SerializedName("releaseNotes") val releaseNotes: String = ""
)

data class AppVersionResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: AppVersionInfo
)

data class NotificationPrefsResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: NotificationPrefs
)

data class SignedUrlInfo(
    @SerializedName("url") val url: String,
    @SerializedName("expiresIn") val expiresIn: Int? = null,
    @SerializedName("accessMode") val accessMode: String = "public"
)

data class SignedUrlResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("data") val data: SignedUrlInfo
)
