package com.hospital.management.ui.profile

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.ProfileRepository
import com.hospital.management.databinding.ActivityChangePasswordSettingsBinding
import com.hospital.management.presentation.viewmodel.ProfileEvent
import com.hospital.management.presentation.viewmodel.ProfileViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Settings-based change password (authenticated). Distinct from the
 * first-login ChangePasswordActivity which uses a temp token.
 *
 * POST /api/auth/password/change — verifies current password, then revokes
 * all OTHER sessions. The current session stays live.
 */
class ChangePasswordSettingsActivity : BaseActivity() {

    private lateinit var binding: ActivityChangePasswordSettingsBinding
    private lateinit var vm: ProfileViewModel

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityChangePasswordSettingsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val profileRepo = ProfileRepository(apiService)
        val factory = ViewModelFactory(authRepository = authRepo, profileRepository = profileRepo)
        vm = ViewModelProvider(this, factory)[ProfileViewModel::class.java]

        binding.btnSubmit.setOnClickListener { submit() }
        observe()
    }

    private fun submit() {
        val current = binding.etCurrent.text.toString()
        val newPw = binding.etNew.text.toString()
        val confirm = binding.etConfirm.text.toString()

        binding.tilCurrent.error = null
        binding.tilNew.error = null
        binding.tilConfirm.error = null

        if (current.isEmpty()) {
            binding.tilCurrent.error = "Current password is required"
            return
        }
        val err = validatePasswordPolicy(newPw)
        if (err != null) {
            binding.tilNew.error = err
            return
        }
        if (newPw == current) {
            binding.tilNew.error = "New password must be different from current"
            return
        }
        if (newPw != confirm) {
            binding.tilConfirm.error = "Passwords do not match"
            return
        }
        vm.changePassword(current, newPw)
    }

    private fun validatePasswordPolicy(pw: String): String? {
        if (pw.length < 8) return "Password must be at least 8 characters"
        if (!pw.any { it.isUpperCase() }) return "Password must contain an uppercase letter"
        if (!pw.any { it.isLowerCase() }) return "Password must contain a lowercase letter"
        if (!pw.any { it.isDigit() }) return "Password must contain a number"
        if (pw.all { it.isLetterOrDigit() }) return "Password must contain a special character"
        return null
    }

    private fun observe() {
        lifecycleScope.launch {
            vm.event.collect { state ->
                when (state) {
                    is ProfileEvent.Loading -> {
                        binding.loadingOverlay.visibility = View.VISIBLE
                        binding.btnSubmit.isEnabled = false
                    }
                    is ProfileEvent.PasswordChanged -> {
                        binding.loadingOverlay.visibility = View.GONE
                        AlertDialog.Builder(this@ChangePasswordSettingsActivity)
                            .setTitle("Password Changed")
                            .setMessage(state.message)
                            .setPositiveButton("OK") { _, _ -> finish() }
                            .setCancelable(false)
                            .show()
                        vm.reset()
                    }
                    is ProfileEvent.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnSubmit.isEnabled = true
                        GlassSnackbar.show(this@ChangePasswordSettingsActivity, state.message, GlassSnackbar.Variant.ERROR)
                        vm.reset()
                    }
                    else -> {
                        binding.loadingOverlay.visibility = View.GONE
                        binding.btnSubmit.isEnabled = true
                    }
                }
            }
        }
    }
}
