package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.view.View
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.databinding.ActivityForgotPasswordBinding
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Step 1 of 3 — public forgot-password flow.
 *
 * User enters email or phone → POST /auth/forgot-password/init.
 * Backend is enumeration-safe (always returns 200 unless rate-limited);
 * we proceed to the OTP screen regardless.
 */
class ForgotPasswordActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityForgotPasswordBinding
    private lateinit var authViewModel: AuthViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityForgotPasswordBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepo)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]

        binding.btnSendCode.setOnClickListener { submit() }
        binding.tvBackToLogin.setOnClickListener { finish() }

        observeState()
    }

    private fun submit() {
        val identifier = binding.etIdentifier.text.toString().trim()
        binding.tilIdentifier.error = null

        if (identifier.isEmpty()) {
            binding.tilIdentifier.error = "Email or phone number is required"
            return
        }

        val isEmail = identifier.contains("@")
        val cleaned = identifier.replace(Regex("[\\s\\-()]"), "")
        val isPhone = cleaned.matches(Regex("^\\+?\\d{7,15}$"))

        if (isEmail && !Patterns.EMAIL_ADDRESS.matcher(identifier).matches()) {
            binding.tilIdentifier.error = "Invalid email format"
            return
        }
        if (!isEmail && !isPhone) {
            binding.tilIdentifier.error = "Please enter a valid email or phone number"
            return
        }

        authViewModel.forgotInit(identifier)
    }

    private fun observeState() {
        lifecycleScope.launch {
            authViewModel.forgotState.collect { state ->
                when (state) {
                    is AuthViewModel.ForgotState.Loading -> {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.btnSendCode.isEnabled = false
                    }
                    is AuthViewModel.ForgotState.InitSent -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnSendCode.isEnabled = true
                        GlassSnackbar.show(this@ForgotPasswordActivity, state.message, GlassSnackbar.Variant.SUCCESS)
                        val intent = Intent(this@ForgotPasswordActivity, ForgotPasswordOtpActivity::class.java)
                        intent.putExtra("identifier", binding.etIdentifier.text.toString().trim())
                        startActivity(intent)
                        authViewModel.resetForgotState()
                        finish()
                    }
                    is AuthViewModel.ForgotState.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnSendCode.isEnabled = true
                        GlassSnackbar.show(this@ForgotPasswordActivity, state.message, GlassSnackbar.Variant.ERROR)
                        authViewModel.resetForgotState()
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnSendCode.isEnabled = true
                    }
                }
            }
        }
    }
}
