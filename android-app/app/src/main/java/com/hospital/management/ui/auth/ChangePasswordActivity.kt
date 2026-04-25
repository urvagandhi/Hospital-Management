package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.ChangePasswordResponse
import com.hospital.management.databinding.ActivityChangePasswordBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Response

class ChangePasswordActivity : BaseActivity() {
    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityChangePasswordBinding
    private lateinit var tokenManager: TokenManager
    private var tempToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChangePasswordBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        tempToken = intent.getStringExtra("tempToken")

        if (tempToken == null) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        binding.btnChangePassword.setOnClickListener {
            val newPassword = binding.etNewPassword.text.toString()
            val confirmPassword = binding.etConfirmPassword.text.toString()

            // Reset errors
            binding.tilNewPassword.error = null
            binding.tilConfirmPassword.error = null

            when {
                newPassword.isEmpty() -> {
                    binding.tilNewPassword.error = "Password is required"
                }
                newPassword.length < 8 -> {
                    binding.tilNewPassword.error = "Password must be at least 8 characters"
                }
                !newPassword.any { it.isUpperCase() } -> {
                    binding.tilNewPassword.error = "Must contain an uppercase letter"
                }
                !newPassword.any { it.isLowerCase() } -> {
                    binding.tilNewPassword.error = "Must contain a lowercase letter"
                }
                !newPassword.any { it.isDigit() } -> {
                    binding.tilNewPassword.error = "Must contain a number"
                }
                !newPassword.any { !it.isLetterOrDigit() } -> {
                    binding.tilNewPassword.error = "Must contain a special character"
                }
                newPassword != confirmPassword -> {
                    binding.tilConfirmPassword.error = "Passwords do not match"
                }
                else -> {
                    changePassword(newPassword)
                }
            }
        }
    }

    private fun changePassword(newPassword: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnChangePassword.isEnabled = false

        lifecycleScope.launch {
            try {
                val apiService = RetrofitClient.getApiService(this@ChangePasswordActivity)
                val response: Response<ChangePasswordResponse> = withContext(Dispatchers.IO) {
                    apiService.changePassword(
                        authorization = "Bearer $tempToken",
                        body = mapOf("newPassword" to newPassword)
                    )
                }

                binding.progressBar.visibility = View.GONE
                binding.btnChangePassword.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    val at = data?.accessToken
                    val rt = data?.refreshToken
                    val hospital = data?.hospital
                    if (at != null && rt != null && hospital != null) {
                        tokenManager.saveTokens(at, rt)
                        tokenManager.saveHospitalInfo(
                            hospital._id,
                            hospital.hospitalName,
                            hospital.logoUrl ?: ""
                        )

                        Toast.makeText(
                            this@ChangePasswordActivity,
                            "Password changed successfully",
                            Toast.LENGTH_SHORT
                        ).show()
                        navigateToDashboard()
                    } else {
                        Toast.makeText(
                            this@ChangePasswordActivity,
                            "Invalid response from server",
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                } else {
                    val errorMsg = response.body()?.message ?: "Password change failed"
                    Toast.makeText(this@ChangePasswordActivity, errorMsg, Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.btnChangePassword.isEnabled = true
                Toast.makeText(
                    this@ChangePasswordActivity,
                    "Error: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
