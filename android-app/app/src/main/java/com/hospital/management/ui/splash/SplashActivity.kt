package com.hospital.management.ui.splash

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.hospital.management.databinding.ActivitySplashBinding
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.ui.dashboard.DashboardActivity
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class SplashActivity : AppCompatActivity() {

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
        binding.tvAppName.alpha = 0f
        binding.tvTagline.alpha = 0f

        ObjectAnimator.ofFloat(binding.tvAppName, View.ALPHA, 0f, 1f).apply {
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
                // Session is valid, go to dashboard
                binding.tvLoading.text = "Welcome back!"
                delay(500)
                navigateToDashboard()
            } else {
                // Token exists but session expired, still go to dashboard
                // The session will be treated as new
                SessionManager.startSession(this@SplashActivity)
                binding.tvLoading.text = "Welcome back!"
                delay(500)
                navigateToDashboard()
            }
        } else {
            // No token, go to login
            binding.tvLoading.text = "Please sign in"
            delay(500)
            navigateToLogin()
        }
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }

    private fun navigateToLogin() {
        val intent = Intent(this, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }
}
