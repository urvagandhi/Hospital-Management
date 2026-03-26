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
            val identifier = binding.etHospitalId.text.toString().trim()
            val password = binding.etPassword.text.toString().trim()

            // Reset errors
            binding.tilEmail.error = null
            binding.tilPassword.error = null

            var isValid = true

            if (identifier.isEmpty()) {
                binding.tilEmail.error = "Email, phone, or username is required"
                isValid = false
            } else {
                // Validate based on detected type
                when {
                    identifier.contains("@") -> {
                        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(identifier).matches()) {
                            binding.tilEmail.error = "Invalid email format"
                            isValid = false
                        }
                    }
                    identifier.startsWith("+") || identifier.all { it.isDigit() } && identifier.length in 7..15 -> {
                        // Phone - basic check
                        val cleaned = identifier.replace(Regex("[\\s\\-()]"), "")
                        if (!cleaned.matches(Regex("^\\+?[1-9]\\d{6,14}$"))) {
                            binding.tilEmail.error = "Invalid phone number"
                            isValid = false
                        }
                    }
                    else -> {
                        // Username
                        if (identifier.length < 4) {
                            binding.tilEmail.error = "Username must be at least 4 characters"
                            isValid = false
                        }
                    }
                }
            }

            if (password.isEmpty()) {
                binding.tilPassword.error = "Password is required"
                isValid = false
            }

            if (isValid) {
                authViewModel.login(identifier, password)
            }
        }
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            authViewModel.authState.collect { state ->
                when (state) {
                    is AuthState.Loading -> {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.btnLogin.isEnabled = false
                    }
                    is AuthState.Success -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        handleSuccessState(state)
                    }
                    is AuthState.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        Toast.makeText(this@LoginActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                    }
                }
            }
        }
    }

    private suspend fun handleSuccessState(state: AuthState.Success) {
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

                // Enable biometric for future logins (tokens already saved by ViewModel)
                lifecycleScope.launch {
                    tokenManager.setBiometricEnabled(true)
                    val identifier = binding.etHospitalId.text.toString().trim()
                    if (identifier.isNotEmpty()) tokenManager.saveEmail(identifier)
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
            val biometricEnabled = withContext(Dispatchers.IO) { tokenManager.isBiometricEnabled() }
            val hasToken = withContext(Dispatchers.IO) { tokenManager.hasValidToken() }

            if (biometricEnabled && hasToken && biometricHelper.isBiometricAvailable()) {
                val email = withContext(Dispatchers.IO) { tokenManager.getEmail() }
                if (!email.isNullOrEmpty()) {
                    binding.etHospitalId.setText(email)
                }
                binding.btnBiometric.visibility = View.VISIBLE
                binding.btnBiometric.setOnClickListener {
                    biometricHelper.showBiometricPrompt(
                        this@LoginActivity,
                        onSuccess = {
                            // Use existing refresh token to get new session
                            lifecycleScope.launch {
                                SessionManager.startSession(this@LoginActivity)
                                val intent = Intent(this@LoginActivity, DashboardActivity::class.java)
                                intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                                startActivity(intent)
                                finish()
                            }
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

