package com.hospital.management.data.models

data class Hospital(
    val _id: String,
    val hospitalName: String,
    val email: String,
    val phone: String,
    val logoUrl: String,
    val department: String? = null,
    val address: String? = null,
    val city: String? = null,
    val state: String? = null,
    val zipCode: String? = null,
    val isActive: Boolean = true
)
