package com.hospital.management.data.models

data class Patient(
    val _id: String,
    val patientId: String,
    val patientName: String,
    val remarks: String? = null,
    val hospitalId: String,
    val folders: List<Folder>,
    val createdAt: String
)

data class Folder(
    val name: String,
    val files: List<FileItem>,
    private val _fileCount: Int? = null
) {
    val fileCount: Int
        get() = _fileCount ?: files.size
}

data class FileItem(
    val _id: String? = null,
    val fileName: String,
    val fileUrl: String? = null,
    val url: String? = null,
    val size: Long = 0,
    val mimeType: String? = null,
    val uploadedAt: String? = null
) {
    val name: String get() = fileName
    val displayUrl: String get() = fileUrl ?: url ?: ""
}

data class PatientsResponse(
    val success: Boolean,
    val data: PatientsData,
    val message: String?
)

data class PatientsData(
    val patients: List<Patient>,
    val total: Int,
    val limit: Int,
    val skip: Int
)

data class ZipSizeCheckResponse(
    val success: Boolean,
    val overLimit: Boolean,
    val totalSize: Long,
    val folders: List<FolderSizeInfo>?
)

data class FolderSizeInfo(
    val name: String,
    val size: Long,
    val fileCount: Int
)
