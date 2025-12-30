package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.models.LoginResponse
import com.hospital.management.databinding.ActivityLoginBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : AppCompatActivity() {
    private lateinit var binding: ActivityLoginBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        binding.btnLogin.setOnClickListener {
            val email = binding.etHospitalId.text.toString()
            val password = binding.etPassword.text.toString()

            if (email.isNotEmpty() && password.isNotEmpty()) {
                login(email, password)
            } else {
                Toast.makeText(this, "Please enter Email and Password", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun login(email: String, password: String) {
        binding.progressBar.visibility = android.view.View.VISIBLE
        binding.btnLogin.isEnabled = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val apiService = RetrofitClient.getApiService(this@LoginActivity)
                val response = apiService.login(mapOf("email" to email, "password" to password))

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE
                    binding.btnLogin.isEnabled = true

                    if (response.isSuccessful && response.body()?.success == true) {
                        handleLoginResponse(response.body()!!)
                    } else {
                        val errorMsg = response.body()?.message ?: "Login failed: ${response.message()}"
                        Toast.makeText(this@LoginActivity, errorMsg, Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE
                    binding.btnLogin.isEnabled = true
                    Toast.makeText(this@LoginActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun handleLoginResponse(loginResponse: LoginResponse) {
        val data = loginResponse.data

        when {
            // First login - must change password
            loginResponse.requirePasswordChange == true && data?.tempToken != null -> {
                val intent = Intent(this, ChangePasswordActivity::class.java)
                intent.putExtra("tempToken", data.tempToken)
                intent.putExtra("hospitalName", data.hospitalName)
                startActivity(intent)
                finish()
            }

            // TOTP verification required (subsequent logins)
            loginResponse.requireTotp == true && data?.tempToken != null -> {
                val intent = Intent(this, TotpVerificationActivity::class.java)
                intent.putExtra("tempToken", data.tempToken)
                intent.putExtra("hospitalName", data.hospitalName)
                startActivity(intent)
                finish()
            }

            // Password changed but TOTP not set up yet
            loginResponse.requireTotpSetup == true && data?.accessToken != null -> {
                saveTokens(data.accessToken, data.refreshToken ?: "")
                val intent = Intent(this, TotpSetupActivity::class.java)
                startActivity(intent)
                finish()
            }

            // Normal login - already has TOTP configured
            data?.accessToken != null -> {
                saveTokens(data.accessToken, data.refreshToken ?: "")
                val intent = Intent(this, DashboardActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }

            else -> {
                Toast.makeText(this, "Unexpected login response", Toast.LENGTH_SHORT).show()
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
}

