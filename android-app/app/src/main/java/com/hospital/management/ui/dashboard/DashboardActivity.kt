package com.hospital.management.ui.dashboard

import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.MotionEvent
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
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager

class DashboardActivity : AppCompatActivity() {

    private lateinit var binding: ActivityDashboardBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()
        setupHospitalInfo()
        setupClickListeners()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val authRepository = AuthRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepository)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]
    }

    private fun setupHospitalInfo() {
        val tokenManager = com.hospital.management.data.local.TokenManager(this)

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

    private fun setupClickListeners() {
        binding.cardNewAdmission.setOnClickListener {
            startActivity(Intent(this, AdmissionActivity::class.java))
        }

        binding.cardShowPatients.setOnClickListener {
            startActivity(Intent(this, PatientListActivity::class.java))
        }

        binding.cardScanner.setOnClickListener {
            startActivity(Intent(this, ScannerActivity::class.java))
        }

        binding.btnLogout.setOnClickListener {
            showLogoutDialog()
        }

        // Add touch animation to logout button
        binding.btnLogout.setOnTouchListener { view, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    ObjectAnimator.ofFloat(view, "scaleX", 1f, 0.95f).setDuration(100).start()
                    ObjectAnimator.ofFloat(view, "scaleY", 1f, 0.95f).setDuration(100).start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    ObjectAnimator.ofFloat(view, "scaleX", 0.95f, 1f).setDuration(100).start()
                    ObjectAnimator.ofFloat(view, "scaleY", 0.95f, 1f).setDuration(100).start()
                }
            }
            false
        }
    }

    private fun showLogoutDialog() {
        AlertDialog.Builder(this)
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
        finish()
    }
}
