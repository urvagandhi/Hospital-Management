package com.hospital.management.ui.profile

import android.os.Bundle
import android.view.View
import androidx.lifecycle.lifecycleScope
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityDeleteAccountBinding
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A2 — Account deletion request/cancel flow. Mirrors web DeleteAccount.tsx.
 * Hidden from admin via menu gating; backend also blocks admin self-delete.
 */
class DeleteAccountActivity : BaseActivity() {

    private lateinit var binding: ActivityDeleteAccountBinding
    private var currentStatus: String = "active"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDeleteAccountBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Delete Account"

        // "Request Account Deletion" → expand form
        binding.btnRequestInitial.setOnClickListener {
            binding.btnRequestInitial.visibility = View.GONE
            binding.formContainer.visibility = View.VISIBLE
        }
        binding.btnFormCancel.setOnClickListener {
            binding.formContainer.visibility = View.GONE
            binding.btnRequestInitial.visibility = View.VISIBLE
            binding.etPassword.setText("")
            binding.etReason.setText("")
        }
        binding.btnFormSubmit.setOnClickListener { confirmAndSubmit() }
        binding.btnCancelDeletion.setOnClickListener { confirmAndCancelDeletion() }

        refreshStatus()
    }

    private fun refreshStatus() {
        binding.progress.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity).getCurrentHospital()
                }
                val h = resp.body()?.data
                currentStatus = h?.deletionStatus ?: "active"
                if (currentStatus == "deletion_pending") {
                    binding.cardPending.visibility = View.VISIBLE
                    binding.cardRequest.visibility = View.GONE
                    val scheduled = h?.deletionScheduledFor
                    binding.tvPendingInfo.text = if (!scheduled.isNullOrEmpty()) {
                        "Your account is scheduled for deletion on $scheduled. An admin will review your request."
                    } else {
                        "Your account is scheduled for deletion. An admin will review your request."
                    }
                } else {
                    binding.cardPending.visibility = View.GONE
                    binding.cardRequest.visibility = View.VISIBLE
                }
            } catch (e: Exception) {
                GlassSnackbar.show(this@DeleteAccountActivity,
                    "Failed to load: ${e.message}", GlassSnackbar.Variant.ERROR)
            } finally {
                binding.progress.visibility = View.GONE
            }
        }
    }

    private fun confirmAndSubmit() {
        val pw = binding.etPassword.text?.toString().orEmpty()
        if (pw.isEmpty()) {
            GlassSnackbar.show(this, "Password is required", GlassSnackbar.Variant.ERROR)
            return
        }
        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle("Request Account Deletion?")
            .setMessage("Your account will be scheduled for deletion and reviewed by an admin. You can cancel this request anytime during the grace period.")
            .setPositiveButton("Yes, submit") { _, _ -> doSubmit(pw, binding.etReason.text?.toString().orEmpty()) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun doSubmit(password: String, reason: String) {
        binding.progress.visibility = View.VISIBLE
        binding.btnFormSubmit.isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity)
                        .requestAccountDeletion(mapOf("password" to password, "reason" to reason))
                }
                if (resp.isSuccessful) {
                    GlassSnackbar.show(this@DeleteAccountActivity,
                        "Deletion request submitted", GlassSnackbar.Variant.SUCCESS)
                    refreshStatus()
                } else {
                    val msg = resp.errorBody()?.string()?.take(200) ?: "Failed (${resp.code()})"
                    GlassSnackbar.show(this@DeleteAccountActivity, msg, GlassSnackbar.Variant.ERROR)
                }
            } catch (e: Exception) {
                GlassSnackbar.show(this@DeleteAccountActivity,
                    "Error: ${e.message}", GlassSnackbar.Variant.ERROR)
            } finally {
                binding.progress.visibility = View.GONE
                binding.btnFormSubmit.isEnabled = true
            }
        }
    }

    private fun confirmAndCancelDeletion() {
        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle("Cancel Deletion Request?")
            .setMessage("Your account will remain active and the pending deletion request will be withdrawn.")
            .setPositiveButton("Yes, cancel") { _, _ -> doCancelDeletion() }
            .setNegativeButton("Keep pending", null)
            .show()
    }

    private fun doCancelDeletion() {
        binding.progress.visibility = View.VISIBLE
        binding.btnCancelDeletion.isEnabled = false
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity).cancelAccountDeletion()
                }
                GlassSnackbar.show(this@DeleteAccountActivity,
                    "Deletion request cancelled", GlassSnackbar.Variant.SUCCESS)
                refreshStatus()
            } catch (e: Exception) {
                GlassSnackbar.show(this@DeleteAccountActivity,
                    "Error: ${e.message}", GlassSnackbar.Variant.ERROR)
            } finally {
                binding.progress.visibility = View.GONE
                binding.btnCancelDeletion.isEnabled = true
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean { finish(); return true }
}
