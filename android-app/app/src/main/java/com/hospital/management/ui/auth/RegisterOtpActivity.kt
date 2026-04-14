package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.os.CountDownTimer
import android.view.View
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityRegisterOtpBinding
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.DesignAnimations
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Step 2 of self-service registration. Verifies the 6-digit OTP; on success
 * the server creates the hospital account and the user is routed back to the
 * login screen with the email pre-filled.
 *
 * Resend is rate-limited server-side to once per 60 seconds; the UI mirrors
 * that with a countdown so the user knows when they can try again.
 */
class RegisterOtpActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityRegisterOtpBinding
    private lateinit var email: String
    private var resendTimer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterOtpBinding.inflate(layoutInflater)
        setContentView(binding.root)

        email = intent.getStringExtra("email").orEmpty()
        if (email.isEmpty()) {
            GlassSnackbar.show(this, "Missing email. Please restart registration.", GlassSnackbar.Variant.ERROR)
            finish()
            return
        }
        binding.tvEmail.text = email

        DesignAnimations.attachPressScale(binding.btnVerify)

        binding.btnVerify.setOnClickListener { verify() }
        binding.tvResend.setOnClickListener { resend() }
        binding.tvBackToLogin.setOnClickListener {
            startActivity(Intent(this, LoginActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            })
            finish()
        }

        // Backend arms the 60s cooldown at /register; reflect it here.
        startResendCooldown(60)
    }

    override fun onDestroy() {
        resendTimer?.cancel()
        super.onDestroy()
    }

    private fun startResendCooldown(seconds: Int) {
        resendTimer?.cancel()
        binding.tvResend.isEnabled = false
        resendTimer = object : CountDownTimer(seconds * 1000L, 1000L) {
            override fun onTick(ms: Long) {
                binding.tvResend.text = "Resend OTP in ${ms / 1000}s"
            }
            override fun onFinish() {
                binding.tvResend.text = "Resend OTP"
                binding.tvResend.isEnabled = true
            }
        }.start()
    }

    private fun verify() {
        val otp = binding.etOtp.text.toString().trim()
        binding.tilOtp.error = null
        if (!otp.matches(Regex("^\\d{6}$"))) {
            binding.tilOtp.error = "Enter the 6-digit code"
            return
        }

        binding.loadingOverlay.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@RegisterOtpActivity)
                        .verifyRegistrationOtp(mapOf("email" to email, "otp" to otp))
                }

                binding.loadingOverlay.visibility = View.GONE
                binding.btnVerify.isEnabled = true

                if (response.isSuccessful && response.body()?.get("success") == true) {
                    GlassSnackbar.show(
                        this@RegisterOtpActivity,
                        "Account created! Please sign in.",
                        GlassSnackbar.Variant.SUCCESS,
                    )
                    // Route to Login with email prefilled so the user can sign in immediately.
                    val intent = Intent(this@RegisterOtpActivity, LoginActivity::class.java)
                    intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    intent.putExtra("prefillEmail", email)
                    startActivity(intent)
                    finish()
                } else {
                    val msg = response.body()?.get("message") as? String
                        ?: "Verification failed (${response.code()})"
                    GlassSnackbar.show(this@RegisterOtpActivity, msg, GlassSnackbar.Variant.ERROR)
                }
            } catch (e: Exception) {
                binding.loadingOverlay.visibility = View.GONE
                binding.btnVerify.isEnabled = true
                GlassSnackbar.show(
                    this@RegisterOtpActivity,
                    "Network error: ${e.message ?: "please try again"}",
                    GlassSnackbar.Variant.ERROR,
                )
            }
        }
    }

    private fun resend() {
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.tvResend.isEnabled = false

        lifecycleScope.launch {
            try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@RegisterOtpActivity)
                        .resendRegistrationOtp(mapOf("email" to email))
                }

                binding.loadingOverlay.visibility = View.GONE

                if (response.isSuccessful && response.body()?.get("success") == true) {
                    GlassSnackbar.show(
                        this@RegisterOtpActivity,
                        "A new OTP has been sent.",
                        GlassSnackbar.Variant.SUCCESS,
                    )
                    startResendCooldown(60)
                } else {
                    // On 429 the server returns retryAfterSeconds; honor it in the timer.
                    val data = response.body()?.get("data") as? Map<*, *>
                    val retry = (data?.get("retryAfterSeconds") as? Number)?.toInt() ?: 60
                    val msg = response.body()?.get("message") as? String
                        ?: "Unable to resend OTP"
                    GlassSnackbar.show(this@RegisterOtpActivity, msg, GlassSnackbar.Variant.ERROR)
                    startResendCooldown(retry)
                }
            } catch (e: Exception) {
                binding.loadingOverlay.visibility = View.GONE
                binding.tvResend.isEnabled = true
                binding.tvResend.text = "Resend OTP"
                GlassSnackbar.show(
                    this@RegisterOtpActivity,
                    "Network error: ${e.message ?: "please try again"}",
                    GlassSnackbar.Variant.ERROR,
                )
            }
        }
    }
}
