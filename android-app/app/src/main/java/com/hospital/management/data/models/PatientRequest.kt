package com.hospital.management.data.models

data class PatientRequest(
    val patientName: String,
    val remarks: String? = null
)
