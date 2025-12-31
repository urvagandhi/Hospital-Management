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
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.presentation.viewmodel.AuthState
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.utils.BiometricHelper
import com.hospital.management.utils.SessionManager
import com.hospital.management.data.local.TokenManager
import android.view.View
import androidx.lifecycle.lifecycleScope

class LoginActivity : AppCompatActivity() {

    private lateinit var binding: ActivityLoginBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var biometricHelper: BiometricHelper
    private lateinit var authViewModel: AuthViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityLoginBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        biometricHelper = BiometricHelper(this)

        setupViewModel()
        setupObservers()
        setupListeners()
        setupBiometricLogin()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val authRepository = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepository)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]
    }

    private fun setupListeners() {
        binding.btnLogin.setOnClickListener {
            val email = binding.etHospitalId.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            // Reset errors
            binding.tilEmail.error = null
            binding.tilPassword.error = null

            var isValid = true

            if (email.isEmpty()) {
                binding.tilEmail.error = "Email is required"
                isValid = false
            } else if (!android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()) {
                binding.tilEmail.error = "Invalid email format"
                isValid = false
            }

            if (password.isEmpty()) {
                binding.tilPassword.error = "Password is required"
                isValid = false
            }

            if (isValid) {
                authViewModel.login(email, password)
            }
        }
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            authViewModel.authState.collect { state ->
                when (state) {
                    is AuthState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.btnLogin.isEnabled = false
                    }
                    is AuthState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        handleSuccessState(state)
                    }
                    is AuthState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        Toast.makeText(this@LoginActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                    }
                }
            }
        }
    }

    private fun handleSuccessState(state: AuthState.Success) {
        val message = state.message
        val data = state.data // tempToken or status code or data object

        when (message) {
            "Password change required" -> {
                val intent = Intent(this, ChangePasswordActivity::class.java)
                intent.putExtra("tempToken", data as? String)
                startActivity(intent)
                finish()
            }
            "TOTP verification required" -> {
                val intent = Intent(this, TotpVerificationActivity::class.java)
                intent.putExtra("tempToken", data as? String)
                startActivity(intent)
                finish()
            }
            "TOTP Setup Required" -> {
                SessionManager.startSession(this)
                Toast.makeText(this, "Please setup 2FA", Toast.LENGTH_LONG).show()
                startActivity(Intent(this, TotpSetupActivity::class.java))
                finish()
            }
            "Login successful" -> {
                SessionManager.startSession(this)

                // Save credentials for future biometric login if successful
                val email = binding.etHospitalId.text.toString()
                val password = binding.etPassword.text.toString()
                if (email.isNotEmpty() && password.isNotEmpty()) {
                     lifecycleScope.launch { tokenManager.saveCredentials(email, password) }
                }

                val intent = Intent(this, DashboardActivity::class.java)
                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                startActivity(intent)
                finish()
            }
            else -> {
                 // Check if it's just an OTP sent message
                 if (data is String && data.isNotEmpty()) {
                     // Assume OTP flow? (Legacy)
                 }
            }
        }
    }

    private fun setupBiometricLogin() {
        lifecycleScope.launch {
            val email = withContext(Dispatchers.IO) { tokenManager.getEmail() }
            val password = withContext(Dispatchers.IO) { tokenManager.getPassword() }

            if (!email.isNullOrEmpty() && !password.isNullOrEmpty() && biometricHelper.isBiometricAvailable()) {
                binding.btnBiometric.visibility = View.VISIBLE
                binding.btnBiometric.setOnClickListener {
                    biometricHelper.showBiometricPrompt(
                        this@LoginActivity,
                        onSuccess = {
                            authViewModel.login(email, password)
                        },
                        onError = {
                            Toast.makeText(this@LoginActivity, "Authentication failed", Toast.LENGTH_SHORT).show()
                        }
                    )
                }
            }
        }
    }


}

