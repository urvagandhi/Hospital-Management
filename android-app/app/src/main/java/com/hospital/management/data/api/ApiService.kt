package com.hospital.management.data.api

import com.hospital.management.data.models.*
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

interface ApiService {

        // Fetch current authenticated hospital info
        @GET("/api/hospitals/me")
        suspend fun getCurrentHospital(): Response<com.hospital.management.data.models.HospitalResponse>

        // Fetch hospital info by ID
        @GET("/api/hospitals/{id}")
        suspend fun getHospitalById(@Path("id") id: String): Response<com.hospital.management.data.models.HospitalResponse>
    @POST("/api/auth/login")
    @JvmSuppressWildcards
    suspend fun login(@Body body: Map<String, Any>): Response<LoginResponse>

    @POST("/api/auth/change-password")
    suspend fun changePassword(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<ChangePasswordResponse>

    @POST("/api/auth/2fa/setup")
    suspend fun setupTotp(
        @Header("Authorization") authorization: String
    ): Response<TotpSetupResponse>

    @POST("/api/auth/2fa/verify")
    suspend fun verifyTotpSetup(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<TotpVerifyResponse>

    @POST("/api/auth/verify-otp")
    suspend fun verifyOtp(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/resend-otp")
    suspend fun resendOtp(
        @Header("Authorization") authorization: String
    ): Response<Map<String, Any>>

    @POST("/api/auth/login/totp")
    suspend fun verifyTotpLogin(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<LoginResponse>

    @POST("/api/auth/login/recovery")
    suspend fun recoveryLogin(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    // Biometric endpoints
    @POST("/api/auth/biometric/register")
    suspend fun registerBiometric(
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/biometric/challenge")
    suspend fun biometricChallenge(
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/biometric/verify")
    suspend fun verifyBiometric(
        @Body body: Map<String, String>
    ): Response<LoginResponse>

    // Session management
    @GET("/api/auth/session/validate")
    suspend fun validateSession(): Response<Map<String, Any>>

    @POST("/api/auth/session/check-conflict")
    suspend fun checkSessionConflict(@Body body: Map<String, String>): Response<Map<String, Any>>

    @POST("/api/auth/session/force-logout")
    suspend fun forceLogoutOtherSessions(): Response<Map<String, Any>>

    // Health check
    @GET("/api/health")
    suspend fun healthCheck(): Response<Map<String, Any>>

    // Export archive
    @POST("/api/export/archive")
    @Streaming
    suspend fun exportArchive(
        @Body body: Map<String, Any>
    ): Response<ResponseBody>

    @POST("/api/patients")
    suspend fun createPatient(
        @Body body: com.hospital.management.data.models.PatientRequest
    ): Response<Map<String, Any>>

    @GET("/api/patients")
    suspend fun getPatients(
        @Query("limit") limit: Int,
        @Query("skip") skip: Int,
        @Query("search") search: String? = null
    ): Response<PatientsResponse>

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

    // ── Download endpoints ──

    @GET("/api/patients/{patientId}/download/zip/size-check")
    suspend fun checkZipSize(@Path("patientId") patientId: String): Response<Map<String, Any>>

    @POST("/api/patients/{patientId}/download/zip")
    @Streaming
    suspend fun downloadPatientZip(
        @Path("patientId") patientId: String,
        @Body body: Map<String, Any>?
    ): Response<ResponseBody>

    @POST("/api/patients/{patientId}/download/pdf")
    @Streaming
    suspend fun downloadPatientPdf(
        @Path("patientId") patientId: String,
        @Body body: Map<String, String>
    ): Response<ResponseBody>

    @GET("/api/patients/{patientId}/folders/{folderName}/download/zip")
    @Streaming
    suspend fun downloadFolderZip(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String
    ): Response<ResponseBody>

    @GET("/api/patients/{patientId}/folders/{folderName}/download/pdf")
    @Streaming
    suspend fun downloadFolderPdf(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String
    ): Response<ResponseBody>

    // Legacy GET routes (backward compat)
    @GET("/api/patients/{patientId}/download/pdf")
    @Streaming
    suspend fun downloadAllPdfLegacy(@Path("patientId") patientId: String): Response<ResponseBody>

    @GET("/api/patients/{patientId}/download/zip")
    @Streaming
    suspend fun downloadAllZipLegacy(@Path("patientId") patientId: String): Response<ResponseBody>

    // FCM token registration
    @POST("/api/auth/fcm-token")
    suspend fun postFcmToken(@Body body: Map<String, String>): Response<Map<String, Any>>
}
