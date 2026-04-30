package com.hospital.management.ui.auth

import android.content.Intent
import android.os.Bundle
import com.hospital.management.utils.FileLogger
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.LoginResponse
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.databinding.ActivityLoginBinding
import com.hospital.management.presentation.viewmodel.AuthState
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.dashboard.DashboardActivity
import com.hospital.management.utils.BiometricHelper
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.DesignAnimations
import com.hospital.management.ui.components.GlassSnackbar
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LoginActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
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

        // Pre-fill identifier after self-registration hands off here.
        intent.getStringExtra("prefillEmail")?.takeIf { it.isNotBlank() }?.let {
            binding.etHospitalId.setText(it)
        }

        binding.tvGoToRegister.setOnClickListener {
            startActivity(Intent(this, RegisterActivity::class.java))
        }

        binding.tvForgotPassword.setOnClickListener {
            startActivity(Intent(this, ForgotPasswordActivity::class.java))
        }

        // Attach press-scale animation to buttons
        DesignAnimations.attachPressScale(binding.btnLogin)
        DesignAnimations.attachPressScale(binding.btnBiometric)
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
                binding.tilEmail.error = "Email or phone number is required"
                isValid = false
            } else {
                // Validate based on detected type (email or phone only)
                when {
                    identifier.contains("@") -> {
                        if (!android.util.Patterns.EMAIL_ADDRESS.matcher(identifier).matches()) {
                            binding.tilEmail.error = "Invalid email format"
                            isValid = false
                        }
                    }
                    identifier.startsWith("+") || identifier.all { it.isDigit() } && identifier.length in 7..15 -> {
                        val cleaned = identifier.replace(Regex("[\\s\\-()]"), "")
                        if (!cleaned.matches(Regex("^\\+?[1-9]\\d{6,14}$"))) {
                            binding.tilEmail.error = "Invalid phone number"
                            isValid = false
                        }
                    }
                    else -> {
                        binding.tilEmail.error = "Please enter a valid email or phone number"
                        isValid = false
                    }
                }
            }

            if (password.isEmpty()) {
                binding.tilPassword.error = "Password is required"
                isValid = false
            }

            if (isValid) {
                checkConflictThenLogin(identifier, password)
            }
        }
    }

    /**
     * Check if another device has an active session before logging in.
     * If conflict exists, show a dialog asking the user to confirm.
     */
    private fun checkConflictThenLogin(identifier: String, password: String) {
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.btnLogin.isEnabled = false

        lifecycleScope.launch {
            try {
                val apiService = RetrofitClient.getApiService(this@LoginActivity)
                val response = withContext(Dispatchers.IO) {
                    apiService.checkSessionConflict(mapOf("identifier" to identifier))
                }

                binding.loadingOverlay.visibility = View.GONE
                binding.btnLogin.isEnabled = true

                if (response.isSuccessful) {
                    val body = response.body()
                    val hasConflict = (body?.get("conflict") as? Boolean) == true

                    if (hasConflict) {
                        val activeDevice = body?.get("activeDevice") as? Map<*, *>
                        val platform = activeDevice?.get("platform") as? String ?: "another device"
                        val sessionLimit = (body?.get("sessionLimit") as? Number)?.toInt() ?: 2

                        MaterialAlertDialogBuilder(this@LoginActivity, R.style.AlertDialogTheme)
                            .setTitle("Active Session Found")
                            .setMessage(
                                "You're already signed in on $platform. " +
                                "This account allows up to $sessionLimit mobile sessions. " +
                                "Continuing will sign out the oldest mobile session."
                            )
                            .setPositiveButton("Continue Login") { _, _ ->
                                authViewModel.login(identifier, password)
                            }
                            .setNegativeButton("Cancel", null)
                            .setCancelable(true)
                            .show()
                    } else {
                        authViewModel.login(identifier, password)
                    }
                } else {
                    // Server error on conflict check — do not silently proceed
                    GlassSnackbar.show(this@LoginActivity, "Unable to verify session. Please try again.", GlassSnackbar.Variant.ERROR)
                }
            } catch (e: Exception) {
                binding.loadingOverlay.visibility = View.GONE
                binding.btnLogin.isEnabled = true
                FileLogger.e("LoginActivity", "Conflict check failed: ${e.javaClass.name}", e)
                com.hospital.management.utils.FileLogger.e(
                    "LoginActivity",
                    "Conflict check failed: ${e.javaClass.name} :: ${e.message}",
                    e
                )
                GlassSnackbar.show(
                    this@LoginActivity,
                    "${e.javaClass.simpleName}: ${e.message ?: "no message"}",
                    GlassSnackbar.Variant.ERROR
                )
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
                    is AuthState.RequireAuthCode -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        val intent = Intent(this@LoginActivity, AuthCodeVerificationActivity::class.java)
                        intent.putExtra("tempToken", state.tempToken)
                        startActivity(intent)
                        finish()
                    }
                    is AuthState.RequirePasswordChange -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        val intent = Intent(this@LoginActivity, ChangePasswordActivity::class.java)
                        intent.putExtra("tempToken", state.tempToken)
                        startActivity(intent)
                        finish()
                    }
                    is AuthState.LoggedIn -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        SessionManager.startSession(this@LoginActivity)

                        // Save identifier for future logins
                        val identifier = binding.etHospitalId.text.toString().trim()
                        if (identifier.isNotEmpty()) tokenManager.saveEmail(identifier)

                        // Register FCM token after successful login
                        com.google.firebase.messaging.FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                            if (task.isSuccessful) {
                                val fcmToken = task.result
                                lifecycleScope.launch {
                                    try {
                                        RetrofitClient.getApiService(this@LoginActivity).postFcmToken(mapOf("fcmToken" to fcmToken))
                                    } catch (e: Exception) {
                                        FileLogger.e("LoginActivity", "Failed to register FCM token", e)
                                    }
                                }
                            }
                        }

                        // Check if biometric is already enabled for THIS hospital (per-account)
                        // or not available on this device.
                        val currentHospitalId = withContext(Dispatchers.IO) { tokenManager.getHospitalId() }
                        val alreadyEnabled = if (currentHospitalId.isNullOrEmpty()) false
                            else withContext(Dispatchers.IO) { tokenManager.isBiometricEnabled(currentHospitalId) }
                        val keyStillValid = currentHospitalId != null && biometricHelper.hasKeyPair(currentHospitalId)
                        if ((alreadyEnabled && keyStillValid) || currentHospitalId.isNullOrEmpty()) {
                            navigateToDashboard()
                        } else if (!biometricHelper.isBiometricAvailable()) {
                            val reason = biometricHelper.biometricUnavailableReason()
                            FileLogger.w("LoginActivity", "Biometric unavailable: $reason")
                            if (reason != null) {
                                GlassSnackbar.show(this@LoginActivity, reason, GlassSnackbar.Variant.INFO)
                            }
                            navigateToDashboard()
                        } else {
                            // Either never enrolled for this hospital, or a previous key was wiped —
                            // prompt fresh enrolment.
                            showBiometricBindingDialog(currentHospitalId)
                        }
                    }
                    is AuthState.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                        GlassSnackbar.show(this@LoginActivity, state.message, GlassSnackbar.Variant.ERROR)
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnLogin.isEnabled = true
                    }
                }
            }
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    /**
     * Show dialog asking the just-logged-in hospital whether to enable
     * biometric login. Keypair + flag are scoped to hospitalId so each
     * account enrols independently.
     */
    private fun showBiometricBindingDialog(hospitalId: String) {
        AlertDialog.Builder(this)
            .setTitle("Enable Biometric Login")
            .setMessage("Would you like to use fingerprint or face unlock for faster login next time?")
            .setPositiveButton("Enable") { _, _ ->
                lifecycleScope.launch {
                    try {
                        // If a stale alias already exists for this hospital (e.g. server
                        // and local drifted), wipe it before generating a fresh one.
                        if (biometricHelper.hasKeyPair(hospitalId)) {
                            biometricHelper.deleteKeyPair(hospitalId)
                        }

                        val publicKey = biometricHelper.generateKeyPair(hospitalId)
                        if (publicKey == null) {
                            GlassSnackbar.show(this@LoginActivity, "Failed to generate biometric key", GlassSnackbar.Variant.ERROR)
                            navigateToDashboard()
                            return@launch
                        }

                        val deviceId = android.provider.Settings.Secure.getString(
                            contentResolver, android.provider.Settings.Secure.ANDROID_ID
                        ) ?: "unknown"

                        val apiService = RetrofitClient.getApiService(this@LoginActivity)
                        val response = withContext(Dispatchers.IO) {
                            apiService.registerBiometric(
                                mapOf("publicKey" to publicKey, "deviceId" to deviceId)
                            )
                        }

                        if (response.isSuccessful) {
                            val identifier = binding.etHospitalId.text.toString().trim()
                            withContext(Dispatchers.IO) {
                                tokenManager.setBiometricEnabled(hospitalId, true)
                                tokenManager.saveDeviceId(deviceId)
                                if (identifier.isNotEmpty()) {
                                    tokenManager.saveBiometricEmail(hospitalId, identifier)
                                }
                            }
                            GlassSnackbar.show(this@LoginActivity, "Biometric login enabled", GlassSnackbar.Variant.SUCCESS)
                        } else {
                            biometricHelper.deleteKeyPair(hospitalId)
                            GlassSnackbar.show(this@LoginActivity, "Failed to register biometric with server", GlassSnackbar.Variant.ERROR)
                        }
                    } catch (e: Exception) {
                        FileLogger.e("LoginActivity", "Biometric registration failed", e)
                        biometricHelper.deleteKeyPair(hospitalId)
                        GlassSnackbar.show(this@LoginActivity, "Biometric setup failed", GlassSnackbar.Variant.ERROR)
                    }
                    navigateToDashboard()
                }
            }
            .setNegativeButton("Skip") { _, _ ->
                navigateToDashboard()
            }
            .setCancelable(false)
            .show()
    }

    /**
     * Decide whether to show the biometric button on the login screen.
     * We offer biometric for the HOSPITAL that enrolled it most recently on
     * this device (getLastBiometricHospitalId). The button is hidden if:
     *   - no hospital has enrolled on this device, OR
     *   - that hospital's flag is off, OR
     *   - the keystore alias for that hospital is missing (wiped / invalidated).
     */
    private fun setupBiometricLogin() {
        lifecycleScope.launch {
            val hospitalId = withContext(Dispatchers.IO) { tokenManager.getLastBiometricHospitalId() }
            if (hospitalId.isNullOrEmpty()) return@launch

            val enabled = withContext(Dispatchers.IO) { tokenManager.isBiometricEnabled(hospitalId) }
            val hasKey = biometricHelper.hasKeyPair(hospitalId)

            if (!enabled || !hasKey || !biometricHelper.isBiometricAvailable()) {
                // If the flag says enabled but the key is gone, clean up so we don't
                // show a broken button next time.
                if (enabled && !hasKey) {
                    withContext(Dispatchers.IO) { tokenManager.clearBiometricForHospital(hospitalId) }
                }
                return@launch
            }

            val email = withContext(Dispatchers.IO) { tokenManager.getBiometricEmail(hospitalId) }
            if (!email.isNullOrEmpty()) {
                binding.etHospitalId.setText(email)
            }
            binding.btnBiometric.visibility = View.VISIBLE
            binding.btnBiometric.setOnClickListener {
                performBiometricLogin(hospitalId)
            }
        }
    }

    /**
     * Full server-verified biometric login flow for a SPECIFIC hospital.
     * 1. Get challenge from server
     * 2. Sign challenge with that hospital's per-account keystore key
     * 3. Send signature to server for verification
     * 4. Receive fresh tokens and navigate to dashboard
     *
     * If the keystore key has been permanently invalidated (new fingerprint
     * enrolled, etc.), we wipe the per-hospital biometric state and tell the
     * user to log in with password + re-enrol.
     */
    private fun performBiometricLogin(hospitalId: String) {
        binding.loadingOverlay.visibility = View.VISIBLE
        binding.btnBiometric.isEnabled = false
        binding.btnLogin.isEnabled = false

        lifecycleScope.launch {
            try {
                val identifier = withContext(Dispatchers.IO) { tokenManager.getBiometricEmail(hospitalId) } ?: ""
                if (identifier.isEmpty()) {
                    throw Exception("No email saved for biometric login. Please log in with password.")
                }
                val deviceId = android.provider.Settings.Secure.getString(
                    contentResolver, android.provider.Settings.Secure.ANDROID_ID
                ) ?: "unknown"

                // Step 1: Get challenge from server
                val apiService = RetrofitClient.getApiService(this@LoginActivity)
                val challengeResponse = withContext(Dispatchers.IO) {
                    apiService.biometricChallenge(mapOf("identifier" to identifier, "deviceId" to deviceId))
                }

                if (!challengeResponse.isSuccessful || challengeResponse.body()?.get("success") != true) {
                    val errorMsg = challengeResponse.body()?.get("message") as? String ?: "Biometric challenge failed"
                    throw Exception(errorMsg)
                }

                val data = challengeResponse.body()?.get("data") as? Map<*, *>
                val challenge = data?.get("challenge") as? String
                    ?: throw Exception("Invalid challenge response")
                val serverHospitalId = data["hospitalId"] as? String
                    ?: throw Exception("Invalid hospital ID in challenge")

                // Sanity: the server's resolved hospitalId should match the one our
                // keystore alias is bound to. If not, the saved email now resolves
                // to a different hospital on the server — wipe local biometric state.
                if (serverHospitalId != hospitalId) {
                    withContext(Dispatchers.IO) { tokenManager.clearBiometricForHospital(hospitalId) }
                    biometricHelper.deleteKeyPair(hospitalId)
                    throw Exception("Biometric is linked to a different account. Please log in with password to re-enable.")
                }

                binding.loadingOverlay.visibility = View.GONE

                // Step 2: Show biometric prompt to sign the challenge
                biometricHelper.showBiometricPromptForSigning(
                    activity = this@LoginActivity,
                    hospitalId = hospitalId,
                    challenge = challenge,
                    onSuccess = { signature ->
                        // Step 3: Verify signature with server
                        lifecycleScope.launch {
                            binding.loadingOverlay.visibility = View.VISIBLE
                            try {
                                val verifyResponse = withContext(Dispatchers.IO) {
                                    apiService.verifyBiometric(mapOf(
                                        "hospitalId" to hospitalId,
                                        "deviceId" to deviceId,
                                        "signature" to signature
                                    ))
                                }

                                binding.loadingOverlay.visibility = View.GONE

                                if (verifyResponse.isSuccessful && verifyResponse.body()?.success == true) {
                                    val loginData = verifyResponse.body()?.data
                                    if (loginData?.accessToken != null && loginData.refreshToken != null) {
                                        // Step 4: Save fresh tokens and navigate
                                        withContext(Dispatchers.IO) {
                                            tokenManager.saveTokens(loginData.accessToken, loginData.refreshToken)
                                            if (loginData.hospital != null) {
                                                tokenManager.saveHospitalInfo(
                                                    loginData.hospital._id,
                                                    loginData.hospital.hospitalName,
                                                    loginData.hospital.logoUrl ?: ""
                                                )
                                            }
                                        }
                                        SessionManager.startSession(this@LoginActivity)
                                        navigateToDashboard()
                                    } else {
                                        GlassSnackbar.show(this@LoginActivity, "Invalid server response", GlassSnackbar.Variant.ERROR)
                                    }
                                } else {
                                    val errorMsg = verifyResponse.body()?.message ?: "Biometric verification failed"
                                    GlassSnackbar.show(this@LoginActivity, errorMsg, GlassSnackbar.Variant.ERROR)
                                }
                            } catch (e: Exception) {
                                binding.loadingOverlay.visibility = View.GONE
                                GlassSnackbar.show(this@LoginActivity, "Verification error: ${e.message}", GlassSnackbar.Variant.ERROR)
                            }
                            binding.btnBiometric.isEnabled = true
                            binding.btnLogin.isEnabled = true
                        }
                    },
                    onError = { errorMsg ->
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnBiometric.isEnabled = true
                        binding.btnLogin.isEnabled = true
                        if (errorMsg.isNotEmpty()) {
                            GlassSnackbar.show(this@LoginActivity, errorMsg, GlassSnackbar.Variant.ERROR)
                        }
                    },
                    onKeyInvalidated = {
                        // OS invalidated the key (new fingerprint enrolled, credential
                        // changed, etc.). Wipe local state + hide the biometric button
                        // so the user logs in with password and re-enrols.
                        lifecycleScope.launch {
                            withContext(Dispatchers.IO) {
                                tokenManager.clearBiometricForHospital(hospitalId)
                            }
                            biometricHelper.deleteKeyPair(hospitalId)
                            binding.loadingOverlay.visibility = View.GONE
                            binding.btnBiometric.visibility = View.GONE
                            binding.btnBiometric.isEnabled = true
                            binding.btnLogin.isEnabled = true
                            GlassSnackbar.show(
                                this@LoginActivity,
                                "Biometric was reset on this device. Please log in with password to re-enable.",
                                GlassSnackbar.Variant.INFO
                            )
                        }
                    }
                )
            } catch (e: Exception) {
                binding.loadingOverlay.visibility = View.GONE
                binding.btnBiometric.isEnabled = true
                binding.btnLogin.isEnabled = true
                GlassSnackbar.show(this@LoginActivity, "Biometric login failed: ${e.message}", GlassSnackbar.Variant.ERROR)
            }
        }
    }


}

