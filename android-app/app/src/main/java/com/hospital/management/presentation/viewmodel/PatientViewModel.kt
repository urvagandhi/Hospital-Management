package com.hospital.management.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.hospital.management.data.models.FileItem
import com.hospital.management.data.models.Folder
import com.hospital.management.data.models.Patient
import com.hospital.management.data.models.PatientRequest
import com.hospital.management.domain.usecase.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.MultipartBody
import okhttp3.ResponseBody

sealed class PatientState {
    object Idle : PatientState()
    object Loading : PatientState()
    data class Success(val message: String? = null, val data: Any? = null) : PatientState()
    data class Error(val message: String) : PatientState()
}

class PatientViewModel(
    private val getPatientsUseCase: GetPatientsUseCase,
    private val createPatientUseCase: CreatePatientUseCase,
    private val getPatientByIdUseCase: GetPatientByIdUseCase,
    private val createFolderUseCase: CreateFolderUseCase,
    private val getFolderFilesUseCase: GetFolderFilesUseCase,
    private val uploadFileUseCase: UploadFileUseCase,
    private val downloadFolderPdfUseCase: DownloadFolderPdfUseCase,
    private val downloadAllPdfUseCase: DownloadAllPdfUseCase,
    private val downloadFolderZipUseCase: DownloadFolderZipUseCase,
    private val downloadAllZipUseCase: DownloadAllZipUseCase,
    private val updatePatientUseCase: UpdatePatientUseCase
) : ViewModel() {

    private val _patientState = MutableStateFlow<PatientState>(PatientState.Idle)
    val patientState: StateFlow<PatientState> = _patientState.asStateFlow()

    private val _patients = MutableStateFlow<List<Patient>>(emptyList())
    val patients: StateFlow<List<Patient>> = _patients.asStateFlow()

    private val _currentPatient = MutableStateFlow<Patient?>(null)
    val currentPatient: StateFlow<Patient?> = _currentPatient.asStateFlow()

    private val _currentFolderFiles = MutableStateFlow<List<FileItem>>(emptyList())
    val currentFolderFiles: StateFlow<List<FileItem>> = _currentFolderFiles.asStateFlow()

    private val gson = Gson()

    fun getPatients(limit: Int = 20, skip: Int = 0, search: String? = null) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = getPatientsUseCase(limit, skip, search)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    if (body.success) {
                        _patients.value = body.data.patients
                        _patientState.value = PatientState.Success("Patients loaded")
                    } else {
                        _patientState.value = PatientState.Error(body.message ?: "Failed to fetch patients")
                    }
                } else {
                    _patientState.value = PatientState.Error("Failed to fetch patients")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Network error")
            }
        }
    }

    fun getPatientById(id: String) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            // Reset current patient to force re-emission of StateFlow
            // This ensures observers always get notified when data is refreshed
            _currentPatient.value = null
            try {
                val response = getPatientByIdUseCase(id)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val data = body["data"]
                    if (data != null) {
                         try {
                            val json = gson.toJson(data)
                            val patient: Patient = gson.fromJson(json, Patient::class.java)
                            _currentPatient.value = patient
                            _patientState.value = PatientState.Success("Patient loaded")
                        } catch (e: Exception) {
                             _patientState.value = PatientState.Error("Error parsing patient data: ${e.message}")
                        }
                    } else {
                        _patientState.value = PatientState.Error("Patient not found")
                    }
                } else {
                    _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Failed to fetch patient")
                }
            } catch (e: Exception) {
                 _patientState.value = PatientState.Error(e.message ?: "Network error")
            }
        }
    }

    fun createPatient(request: PatientRequest) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = createPatientUseCase(request)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    _patientState.value = PatientState.Success("Patient created successfully")
                    getPatients() // Refresh list
                } else {
                     _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Failed to create patient")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Error creating patient")
            }
        }
    }

    fun updatePatient(id: String, data: Map<String, String>) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = updatePatientUseCase(id, data)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    _patientState.value = PatientState.Success("Patient updated successfully")
                    getPatientById(id) // Refresh details
                } else {
                     _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Failed to update patient")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Error updating patient")
            }
        }
    }

    fun createFolder(patientId: String, folderName: String) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = createFolderUseCase(patientId, folderName)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    _patientState.value = PatientState.Success("Folder created")
                    getPatientById(patientId) // Refresh to show new folder
                } else {
                    _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Failed to create folder")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Network error")
            }
        }
    }

    fun getFolderFiles(patientId: String, folderName: String) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = getFolderFilesUseCase(patientId, folderName)
                if (response.isSuccessful && response.body() != null) {
                    val body = response.body()!!
                    val data = body["data"]
                     if (data != null) {
                        try {
                            val json = gson.toJson(data)
                            // Backend returns a folder object with 'files' array, not a direct list
                            // Try parsing as Folder first
                            val folder: Folder = gson.fromJson(json, Folder::class.java)
                            _currentFolderFiles.value = folder.files
                            _patientState.value = PatientState.Success("Files loaded")
                        } catch (e: Exception) {
                            // Fallback: try parsing as direct list
                            try {
                                val json = gson.toJson(data)
                                val listType = object : TypeToken<List<FileItem>>() {}.type
                                val files: List<FileItem> = gson.fromJson(json, listType)
                                _currentFolderFiles.value = files
                                _patientState.value = PatientState.Success("Files loaded")
                            } catch (e2: Exception) {
                                // Both failed - show empty
                                _currentFolderFiles.value = emptyList()
                                _patientState.value = PatientState.Success("Files loaded")
                            }
                        }
                     } else {
                         _currentFolderFiles.value = emptyList()
                         _patientState.value = PatientState.Success("Files loaded")
                     }
                } else {
                    _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Failed to fetch files")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Network error")
            }
        }
    }

    fun uploadFile(patientId: String, folderName: String, file: MultipartBody.Part) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = uploadFileUseCase(patientId, folderName, file)
                if (response.isSuccessful && response.body()?.get("success") == true) {
                    _patientState.value = PatientState.Success("File uploaded successfully")
                    getFolderFiles(patientId, folderName) // Refresh files
                } else {
                    _patientState.value = PatientState.Error(response.body()?.get("message") as? String ?: "Upload failed")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Error uploading file")
            }
        }
    }

    fun downloadFolderPdf(patientId: String, folderName: String) {
        initiateDownload("PDF") { downloadFolderPdfUseCase(patientId, folderName) }
    }

    fun downloadAllPdf(patientId: String) {
        initiateDownload("PDF") { downloadAllPdfUseCase(patientId) }
    }

    fun downloadFolderZip(patientId: String, folderName: String) {
        initiateDownload("ZIP") { downloadFolderZipUseCase(patientId, folderName) }
    }

    fun downloadAllZip(patientId: String) {
        initiateDownload("ZIP") { downloadAllZipUseCase(patientId) }
    }

    private fun initiateDownload(type: String, downloadCall: suspend () -> retrofit2.Response<ResponseBody>) {
        viewModelScope.launch {
            _patientState.value = PatientState.Loading
            try {
                val response = downloadCall()
                if (response.isSuccessful && response.body() != null) {
                    _patientState.value = PatientState.Success("$type Ready", response.body())
                } else {
                    _patientState.value = PatientState.Error("Download failed")
                }
            } catch (e: Exception) {
                _patientState.value = PatientState.Error(e.message ?: "Network error during download")
            }
        }
    }

    fun resetState() {
        _patientState.value = PatientState.Idle
    }
}
