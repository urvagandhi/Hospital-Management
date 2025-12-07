package com.hospital.management.data.api

import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {
    @POST("/api/auth/login")
    suspend fun login(@Body body: Map<String, String>): Response<Map<String, Any>>

    @POST("/api/auth/verify-otp")
    suspend fun verifyOtp(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/resend-otp")
    suspend fun resendOtp(
        @Header("Authorization") authorization: String
    ): Response<Map<String, Any>>

    @POST("/api/patients")
    suspend fun createPatient(
        @Body body: com.hospital.management.data.models.PatientRequest
    ): Response<Map<String, Any>>

    @GET("/api/patients")
    suspend fun getPatients(
        @Query("limit") limit: Int,
        @Query("skip") skip: Int
    ): Response<Map<String, Any>>

    @GET("/api/patients/{patientId}")
    suspend fun getPatientById(
        @Path("patientId") patientId: String
    ): Response<Map<String, Any>>

    @PUT("/api/patients/{patientId}")
    suspend fun updatePatient(
        @Path("patientId") patientId: String,
        @Body patientData: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/patients/{patientId}/folders")
    suspend fun createFolder(
        @Path("patientId") patientId: String,
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @GET("/api/patients/{patientId}/files/{folderName}")
    suspend fun getFolderFiles(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String
    ): Response<Map<String, Any>>

    @Multipart
    @POST("/api/patients/{patientId}/files/{folderName}")
    suspend fun uploadFile(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String,
        @Part file: MultipartBody.Part
    ): Response<Map<String, Any>>

    @GET("/api/patients/{patientId}/download/pdf")
    @Streaming
    suspend fun downloadAllPdf(
        @Path("patientId") patientId: String
    ): Response<ResponseBody>

    @GET("/api/patients/{patientId}/folders/{folderName}/pdf")
    @Streaming
    suspend fun downloadFolderPdf(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String
    ): Response<ResponseBody>

    @GET("/api/patients/{patientId}/download/zip")
    @Streaming
    suspend fun downloadAllZip(
        @Path("patientId") patientId: String
    ): Response<ResponseBody>

    @GET("/api/patients/{patientId}/folders/{folderName}/zip")
    @Streaming
    suspend fun downloadFolderZip(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String
    ): Response<ResponseBody>
}
