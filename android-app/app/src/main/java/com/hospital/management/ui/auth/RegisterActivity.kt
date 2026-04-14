package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import android.util.Patterns
import android.view.View
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityRegisterBinding
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.DesignAnimations
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Step 1 of self-service hospital registration. Collects hospital details,
 * triggers the backend to send an OTP to the email, then routes the user to
 * [RegisterOtpActivity] to verify it.
 */
class RegisterActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivityRegisterBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityRegisterBinding.inflate(layoutInflater)
        setContentView(binding.root)

        DesignAnimations.attachPressScale(binding.btnRegister)

        binding.btnRegister.setOnClickListener { submit() }
        binding.tvBackToLogin.setOnClickListener { finish() }
    }

    private fun submit() {
        val hospitalName = binding.etHospitalName.text.toString().trim()
        val email = binding.etEmail.text.toString().trim().lowercase()
        val phone = binding.etPhone.text.toString().trim()
        val password = binding.etPassword.text.toString()
        val address = binding.etAddress.text.toString().trim()

        // Clear prior errors
        binding.tilHospitalName.error = null
        binding.tilEmail.error = null
        binding.tilPhone.error = null
        binding.tilPassword.error = null

        var valid = true
        if (hospitalName.length < 3) {
            binding.tilHospitalName.error = "Hospital name must be at least 3 characters"
            valid = false
        }
        if (!Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
            binding.tilEmail.error = "Invalid email"
            valid = false
        }
        if (!phone.matches(Regex("^\\d{10}$"))) {
            binding.tilPhone.error = "Enter 10-digit phone number"
            valid = false
        }
        // Mirror backend strength rules so users get immediate, matching feedback.
        val pwErr = when {
            password.length < 8 -> "Password must be at least 8 characters"
            !password.any { it.isUpperCase() } -> "Password needs an uppercase letter"
            !password.any { it.isLowerCase() } -> "Password needs a lowercase letter"
            !password.any { it.isDigit() } -> "Password needs a digit"
            !password.any { !it.isLetterOrDigit() } -> "Password needs a special character"
            else -> null
        }
        if (pwErr != null) {
            binding.tilPassword.error = pwErr
            valid = false
        }
        if (!valid) return

        binding.loadingOverlay.visibility = View.VISIBLE
        binding.btnRegister.isEnabled = false

        lifecycleScope.launch {
            try {
                val body = mutableMapOf(
                    "hospitalName" to hospitalName,
                    "email" to email,
                    "phone" to phone,
                    "password" to password,
                )
                if (address.isNotEmpty()) body["address"] = address

                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@RegisterActivity).registerSelfService(body)
                }

                binding.loadingOverlay.visibility = View.GONE
                binding.btnRegister.isEnabled = true

                if (response.isSuccessful && response.body()?.get("success") == true) {
                    val intent = Intent(this@RegisterActivity, RegisterOtpActivity::class.java)
                    intent.putExtra("email", email)
                    startActivity(intent)
                    finish()
                } else {
                    val msg = response.body()?.get("message") as? String
                        ?: "Registration failed (${response.code()})"
                    GlassSnackbar.show(this@RegisterActivity, msg, GlassSnackbar.Variant.ERROR)
                }
            } catch (e: Exception) {
                binding.loadingOverlay.visibility = View.GONE
                binding.btnRegister.isEnabled = true
                GlassSnackbar.show(
                    this@RegisterActivity,
                    "Network error: ${e.message ?: "please try again"}",
                    GlassSnackbar.Variant.ERROR,
                )
            }
        }
    }
}
