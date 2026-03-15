package com.hospital.management.domain.usecase

import com.hospital.management.data.models.PatientRequest
import com.hospital.management.data.repository.PatientRepository
import okhttp3.MultipartBody

class CreatePatientUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientRequest: PatientRequest) =
        repository.createPatient(patientRequest)
}

class GetPatientsUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(limit: Int = 20, skip: Int = 0, search: String? = null) =
        repository.getPatients(limit, skip, search)
}

class GetPatientByIdUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String) =
        repository.getPatientById(patientId)
}

class UploadFileUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, folderName: String, file: MultipartBody.Part) =
        repository.uploadFile(patientId, folderName, file)
}

class DownloadFolderPdfUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, folderName: String) =
        repository.downloadFolderPdf(patientId, folderName)
}

class DownloadAllPdfUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String) =
        repository.downloadAllPdf(patientId)
}

class DownloadFolderZipUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, folderName: String) =
        repository.downloadFolderZip(patientId, folderName)
}

class DownloadAllZipUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String) =
        repository.downloadAllZip(patientId)
}

class CreateFolderUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, folderName: String) =
        repository.createFolder(patientId, folderName)
}

class GetFolderFilesUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, folderName: String) =
        repository.getFolderFiles(patientId, folderName)
}

class UpdatePatientUseCase(private val repository: PatientRepository) {
    suspend operator fun invoke(patientId: String, data: Map<String, String>) =
        repository.updatePatient(patientId, data)
}
