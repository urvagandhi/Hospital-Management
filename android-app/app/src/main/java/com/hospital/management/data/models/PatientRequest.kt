package com.hospital.management.data.models

data class PatientRequest(
    val patientName: String,
    val remarks: String? = null
)

data class SignUploadRequest(
    val fileName: String
)

data class SignUploadParams(
    val cloudName: String? = null,
    val apiKey: String? = null,
    val signature: String? = null,
    val timestamp: Long? = null,
    val publicId: String? = null,
    val uploadUrl: String? = null,
    val type: String? = null
)

data class SignUploadResponse(
    val success: Boolean,
    val params: SignUploadParams? = null
)

data class SignSpacesUploadResponse(
    val success: Boolean,
    val presignedUrl: String? = null,
    val key: String? = null,
    val endpoint: String? = null,
    val bucket: String? = null,
    val expires: Long? = null
)

data class ConfirmDirectUploadRequest(
    val publicId: String,
    val secureUrl: String,
    val originalFileName: String,
    val size: Long,
    val mimeType: String,
    val storageProvider: String = "cloudinary"
)

data class DirectUploadConfirmResponse(
    val success: Boolean,
    val data: Patient? = null,
    val message: String? = null
)
