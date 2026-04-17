package com.hospital.management.ui.profile

import android.net.Uri
import android.os.Bundle
import android.util.Patterns
import android.view.LayoutInflater
import android.view.View
import android.widget.EditText
import android.widget.TextView
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputLayout
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.AppDatabase
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
import java.io.File

/**
 * Profile Activity (Task #28).
 *
 *  • View + edit non-sensitive fields (hospitalName, address, logo) via PATCH /me.
 *  • Logo: tap avatar → system image picker → preview + upload on Save.
 *  • Change email / phone via OTP dialog:
 *      1) /me/change-contact/init → backend sends OTP (new email | current email for phone)
 *      2) /me/change-contact/verify → commits
 *  • On save/contact-change, syncs TokenManager so Dashboard header updates instantly on resume.
 */
class ProfileActivity : BaseActivity() {

    private lateinit var binding: ActivityProfileBinding
    private lateinit var vm: ProfileViewModel
    private lateinit var tokenManager: TokenManager
    private var currentHospital: Hospital? = null

    /** Temp file created from the picked Uri; null if user hasn't selected a new logo. */
    private var selectedLogoFile: File? = null

    private val pickImageLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri ?: return@registerForActivityResult
        val file = uriToTempFile(uri) ?: run {
            GlassSnackbar.show(this, "Failed to read image", GlassSnackbar.Variant.ERROR)
            return@registerForActivityResult
        }
        selectedLogoFile = file
        // Show preview immediately
        binding.ivLogoImage.visibility = View.VISIBLE
        binding.tvLogoInitials.visibility = View.GONE
        Glide.with(this).load(file).circleCrop().into(binding.ivLogoImage)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityProfileBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Profile"

        tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val profileRepo = ProfileRepository(apiService)
        val factory = ViewModelFactory(authRepository = authRepo, profileRepository = profileRepo)
        vm = ViewModelProvider(this, factory)[ProfileViewModel::class.java]

        binding.layoutLogoContainer.setOnClickListener { pickImageLauncher.launch("image/*") }
        binding.btnSave.setOnClickListener { saveBasic() }
        binding.btnChangeEmail.setOnClickListener { showContactChangeDialog("email") }
        binding.btnChangePhone.setOnClickListener { showContactChangeDialog("phone") }
        binding.btnClearCache.setOnClickListener { clearDownloadCache() }

        observe()
        vm.loadProfile()
        refreshCacheInfo()
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
        val logoToSend = selectedLogoFile

        if (sendName == null && sendAddr == null && logoToSend == null) {
            GlassSnackbar.show(this, "Nothing to update", GlassSnackbar.Variant.INFO)
            return
        }
        vm.saveProfile(sendName, sendAddr, logoToSend)
    }

    private fun bind(hospital: Hospital) {
        currentHospital = hospital
        binding.etHospitalName.setText(hospital.hospitalName)
        binding.etAddress.setText(hospital.address ?: "")
        binding.tvCurrentEmail.text = hospital.email
        binding.tvCurrentPhone.text = hospital.phone
        updateLogoDisplay(hospital)
    }

    /**
     * Refresh the avatar widget. Skipped when the user has a pending logo selection
     * (we keep showing the local preview until after the save completes).
     */
    private fun updateLogoDisplay(hospital: Hospital) {
        if (selectedLogoFile != null) return
        val logoUrl = hospital.logoUrl
        val isPlaceholder = logoUrl.isNullOrEmpty() ||
                logoUrl.contains("placeholder", ignoreCase = true)
        if (!isPlaceholder) {
            binding.ivLogoImage.visibility = View.VISIBLE
            binding.tvLogoInitials.visibility = View.GONE
            Glide.with(this).load(logoUrl).circleCrop().into(binding.ivLogoImage)
        } else {
            binding.ivLogoImage.visibility = View.GONE
            binding.tvLogoInitials.visibility = View.VISIBLE
            binding.tvLogoInitials.text = hospitalInitials(hospital.hospitalName)
        }
    }

    private fun hospitalInitials(name: String): String {
        val parts = name.trim().split("\\s+".toRegex()).filter { it.isNotEmpty() }
        return when {
            parts.size >= 2 -> "${parts.first().first()}${parts[1].first()}".uppercase()
            parts.isNotEmpty() -> parts[0].take(2).uppercase()
            else -> "H"
        }
    }

    /** Copies a content Uri into a cache-dir temp file so Retrofit can read it. */
    private fun uriToTempFile(uri: Uri): File? {
        return try {
            val ext = contentResolver.getType(uri)?.substringAfterLast("/") ?: "jpg"
            val tmp = File(cacheDir, "logo_${System.currentTimeMillis()}.$ext")
            contentResolver.openInputStream(uri)?.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
            } ?: return null
            tmp
        } catch (_: Exception) {
            null
        }
    }

    // ── Contact change flow ────────────────────────────────────────────────

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

    // ── Download cache management ───────────────────────────────────────────

    private fun refreshCacheInfo() {
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val dao = AppDatabase.getDatabase(this@ProfileActivity).downloadCacheDao()
            val totalBytes = dao.totalCacheBytes() ?: 0L
            val cacheDir = java.io.File(filesDir, "download_cache")
            val fileCount = cacheDir.listFiles()?.count { !it.name.endsWith(".tmp") && !it.name.endsWith(".meta") } ?: 0
            val sizeMb = "%.1f".format(totalBytes / (1024.0 * 1024.0))
            kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                binding.tvCacheInfo.text = "Downloaded files: $fileCount items, $sizeMb MB"
            }
        }
    }

    private fun clearDownloadCache() {
        AlertDialog.Builder(this)
            .setTitle("Clear Downloads Cache")
            .setMessage("This will remove all cached downloads. Files already saved to your Downloads folder are not affected.")
            .setPositiveButton("Clear") { _, _ ->
                lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                    val dao = AppDatabase.getDatabase(this@ProfileActivity).downloadCacheDao()
                    dao.clearAll()
                    val cacheDir = java.io.File(filesDir, "download_cache")
                    cacheDir.listFiles()?.forEach { it.delete() }
                    kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.Main) {
                        binding.tvCacheInfo.text = "Downloaded files: 0 items, 0.0 MB"
                        GlassSnackbar.show(this@ProfileActivity, "Cache cleared", GlassSnackbar.Variant.SUCCESS)
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ── State observation ──────────────────────────────────────────────────

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
                        // Clean up temp file; null first so updateLogoDisplay shows new URL
                        selectedLogoFile?.delete()
                        selectedLogoFile = null
                        bind(state.hospital)
                        tokenManager.saveHospitalInfo(
                            state.hospital._id,
                            state.hospital.hospitalName,
                            state.hospital.logoUrl ?: "",
                        )
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
                        tokenManager.saveHospitalInfo(
                            state.hospital._id,
                            state.hospital.hospitalName,
                            state.hospital.logoUrl ?: "",
                        )
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
