package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.os.CountDownTimer
import android.view.View
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.databinding.ActivityForgotPasswordOtpBinding
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Step 2 of 3 — verify forgot-password OTP.
 *
 * On success, receives a PASSWORD_RESET temp token and proceeds to the
 * reset screen. 60-second resend cooldown mirrors the backend.
 */
class ForgotPasswordOtpActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityForgotPasswordOtpBinding
    private lateinit var authViewModel: AuthViewModel
    private lateinit var identifier: String
    private var resendTimer: CountDownTimer? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityForgotPasswordOtpBinding.inflate(layoutInflater)
        setContentView(binding.root)

        identifier = intent.getStringExtra("identifier").orEmpty()
        if (identifier.isEmpty()) {
            GlassSnackbar.show(this, "Missing identifier. Please start over.", GlassSnackbar.Variant.ERROR)
            finish()
            return
        }
        binding.tvIdentifier.text = identifier

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepo)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]

        binding.btnVerify.setOnClickListener { verify() }
        binding.tvResend.setOnClickListener { resend() }
        binding.tvBack.setOnClickListener { finish() }

        startResendCooldown(60)
        observeState()
    }

    override fun onDestroy() {
        resendTimer?.cancel()
        super.onDestroy()
    }

    private fun startResendCooldown(seconds: Int) {
        resendTimer?.cancel()
        binding.tvResend.isEnabled = false
        resendTimer = object : CountDownTimer(seconds * 1000L, 1000L) {
            override fun onTick(ms: Long) { binding.tvResend.text = "Resend in ${ms / 1000}s" }
            override fun onFinish() {
                binding.tvResend.text = "Resend Code"
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
        authViewModel.forgotVerify(identifier, otp)
    }

    private fun resend() {
        authViewModel.forgotInit(identifier)
    }

    private fun observeState() {
        lifecycleScope.launch {
            authViewModel.forgotState.collect { state ->
                when (state) {
                    is AuthViewModel.ForgotState.Loading -> {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.btnVerify.isEnabled = false
                    }
                    is AuthViewModel.ForgotState.InitSent -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnVerify.isEnabled = true
                        GlassSnackbar.show(this@ForgotPasswordOtpActivity, state.message, GlassSnackbar.Variant.SUCCESS)
                        startResendCooldown(60)
                        authViewModel.resetForgotState()
                    }
                    is AuthViewModel.ForgotState.Verified -> {
                        binding.loadingOverlay.visibility = View.GONE
                        val intent = Intent(this@ForgotPasswordOtpActivity, ForgotPasswordResetActivity::class.java)
                        intent.putExtra("tempToken", state.tempToken)
                        startActivity(intent)
                        authViewModel.resetForgotState()
                        finish()
                    }
                    is AuthViewModel.ForgotState.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnVerify.isEnabled = true
                        GlassSnackbar.show(this@ForgotPasswordOtpActivity, state.message, GlassSnackbar.Variant.ERROR)
                        binding.etOtp.setText("")
                        authViewModel.resetForgotState()
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnVerify.isEnabled = true
                    }
                }
            }
        }
    }
}
