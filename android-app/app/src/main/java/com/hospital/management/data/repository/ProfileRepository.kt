package com.hospital.management.data.repository

import com.hospital.management.data.api.ApiService
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import java.io.File

/**
 * Repository for the profile + contact-change endpoints (Task #28).
 * Keeps Retrofit wiring out of the ViewModels.
 */
class ProfileRepository(private val apiService: ApiService) {

    suspend fun getCurrentHospital() = apiService.getCurrentHospital()

    /**
     * PATCH /api/hospitals/me — non-sensitive fields only.
     * Email / phone changes MUST go through initContactChange + verifyContactChange.
     */
    suspend fun patchProfile(
        hospitalName: String? = null,
        address: String? = null,
        logoFile: File? = null,
    ) = if (logoFile != null) {
        val mime = when (logoFile.extension.lowercase()) {
            "png" -> "image/png"
            "webp" -> "image/webp"
            "gif" -> "image/gif"
            else -> "image/jpeg"
        }
        val part = MultipartBody.Part.createFormData(
            "logo", logoFile.name, logoFile.asRequestBody(mime.toMediaTypeOrNull())
        )
        val nameBody = hospitalName?.toRequestBody("text/plain".toMediaTypeOrNull())
        val addressBody = address?.toRequestBody("text/plain".toMediaTypeOrNull())
        apiService.patchProfileMultipart(part, nameBody, addressBody)
    } else {
        val body = mutableMapOf<String, String>()
        hospitalName?.let { body["hospitalName"] = it }
        address?.let { body["address"] = it }
        apiService.patchProfile(body)
    }

    suspend fun initContactChange(newEmail: String?, newPhone: String?) =
        apiService.initContactChange(
            buildMap {
                newEmail?.let { put("newEmail", it) }
                newPhone?.let { put("newPhone", it) }
            }
        )

    suspend fun verifyContactChange(otp: String) =
        apiService.verifyContactChange(mapOf("otp" to otp))
}
