package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.os.CountDownTimer
import android.text.Editable
import android.text.TextWatcher
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityOtpBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class OtpActivity : AppCompatActivity() {
    private lateinit var binding: ActivityOtpBinding
    private var tempToken: String? = null
    private var countDownTimer: CountDownTimer? = null
    private var isResendEnabled = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityOtpBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tempToken = intent.getStringExtra("tempToken")

        setupUI()
        startCountdown()
    }

    private fun setupUI() {
        // Auto-verify when OTP length is 6
        binding.etOtp.addTextChangedListener(object : TextWatcher {
            override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
            override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
            override fun afterTextChanged(s: Editable?) {
                if (s?.length == 6) {
                    verifyOtp(s.toString())
                }
                binding.tvError.visibility = android.view.View.GONE
            }
        })

        binding.btnVerify.setOnClickListener {
            val otp = binding.etOtp.text.toString()
            if (otp.length == 6) {
                verifyOtp(otp)
            } else {
                showError("Please enter a valid 6-digit OTP")
            }
        }

        binding.btnResend.setOnClickListener {
            if (isResendEnabled) {
                resendOtp()
            }
        }

        binding.btnBackToLogin.setOnClickListener {
            finish()
        }
    }

    private fun startCountdown() {
        isResendEnabled = false
        binding.btnResend.isEnabled = false
        binding.tvCountdown.visibility = android.view.View.VISIBLE

        countDownTimer?.cancel()
        countDownTimer = object : CountDownTimer(30000, 1000) {
            override fun onTick(millisUntilFinished: Long) {
                val seconds = millisUntilFinished / 1000
                binding.tvCountdown.text = "Resend in ${seconds}s"
            }

            override fun onFinish() {
                isResendEnabled = true
                binding.btnResend.isEnabled = true
                binding.tvCountdown.visibility = android.view.View.GONE
            }
        }.start()
    }

    private fun verifyOtp(otp: String) {
        binding.progressBar.visibility = android.view.View.VISIBLE
        binding.btnVerify.isEnabled = false
        binding.tvError.visibility = android.view.View.GONE

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val apiService = RetrofitClient.getApiService(this@OtpActivity)
                val authHeader = "Bearer ${tempToken ?: ""}"
                val response = apiService.verifyOtp(authHeader, mapOf("otp" to otp))

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE
                    binding.btnVerify.isEnabled = true

                    if (response.isSuccessful && response.body()?.get("success") == true) {
                        // Extract hospital info from response
                        val data = response.body()?.get("data") as? Map<*, *>
                        val hospital = data?.get("hospital") as? Map<*, *>
                        
                        if (hospital != null) {
                            val hospitalId = hospital["_id"] as? String ?: ""
                            val hospitalName = hospital["hospitalName"] as? String ?: ""
                            val logoUrl = hospital["logoUrl"] as? String ?: ""
                            
                            // Save hospital info
                            val sharedPrefs = getSharedPreferences("HospitalPrefs", MODE_PRIVATE)
                            sharedPrefs.edit().apply {
                                putString("hospital_id", hospitalId)
                                putString("hospital_name", hospitalName)
                                putString("hospital_logo_url", logoUrl)
                                apply()
                            }
                        }
                        
                        // Cookies (accessToken, refreshToken) are automatically stored by CookieJar
                        Toast.makeText(this@OtpActivity, "OTP verified successfully", Toast.LENGTH_SHORT).show()
                        val intent = Intent(this@OtpActivity, DashboardActivity::class.java)
                        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                        startActivity(intent)
                        finish()
                    } else {
                        val errorMsg = response.body()?.get("message") as? String ?: "Verification failed"
                        showError(errorMsg)
                        binding.etOtp.text?.clear()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE
                    binding.btnVerify.isEnabled = true
                    showError("Error: ${e.message}")
                    binding.etOtp.text?.clear()
                }
            }
        }
    }

    private fun resendOtp() {
        binding.progressBar.visibility = android.view.View.VISIBLE
        binding.btnResend.isEnabled = false

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val apiService = RetrofitClient.getApiService(this@OtpActivity)
                val authHeader = "Bearer ${tempToken ?: ""}"
                val response = apiService.resendOtp(authHeader)

                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE

                    if (response.isSuccessful && response.body()?.get("success") == true) {
                        Toast.makeText(this@OtpActivity, "OTP resent successfully", Toast.LENGTH_SHORT).show()
                        binding.etOtp.text?.clear()
                        binding.tvError.visibility = android.view.View.GONE
                        startCountdown()
                    } else {
                        val errorMsg = response.body()?.get("message") as? String ?: "Failed to resend OTP"
                        showError(errorMsg)
                        binding.btnResend.isEnabled = true
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = android.view.View.GONE
                    showError("Error: ${e.message}")
                    binding.btnResend.isEnabled = true
                }
            }
        }
    }

    private fun showError(message: String) {
        binding.tvError.text = message
        binding.tvError.visibility = android.view.View.VISIBLE
    }

    override fun onDestroy() {
        super.onDestroy()
        countDownTimer?.cancel()
    }
}
