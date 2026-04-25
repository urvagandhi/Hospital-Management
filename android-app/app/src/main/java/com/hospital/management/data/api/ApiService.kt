package com.hospital.management.data.api

import com.google.gson.annotations.SerializedName
import com.hospital.management.data.models.*
import okhttp3.MultipartBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.*

data class ZipDownloadRequest(
    @SerializedName("selectedFolders") val selectedFolders: List<String>
)

interface ApiService {

        // Fetch current authenticated hospital info
        @GET("/api/hospitals/me")
        suspend fun getCurrentHospital(): Response<com.hospital.management.data.models.HospitalResponse>

        // Fetch hospital info by ID
        @GET("/api/hospitals/{id}")
        suspend fun getHospitalById(@Path("id") id: String): Response<com.hospital.management.data.models.HospitalResponse>
    @POST("/api/auth/login")
    suspend fun login(@Body body: LoginRequest): Response<LoginResponse>

    // ── Self-service registration ──
    @POST("/api/auth/register")
    suspend fun registerSelfService(
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/register/verify-otp")
    suspend fun verifyRegistrationOtp(
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/register/resend-otp")
    suspend fun resendRegistrationOtp(
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @POST("/api/auth/change-password")
    suspend fun changePassword(
        @Header("Authorization") authorization: String,
        @Body body: Map<String, String>
    ): Response<ChangePasswordResponse>

    @POST("/api/auth/login/verify-auth-code")
    suspend fun verifyAuthCodeLogin(
        @Header("Authorization") bearer: String,
        @Body body: AuthCodeVerifyRequest
    ): Response<AuthCodeVerifyResponse>

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
    @POST("/api/auth/logout")
    @JvmSuppressWildcards
    suspend fun logout(@Body body: Map<String, String> = emptyMap()): Response<Map<String, Any>>

    @GET("/api/auth/session/validate")
    suspend fun validateSession(): Response<Map<String, Any>>

    @POST("/api/auth/session/check-conflict")
    suspend fun checkSessionConflict(@Body body: Map<String, String>): Response<Map<String, Any>>

    @POST("/api/auth/session/reverify-auth-code")
    suspend fun reverifyAuthCode(@Body body: Map<String, String>): Response<Map<String, Any>>

    // ── Forgot password (Task #27) ──
    @POST("/api/auth/forgot-password/init")
    suspend fun forgotPasswordInit(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.ForgotInitResponse>

    @POST("/api/auth/forgot-password/verify")
    suspend fun forgotPasswordVerify(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.ForgotVerifyResponse>

    @POST("/api/auth/forgot-password/reset")
    suspend fun forgotPasswordReset(
        @Header("Authorization") bearer: String,
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.GenericMessageResponse>

    // ── Settings-based change password (Task #28) ──
    @POST("/api/auth/password/change")
    suspend fun changePasswordSettings(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.GenericMessageResponse>

    // ── Profile management (Task #28) ──
    @PATCH("/api/hospitals/me")
    suspend fun patchProfile(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.HospitalResponse>

    @Multipart
    @PATCH("/api/hospitals/me")
    suspend fun patchProfileMultipart(
        @Part logo: MultipartBody.Part,
        @Part("hospitalName") hospitalName: okhttp3.RequestBody? = null,
        @Part("address") address: okhttp3.RequestBody? = null
    ): Response<com.hospital.management.data.models.HospitalResponse>

    @POST("/api/hospitals/me/change-contact/init")
    suspend fun initContactChange(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.ContactChangeInitResponse>

    @POST("/api/hospitals/me/change-contact/verify")
    suspend fun verifyContactChange(
        @Body body: Map<String, String>
    ): Response<com.hospital.management.data.models.HospitalResponse>

    // ── Session management (Task #28) ──
    @GET("/api/auth/session/list")
    suspend fun listSessions(): Response<com.hospital.management.data.models.SessionListResponse>

    @POST("/api/auth/session/revoke/{id}")
    suspend fun revokeSession(@Path("id") id: String): Response<com.hospital.management.data.models.GenericMessageResponse>

    @POST("/api/auth/session/revoke-all-others")
    suspend fun revokeAllOtherSessions(): Response<Map<String, Any>>

    // Health check
    @GET("/api/health")
    suspend fun healthCheck(): Response<Map<String, Any>>

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
        @Part file: MultipartBody.Part,
        @Header("Idempotency-Key") idempotencyKey: String,
        @Header("X-Upload-Profile") uploadProfileUsed: Int
    ): Response<Map<String, Any>>

    @PATCH("/api/patients/{patientId}/files/{folderName}/{fileId}/rename")
    suspend fun renameFile(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String,
        @Path("fileId") fileId: String,
        @Body body: Map<String, String>
    ): Response<Map<String, Any>>

    @DELETE("/api/patients/{patientId}/files/{folderName}/{fileId}")
    suspend fun deleteFile(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String,
        @Path("fileId") fileId: String
    ): Response<Map<String, Any>>

    // ── Download endpoints ──

    @GET("/api/patients/{patientId}/download/zip/size-check")
    suspend fun checkZipSize(@Path("patientId") patientId: String): Response<Map<String, Any>>

    @POST("/api/patients/{patientId}/download/zip")
    @Streaming
    suspend fun downloadPatientZip(
        @Path("patientId") patientId: String,
        @Body body: ZipDownloadRequest
    ): Response<ResponseBody>

    @POST("/api/patients/{patientId}/download/zip")
    @Streaming
    suspend fun downloadPatientZipAll(
        @Path("patientId") patientId: String
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

    // ── App Version (B3 / A1) — public endpoint ──
    @GET("/api/version")
    suspend fun getAppVersion(
        @Query("platform") platform: String = "android",
        @Query("currentVersion") currentVersion: String
    ): Response<com.hospital.management.data.models.AppVersionResponse>

    // ── Notification Preferences (B6 / A4) ──
    @GET("/api/hospitals/me/notification-preferences")
    suspend fun getNotificationPreferences(): Response<com.hospital.management.data.models.NotificationPrefsResponse>

    @PUT("/api/hospitals/me/notification-preferences")
    suspend fun updateNotificationPreferences(
        @Body body: Map<String, Boolean>
    ): Response<com.hospital.management.data.models.NotificationPrefsResponse>

    // ── Signed URL (B5 / A3) ──
    @GET("/api/patients/{patientId}/files/{folderName}/{fileId}/signed-url")
    suspend fun getFileSignedUrl(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String,
        @Path("fileId") fileId: String,
        @Query("download") download: Boolean = false
    ): Response<com.hospital.management.data.models.SignedUrlResponse>

    // ── Compressed file download (Phase 3B) ──
    @Streaming
    @GET("/api/patients/{patientId}/files/{folderName}/{fileId}/compressed")
    suspend fun downloadFileCompressed(
        @Path("patientId") patientId: String,
        @Path("folderName") folderName: String,
        @Path("fileId") fileId: String,
    ): Response<okhttp3.ResponseBody>
}
