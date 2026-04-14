package com.hospital.management.ui.profile

import android.content.Intent
import android.os.Bundle
import android.text.InputType
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.ui.base.BaseActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * A2 — Account deletion request/cancel flow. Minimal programmatic UI
 * (no XML layout) to avoid churn; screen is secondary/rare-use.
 */
class DeleteAccountActivity : BaseActivity() {

    private lateinit var statusText: TextView
    private lateinit var passwordEdit: EditText
    private lateinit var reasonEdit: EditText
    private lateinit var submitBtn: Button
    private lateinit var cancelBtn: Button
    private var currentStatus: String = "active"

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Delete Account"

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 48, 48, 48)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }

        statusText = TextView(this).apply {
            text = "Loading…"
            textSize = 14f
        }
        root.addView(statusText)

        val warn = TextView(this).apply {
            text = "Submitting a deletion request will schedule your account for deletion. An admin will review your request. You can cancel during the grace period."
            textSize = 13f
            setPadding(0, 24, 0, 24)
        }
        root.addView(warn)

        passwordEdit = EditText(this).apply {
            hint = "Current password"
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        root.addView(passwordEdit)

        reasonEdit = EditText(this).apply {
            hint = "Reason (optional)"
            minLines = 2
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
        }
        root.addView(reasonEdit)

        submitBtn = Button(this).apply {
            text = "Request Account Deletion"
            setOnClickListener { confirmAndSubmit() }
        }
        root.addView(submitBtn)

        cancelBtn = Button(this).apply {
            text = "Cancel Deletion Request"
            visibility = android.view.View.GONE
            setOnClickListener { doCancel() }
        }
        root.addView(cancelBtn)

        setContentView(root)
        refreshStatus()
    }

    private fun refreshStatus() {
        lifecycleScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity).getCurrentHospital()
                }
                val h = resp.body()?.data
                currentStatus = h?.deletionStatus ?: "active"
                if (currentStatus == "deletion_pending") {
                    val when_ = h?.deletionScheduledFor ?: ""
                    statusText.text = "Deletion pending. Scheduled for: $when_"
                    submitBtn.visibility = android.view.View.GONE
                    passwordEdit.visibility = android.view.View.GONE
                    reasonEdit.visibility = android.view.View.GONE
                    cancelBtn.visibility = android.view.View.VISIBLE
                } else {
                    statusText.text = "Account status: $currentStatus"
                    submitBtn.visibility = android.view.View.VISIBLE
                    cancelBtn.visibility = android.view.View.GONE
                }
            } catch (e: Exception) {
                statusText.text = "Failed to load: ${e.message}"
            }
        }
    }

    private fun confirmAndSubmit() {
        val pw = passwordEdit.text.toString()
        if (pw.isEmpty()) {
            Toast.makeText(this, "Password is required", Toast.LENGTH_SHORT).show()
            return
        }
        AlertDialog.Builder(this)
            .setTitle("Confirm Deletion Request")
            .setMessage("Your account will be scheduled for deletion. Proceed?")
            .setPositiveButton("Submit") { _, _ -> doSubmit(pw, reasonEdit.text.toString()) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun doSubmit(password: String, reason: String) {
        submitBtn.isEnabled = false
        lifecycleScope.launch {
            try {
                val resp = withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity)
                        .requestAccountDeletion(mapOf("password" to password, "reason" to reason))
                }
                if (resp.isSuccessful) {
                    Toast.makeText(this@DeleteAccountActivity,
                        "Deletion request submitted", Toast.LENGTH_LONG).show()
                    refreshStatus()
                } else {
                    Toast.makeText(this@DeleteAccountActivity,
                        "Failed: ${resp.code()}", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@DeleteAccountActivity,
                    "Error: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                submitBtn.isEnabled = true
            }
        }
    }

    private fun doCancel() {
        cancelBtn.isEnabled = false
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@DeleteAccountActivity)
                        .cancelAccountDeletion()
                }
                Toast.makeText(this@DeleteAccountActivity,
                    "Deletion request cancelled", Toast.LENGTH_SHORT).show()
                refreshStatus()
            } catch (e: Exception) {
                Toast.makeText(this@DeleteAccountActivity,
                    "Error: ${e.message}", Toast.LENGTH_LONG).show()
            } finally {
                cancelBtn.isEnabled = true
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean { finish(); return true }
}
