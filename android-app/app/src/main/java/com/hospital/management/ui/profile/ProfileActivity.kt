package com.hospital.management.ui.profile

import android.os.Bundle
import android.util.Patterns
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputLayout
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.Hospital
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.ProfileRepository
import com.hospital.management.databinding.ActivityProfileBinding
import com.hospital.management.presentation.viewmodel.ProfileEvent
import com.hospital.management.presentation.viewmodel.ProfileViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Profile Activity (Task #28).
 *
 *  • View + edit non-sensitive fields (hospitalName, address) via PATCH /me.
 *  • Change email / phone via OTP dialog:
 *      1) /me/change-contact/init → backend sends OTP (new email | current email for phone)
 *      2) /me/change-contact/verify → commits
 */
class ProfileActivity : BaseActivity() {

    private lateinit var binding: ActivityProfileBinding
    private lateinit var vm: ProfileViewModel
    private var currentHospital: Hospital? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Profile"

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val profileRepo = ProfileRepository(apiService)
        val factory = ViewModelFactory(authRepository = authRepo, profileRepository = profileRepo)
        vm = ViewModelProvider(this, factory)[ProfileViewModel::class.java]

        binding.btnSave.setOnClickListener { saveBasic() }
        binding.btnChangeEmail.setOnClickListener { showContactChangeDialog("email") }
        binding.btnChangePhone.setOnClickListener { showContactChangeDialog("phone") }

        observe()
        vm.loadProfile()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun saveBasic() {
        val name = binding.etHospitalName.text.toString().trim()
        val address = binding.etAddress.text.toString().trim()
        binding.tilHospitalName.error = null

        if (name.length < 3) {
            binding.tilHospitalName.error = "Hospital name must be at least 3 characters"
            return
        }

        val cur = currentHospital
        val sendName = if (cur != null && name != cur.hospitalName) name else null
        val sendAddr = if (cur != null && address != (cur.address ?: "")) address else null

        if (sendName == null && sendAddr == null) {
            GlassSnackbar.show(this, "Nothing to update", GlassSnackbar.Variant.INFO)
            return
        }
        vm.saveProfile(sendName, sendAddr, null)
    }

    private fun bind(hospital: Hospital) {
        currentHospital = hospital
        binding.etHospitalName.setText(hospital.hospitalName)
        binding.etAddress.setText(hospital.address ?: "")
        binding.tvCurrentEmail.text = hospital.email
        binding.tvCurrentPhone.text = hospital.phone
    }

    // ── Contact change flow ────────────────────────────────────────────
    private fun showContactChangeDialog(field: String) {
        val hospital = currentHospital ?: return
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_contact_change_enter, null)
        val tv = view.findViewById<TextView>(R.id.tvHint)
        val til = view.findViewById<TextInputLayout>(R.id.tilValue)
        val et = view.findViewById<EditText>(R.id.etValue)

        val currentValue = if (field == "email") hospital.email else hospital.phone
        tv.text = if (field == "email")
            "Current: $currentValue\n\nWe'll send a verification code to your new email."
        else
            "Current: $currentValue\n\nWe'll send a verification code to your current email."

        til.hint = if (field == "email") "New Email" else "New Phone (10 digits)"
        et.inputType = if (field == "email")
            android.text.InputType.TYPE_CLASS_TEXT or android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        else android.text.InputType.TYPE_CLASS_PHONE

        val dialog = MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle(if (field == "email") "Change Email" else "Change Phone")
            .setView(view)
            .setPositiveButton("Send Code", null)
            .setNegativeButton("Cancel", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val value = et.text.toString().trim()
                til.error = null
                if (field == "email") {
                    if (!Patterns.EMAIL_ADDRESS.matcher(value).matches()) {
                        til.error = "Invalid email format"
                        return@setOnClickListener
                    }
                    vm.initContactChange(newEmail = value, newPhone = null)
                } else {
                    val digits = value.replace(Regex("[^\\d]"), "")
                    if (digits.length != 10 && !(digits.length == 12 && digits.startsWith("91"))) {
                        til.error = "Phone number must be 10 digits"
                        return@setOnClickListener
                    }
                    vm.initContactChange(newEmail = null, newPhone = value)
                }
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun showOtpDialog(field: String, message: String) {
        val view = LayoutInflater.from(this).inflate(R.layout.dialog_contact_change_otp, null)
        val tv = view.findViewById<TextView>(R.id.tvHint)
        val til = view.findViewById<TextInputLayout>(R.id.tilOtp)
        val et = view.findViewById<EditText>(R.id.etOtp)

        tv.text = message

        val dialog = MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle(if (field == "email") "Verify new email" else "Verify phone change")
            .setView(view)
            .setPositiveButton("Verify & Save", null)
            .setNegativeButton("Cancel", null)
            .create()

        dialog.setOnShowListener {
            dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener {
                val otp = et.text.toString().trim()
                til.error = null
                if (!otp.matches(Regex("^\\d{6}$"))) {
                    til.error = "Enter the 6-digit code"
                    return@setOnClickListener
                }
                vm.verifyContactChange(otp)
                dialog.dismiss()
            }
        }
        dialog.show()
    }

    private fun observe() {
        lifecycleScope.launch {
            vm.event.collect { state ->
                when (state) {
                    is ProfileEvent.Loading -> binding.loadingOverlay.visibility = View.VISIBLE
                    is ProfileEvent.Loaded -> {
                        binding.loadingOverlay.visibility = View.GONE
                        bind(state.hospital)
                    }
                    is ProfileEvent.Saved -> {
                        binding.loadingOverlay.visibility = View.GONE
                        bind(state.hospital)
                        GlassSnackbar.show(this@ProfileActivity, state.message, GlassSnackbar.Variant.SUCCESS)
                        vm.reset()
                    }
                    is ProfileEvent.OtpSent -> {
                        binding.loadingOverlay.visibility = View.GONE
                        showOtpDialog(state.field, state.message)
                        vm.reset()
                    }
                    is ProfileEvent.ContactChanged -> {
                        binding.loadingOverlay.visibility = View.GONE
                        bind(state.hospital)
                        GlassSnackbar.show(this@ProfileActivity, "Contact updated", GlassSnackbar.Variant.SUCCESS)
                        vm.reset()
                    }
                    is ProfileEvent.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        GlassSnackbar.show(this@ProfileActivity, state.message, GlassSnackbar.Variant.ERROR)
                        vm.reset()
                    }
                    else -> binding.loadingOverlay.visibility = View.GONE
                }
            }
        }
    }
}
