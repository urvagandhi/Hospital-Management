package com.hospital.management.ui.splash

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.lifecycleScope
import com.hospital.management.databinding.ActivitySplashBinding
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.ui.auth.TotpSetupActivity
import com.hospital.management.ui.dashboard.DashboardActivity
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class SplashActivity : BaseActivity() {

    override val isAuthScreen: Boolean = true
    private lateinit var binding: ActivitySplashBinding
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)

        // Start animations
        startEntranceAnimations()

        // Check session after delay for animation
        lifecycleScope.launch {
            delay(1500) // Show splash for at least 1.5 seconds
            checkSessionAndNavigate()
        }
    }

    private fun startEntranceAnimations() {
        // Logo animation
        binding.ivLogo.alpha = 0f
        binding.ivLogo.scaleX = 0.5f
        binding.ivLogo.scaleY = 0.5f

        val logoAlpha = ObjectAnimator.ofFloat(binding.ivLogo, View.ALPHA, 0f, 1f)
        val logoScaleX = ObjectAnimator.ofFloat(binding.ivLogo, View.SCALE_X, 0.5f, 1f)
        val logoScaleY = ObjectAnimator.ofFloat(binding.ivLogo, View.SCALE_Y, 0.5f, 1f)

        AnimatorSet().apply {
            playTogether(logoAlpha, logoScaleX, logoScaleY)
            duration = 600
            interpolator = OvershootInterpolator(1.5f)
            start()
        }

        // Glow pulse animation
        ObjectAnimator.ofFloat(binding.viewGlow, View.ALPHA, 0.3f, 0.7f, 0.3f).apply {
            duration = 2000
            repeatCount = ObjectAnimator.INFINITE
            start()
        }

        // Text fade in
        binding.llAppName.alpha = 0f
        binding.tvTagline.alpha = 0f

        ObjectAnimator.ofFloat(binding.llAppName, View.ALPHA, 0f, 1f).apply {
            startDelay = 400
            duration = 500
            start()
        }

        ObjectAnimator.ofFloat(binding.tvTagline, View.ALPHA, 0f, 0.8f).apply {
            startDelay = 600
            duration = 500
            start()
        }
    }

    private suspend fun checkSessionAndNavigate() {
        val hasToken = tokenManager.hasValidToken()

        if (hasToken) {
            // Check if session is still valid (within timeout)
            val isSessionValid = SessionManager.restoreSession(this@SplashActivity)

            if (isSessionValid) {
                // Verify session with server (catches SESSION_CONFLICT from another device)
                val serverValid = validateSessionWithServer()

                if (serverValid) {
                    if (tokenManager.isTotpSetupPending()) {
                        navigateToTotpSetup()
                        return
                    }
                    binding.tvLoading.text = "Welcome back!"
                    delay(500)
                    navigateToDashboard()
                } else {
                    // Session revoked on server (another device logged in)
                    tokenManager.clearAll()
                    binding.tvLoading.text = "Signed in on another device"
                    delay(1000)
                    navigateToLogin()
                }
            } else {
                // Token exists but session expired — require re-login (enforces TOTP)
                tokenManager.clearAll()
                binding.tvLoading.text = "Session expired. Please sign in"
                delay(500)
                navigateToLogin()
            }
        } else {
            // No token, go to login
            binding.tvLoading.text = "Please sign in"
            delay(500)
            navigateToLogin()
        }
    }

    /**
     * Call GET /api/auth/session/validate to check if the session is still active on the server.
     * Returns false if session was revoked (e.g., another device logged in).
     * On network error, returns true (give benefit of the doubt — AuthInterceptor will catch it later).
     */
    private suspend fun validateSessionWithServer(): Boolean {
        return try {
            val apiService = RetrofitClient.getApiService(this@SplashActivity)
            val response = withContext(Dispatchers.IO) { apiService.validateSession() }
            response.isSuccessful
        } catch (e: Exception) {
            Log.w("SplashActivity", "Session validation failed (network?): ${e.message}")
            true // Allow through — AuthInterceptor will handle 401 on first API call
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        @Suppress("DEPRECATION")
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, android.R.anim.fade_in, android.R.anim.fade_out)
        } else {
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        finish()
    }

    private fun navigateToTotpSetup() {
        val intent = Intent(this, TotpSetupActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        @Suppress("DEPRECATION")
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, android.R.anim.fade_in, android.R.anim.fade_out)
        } else {
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        finish()
    }

    private fun navigateToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        @Suppress("DEPRECATION")
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, android.R.anim.fade_in, android.R.anim.fade_out)
        } else {
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        finish()
    }
}
