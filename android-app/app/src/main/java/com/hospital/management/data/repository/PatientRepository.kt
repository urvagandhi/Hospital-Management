package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.PatientRequest
import kotlinx.coroutines.flow.first
import retrofit2.Response

class PatientRepository(
    private val apiService: ApiService,
    private val tokenManager: TokenManager
) {
    
    suspend fun createPatient(patientRequest: PatientRequest): Response<Map<String, Any>> {
        return apiService.createPatient(patientRequest)
    }
    
    suspend fun getPatients(limit: Int = 20, skip: Int = 0): Response<Map<String, Any>> {
        return apiService.getPatients(limit, skip)
    }
    
    suspend fun getPatientById(patientId: String): Response<Map<String, Any>> {
        return apiService.getPatientById(patientId)
    }
    
    suspend fun updatePatient(patientId: String, patientData: Map<String, String>): Response<Map<String, Any>> {
        return apiService.updatePatient(patientId, patientData)
    }
    
    suspend fun createFolder(patientId: String, folderName: String): Response<Map<String, Any>> {
        return apiService.createFolder(patientId, mapOf("folderName" to folderName))
    }
    
    suspend fun getFolderFiles(patientId: String, folderName: String): Response<Map<String, Any>> {
        return apiService.getFolderFiles(patientId, folderName)
    }
    
    suspend fun uploadFile(
        patientId: String, 
        folderName: String, 
        file: okhttp3.MultipartBody.Part
    ): Response<Map<String, Any>> {
        return apiService.uploadFile(patientId, folderName, file)
    }
    
    suspend fun downloadFolderPdf(patientId: String, folderName: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadFolderPdf(patientId, folderName)
    }
    
    suspend fun downloadAllPdf(patientId: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadAllPdf(patientId)
    }
    
    suspend fun downloadFolderZip(patientId: String, folderName: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadFolderZip(patientId, folderName)
    }
    
    suspend fun downloadAllZip(patientId: String): Response<okhttp3.ResponseBody> {
        return apiService.downloadAllZip(patientId)
    }
}
