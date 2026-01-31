package com.hospital.management.data.models

data class PatientRequest(
    val patientName: String,
    val dateOfBirth: String,
    val phone: String,
    val email: String? = null,
    val medicalRecordNumber: String,
    val notes: String? = null
)
