package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.models.LoginResponse
import com.hospital.management.databinding.ActivityTotpVerificationBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Response

class TotpVerificationActivity : AppCompatActivity() {
    private lateinit var binding: ActivityTotpVerificationBinding
    private var tempToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTotpVerificationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tempToken = intent.getStringExtra("tempToken")
        val hospitalName = intent.getStringExtra("hospitalName")

        if (tempToken == null) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        if (hospitalName != null) {
            binding.tvSubtitle.text = "Enter the code from your authenticator app for $hospitalName"
        }

        binding.btnVerify.setOnClickListener {
            val totpCode = binding.etTotpCode.text.toString()
            if (totpCode.length == 6) {
                verifyTotp(totpCode)
            } else {
                Toast.makeText(this, "Please enter a 6-digit code", Toast.LENGTH_SHORT).show()
            }
        }

        binding.tvBackupCode.setOnClickListener {
            // TODO: Implement backup code dialog
            Toast.makeText(this, "Backup code feature coming soon", Toast.LENGTH_SHORT).show()
        }
    }

    private fun verifyTotp(totpCode: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val apiService = RetrofitClient.getApiService(this@TotpVerificationActivity)
                val authHeader = "Bearer ${tempToken ?: ""}"
                val response: Response<LoginResponse> = apiService.verifyTotpLogin(
                    authHeader,
                    mapOf("token" to totpCode)
                )

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    binding.btnVerify.isEnabled = true

                    if (response.isSuccessful && response.body()?.success == true) {
                        val data = response.body()?.data
                        if (data?.accessToken != null && data.refreshToken != null) {
                            // Save tokens
                            saveTokens(data.accessToken, data.refreshToken)
                            
                            Toast.makeText(
                                this@TotpVerificationActivity,
                                "Login successful",
                                Toast.LENGTH_SHORT
                            ).show()
                            
                            navigateToDashboard()
                        } else {
                            Toast.makeText(
                                this@TotpVerificationActivity,
                                "Invalid response from server",
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    } else {
                        val errorMsg = response.body()?.message ?: "Verification failed"
                        Toast.makeText(
                            this@TotpVerificationActivity,
                            errorMsg,
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    binding.btnVerify.isEnabled = true
                    Toast.makeText(
                        this@TotpVerificationActivity,
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
