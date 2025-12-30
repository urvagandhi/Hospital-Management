package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.models.ChangePasswordResponse
import com.hospital.management.databinding.ActivityChangePasswordBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Response

class ChangePasswordActivity : AppCompatActivity() {
    private lateinit var binding: ActivityChangePasswordBinding
    private var tempToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChangePasswordBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tempToken = intent.getStringExtra("tempToken")
        
        if (tempToken == null) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        binding.btnChangePassword.setOnClickListener {
            val newPassword = binding.etNewPassword.text.toString()
            val confirmPassword = binding.etConfirmPassword.text.toString()

            when {
                newPassword.isEmpty() -> {
                    binding.tilNewPassword.error = "Password is required"
                }
                newPassword.length < 6 -> {
                    binding.tilNewPassword.error = "Password must be at least 6 characters"
                }
                newPassword != confirmPassword -> {
                    binding.tilConfirmPassword.error = "Passwords do not match"
                }
                else -> {
                    binding.tilNewPassword.error = null
                    binding.tilConfirmPassword.error = null
                    changePassword(newPassword)
                }
            }
        }
    }

    private fun changePassword(newPassword: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnChangePassword.isEnabled = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val apiService = RetrofitClient.getApiService(this@ChangePasswordActivity)
                val response: Response<ChangePasswordResponse> = apiService.changePassword(
                    authorization = "Bearer $tempToken",
                    body = mapOf("newPassword" to newPassword)
                )

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    binding.btnChangePassword.isEnabled = true

                    if (response.isSuccessful && response.body()?.success == true) {
                        val data = response.body()?.data
                        if (data != null) {
                            // Save tokens
                            saveTokens(data.accessToken, data.refreshToken)
                            
                            Toast.makeText(
                                this@ChangePasswordActivity,
                                "Password changed successfully",
                                Toast.LENGTH_SHORT
                            ).show()

                            // Navigate to TOTP setup if required
                            if (response.body()?.requireTotpSetup == true) {
                                val intent = Intent(this@ChangePasswordActivity, TotpSetupActivity::class.java)
                                startActivity(intent)
                                finish()
                            } else {
                                navigateToDashboard()
                            }
                        }
                    } else {
                        val errorMsg = response.body()?.message ?: "Password change failed"
                        Toast.makeText(this@ChangePasswordActivity, errorMsg, Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
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
    }

    private fun saveTokens(accessToken: String, refreshToken: String) {
        val sharedPrefs = getSharedPreferences("hospital_prefs", MODE_PRIVATE)
        sharedPrefs.edit().apply {
            putString("accessToken", accessToken)
            putString("refreshToken", refreshToken)
            apply()
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
