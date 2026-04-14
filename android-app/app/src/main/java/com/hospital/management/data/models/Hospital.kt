package com.hospital.management.data.models


import com.google.gson.annotations.SerializedName

data class Hospital(
    @SerializedName("_id") val _id: String,
    @SerializedName("hospitalName") val hospitalName: String,
    @SerializedName("email") val email: String,
    @SerializedName("phone") val phone: String,
    @SerializedName("logoUrl") val logoUrl: String? = null,
    @SerializedName("role") val role: String? = "hospital",
    @SerializedName("address") val address: String? = null,
    @SerializedName("city") val city: String? = null,
    @SerializedName("state") val state: String? = null,
    @SerializedName("zipCode") val zipCode: String? = null,
    @SerializedName("isActive") val isActive: Boolean = true
) {
    val isAdmin: Boolean get() = role == "admin"
}
