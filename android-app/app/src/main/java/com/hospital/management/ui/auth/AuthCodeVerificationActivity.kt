package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.AuthCodeVerifyRequest
import com.hospital.management.databinding.ActivityAuthCodeVerificationBinding
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.dashboard.DashboardActivity
import com.hospital.management.ui.components.GlassSnackbar
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class AuthCodeVerificationActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityAuthCodeVerificationBinding
    private lateinit var tokenManager: TokenManager
    private var tempToken: String? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAuthCodeVerificationBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        tempToken = intent.getStringExtra("tempToken")

        if (tempToken == null) {
            Toast.makeText(this, "Session expired. Please login again.", Toast.LENGTH_SHORT).show()
            finish()
            return
        }

        // Auto-submit when 6 digits entered
        binding.etAuthCode.addTextChangedListener(object : android.text.TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: android.text.Editable?) {
                binding.tilAuthCode.error = null
                if (s?.length == 6) {
                    verifyAuthCode(s.toString())
                }
            }
        })

        binding.btnVerify.setOnClickListener {
            val code = binding.etAuthCode.text.toString()
            if (code.length == 6) {
                verifyAuthCode(code)
            } else {
                binding.tilAuthCode.error = "Please enter a 6-digit Auth Code"
            }
        }

        binding.tvBackToLogin.setOnClickListener {
            finish()
        }
    }

    private fun verifyAuthCode(code: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false
        binding.etAuthCode.isEnabled = false

        lifecycleScope.launch {
            try {
                val apiService = RetrofitClient.getApiService(this@AuthCodeVerificationActivity)
                val response = withContext(Dispatchers.IO) {
                    apiService.verifyAuthCodeLogin(
                        "Bearer ${tempToken ?: ""}",
                        AuthCodeVerifyRequest(code)
                    )
                }

                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true
                binding.etAuthCode.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data?.accessToken != null && data.refreshToken != null) {
                        withContext(Dispatchers.IO) {
                            tokenManager.saveTokens(data.accessToken, data.refreshToken)
                            tokenManager.saveHospitalInfo(
                                data.hospital._id,
                                data.hospital.hospitalName,
                                data.hospital.logoUrl ?: ""
                            )
                        }
                        SessionManager.startSession(this@AuthCodeVerificationActivity)
                        navigateToDashboard()
                    } else {
                        GlassSnackbar.show(this@AuthCodeVerificationActivity, "Invalid response from server", GlassSnackbar.Variant.ERROR)
                    }
                } else {
                    val errorMsg = response.body()?.message ?: "Invalid Auth Code. Please try again."
                    binding.tilAuthCode.error = errorMsg
                    binding.etAuthCode.text?.clear()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true
                binding.etAuthCode.isEnabled = true
                GlassSnackbar.show(this@AuthCodeVerificationActivity, "Error: ${e.message}", GlassSnackbar.Variant.ERROR)
                binding.etAuthCode.text?.clear()
            }
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    override fun onBackPressed() {
        // Allow back — user can return to login
        finish()
    }
}
