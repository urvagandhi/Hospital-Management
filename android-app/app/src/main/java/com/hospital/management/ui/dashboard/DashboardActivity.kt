package com.hospital.management.ui.dashboard

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.bumptech.glide.Glide
import com.hospital.management.R
import com.hospital.management.databinding.ActivityDashboardBinding
import com.hospital.management.ui.admission.AdmissionActivity
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.ui.patients.PatientListActivity
import com.hospital.management.ui.scanner.ScannerActivity
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.utils.SessionManager

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var authViewModel: AuthViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()
        setupHospitalInfo()
        setupClickListeners()
        setupCardAnimations()

        // Update session on activity resume
        SessionManager.updateLastInteractionTime(this)
    }

    override fun onResume() {
        super.onResume()
        SessionManager.updateLastInteractionTime(this)
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val authRepository = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepository)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]
    }

    private fun setupHospitalInfo() {
        lifecycleScope.launch {
            val hospitalName = tokenManager.getHospitalName() ?: "Hospital Management"
            val logoUrl = tokenManager.getHospitalLogoUrl() ?: ""

            // Set hospital name
            binding.tvHospitalName.text = hospitalName

            // Load logo if available
            if (logoUrl.isNotEmpty()) {
                Glide.with(this@DashboardActivity)
                    .load(logoUrl)
                    .circleCrop()
                    .placeholder(R.mipmap.ic_launcher)
                    .error(R.mipmap.ic_launcher)
                    .into(binding.ivHospitalLogo)
            }
        }
    }

    private fun setupCardAnimations() {
        // Initially hide all cards
        val cards = listOf(
            binding.cardNewAdmission,
            binding.cardShowPatients,
            binding.cardScanner,
            binding.btnLogout
        )

        cards.forEach { card ->
            card.alpha = 0f
            card.translationY = 100f
            card.scaleX = 0.8f
            card.scaleY = 0.8f
        }

        // Animate cards with stagger effect
        lifecycleScope.launch {
            delay(300) // Wait for layout
            cards.forEachIndexed { index, card ->
                delay(100L * index) // Stagger delay
                animateCardEntrance(card)
            }
        }
    }

    private fun animateCardEntrance(card: View) {
        val alphaAnim = ObjectAnimator.ofFloat(card, View.ALPHA, 0f, 1f)
        val translateAnim = ObjectAnimator.ofFloat(card, View.TRANSLATION_Y, 100f, 0f)
        val scaleXAnim = ObjectAnimator.ofFloat(card, View.SCALE_X, 0.8f, 1f)
        val scaleYAnim = ObjectAnimator.ofFloat(card, View.SCALE_Y, 0.8f, 1f)

        AnimatorSet().apply {
            playTogether(alphaAnim, translateAnim, scaleXAnim, scaleYAnim)
            duration = 400
            interpolator = OvershootInterpolator(1.2f)
            start()
        }
    }

    private fun setupClickListeners() {
        // Add touch animations to all cards
        setupCardTouchAnimation(binding.cardNewAdmission) {
            startActivity(Intent(this, AdmissionActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }

        setupCardTouchAnimation(binding.cardShowPatients) {
            startActivity(Intent(this, PatientListActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }

        setupCardTouchAnimation(binding.cardScanner) {
            startActivity(Intent(this, ScannerActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }

        setupCardTouchAnimation(binding.btnLogout) {
            showLogoutDialog()
        }
    }

    private fun setupCardTouchAnimation(card: View, onClick: () -> Unit) {
        card.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    animateCardPress(view, true)
                }
                MotionEvent.ACTION_UP -> {
                    animateCardPress(view, false)
                    onClick()
                }
                MotionEvent.ACTION_CANCEL -> {
                    animateCardPress(view, false)
                }
            }
            true
        }
    }

    private fun animateCardPress(view: View, pressed: Boolean) {
        val scale = if (pressed) 0.92f else 1f
        val duration = if (pressed) 100L else 200L
        val interpolator = if (pressed) DecelerateInterpolator() else OvershootInterpolator(1.5f)

        view.animate()
            .scaleX(scale)
            .scaleY(scale)
            .setDuration(duration)
            .setInterpolator(interpolator)
            .start()
    }

    private fun showLogoutDialog() {
        AlertDialog.Builder(this, R.style.AlertDialogTheme)
            .setTitle("Logout")
            .setMessage("Are you sure you want to logout?")
            .setPositiveButton("Yes") { _, _ ->
                logout()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun logout() {
        // Use ViewModel to logout (clears tokens)
        authViewModel.logout()

        // Navigate to login
        val intent = Intent(this@DashboardActivity, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }
}
