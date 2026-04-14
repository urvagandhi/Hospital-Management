package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.databinding.ActivityForgotPasswordResetBinding
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Step 3 of 3 — set the new password using the PASSWORD_RESET temp token
 * from the previous step. On success, all sessions are revoked server-side
 * and the user is sent back to Login.
 */
class ForgotPasswordResetActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityForgotPasswordResetBinding
    private lateinit var authViewModel: AuthViewModel
    private lateinit var tempToken: String

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityForgotPasswordResetBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tempToken = intent.getStringExtra("tempToken").orEmpty()
        if (tempToken.isEmpty()) {
            GlassSnackbar.show(this, "Session expired. Please start over.", GlassSnackbar.Variant.ERROR)
            finish()
            return
        }

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepo)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]

        binding.btnReset.setOnClickListener { submit() }
        observeState()
    }

    private fun submit() {
        val newPw = binding.etNewPassword.text.toString()
        val confirm = binding.etConfirmPassword.text.toString()
        binding.tilNewPassword.error = null
        binding.tilConfirmPassword.error = null

        val err = validatePasswordPolicy(newPw)
        if (err != null) {
            binding.tilNewPassword.error = err
            return
        }
        if (newPw != confirm) {
            binding.tilConfirmPassword.error = "Passwords do not match"
            return
        }
        authViewModel.forgotReset(tempToken, newPw)
    }

    private fun validatePasswordPolicy(pw: String): String? {
        if (pw.length < 8) return "Password must be at least 8 characters"
        if (!pw.any { it.isUpperCase() }) return "Password must contain an uppercase letter"
        if (!pw.any { it.isLowerCase() }) return "Password must contain a lowercase letter"
        if (!pw.any { it.isDigit() }) return "Password must contain a number"
        if (pw.all { it.isLetterOrDigit() }) return "Password must contain a special character"
        return null
    }

    private fun observeState() {
        lifecycleScope.launch {
            authViewModel.forgotState.collect { state ->
                when (state) {
                    is AuthViewModel.ForgotState.Loading -> {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.btnReset.isEnabled = false
                    }
                    is AuthViewModel.ForgotState.ResetDone -> {
                        binding.loadingOverlay.visibility = View.GONE
                        AlertDialog.Builder(this@ForgotPasswordResetActivity)
                            .setTitle("Password Reset")
                            .setMessage("Your password has been reset. Please sign in with your new password.")
                            .setPositiveButton("Go to Login") { _, _ ->
                                val intent = Intent(this@ForgotPasswordResetActivity, LoginActivity::class.java)
                                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                                startActivity(intent)
                                finish()
                            }
                            .setCancelable(false)
                            .show()
                        authViewModel.resetForgotState()
                    }
                    is AuthViewModel.ForgotState.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnReset.isEnabled = true
                        GlassSnackbar.show(this@ForgotPasswordResetActivity, state.message, GlassSnackbar.Variant.ERROR)
                        authViewModel.resetForgotState()
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnReset.isEnabled = true
                    }
                }
            }
        }
    }
}
