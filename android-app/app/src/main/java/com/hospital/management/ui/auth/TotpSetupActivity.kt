package com.hospital.management.ui.auth

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.TotpSetupResponse
import com.hospital.management.data.models.TotpVerifyResponse
import com.hospital.management.databinding.ActivityTotpSetupBinding
import com.hospital.management.ui.dashboard.DashboardActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import retrofit2.Response

class TotpSetupActivity : BaseActivity() {
    private lateinit var binding: ActivityTotpSetupBinding
    private lateinit var tokenManager: TokenManager
    private var backupCodes: List<String> = emptyList()
    private var setupLoaded = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTotpSetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        tokenManager.setTotpSetupPending(true)

        loadTotpSetup()
        setupVerifyButton()

        binding.btnCopyBackupCodes.setOnClickListener {
            copyBackupCodesToClipboard()
        }

        binding.btnContinueToDashboard.setOnClickListener {
            navigateToDashboard()
        }
    }

    private fun setupVerifyButton() {
        binding.btnVerify.setOnClickListener {
            val totpCode = binding.etTotpCode.text.toString()
            if (totpCode.length == 6) {
                verifyTotp(totpCode)
            } else {
                Toast.makeText(this, "Please enter a 6-digit code", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun loadTotpSetup() {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false

        lifecycleScope.launch {
            try {
                val apiService = RetrofitClient.getApiService(this@TotpSetupActivity)
                android.util.Log.d("TotpSetup", "Calling POST /2fa/setup")
                val response: Response<TotpSetupResponse> = withContext(Dispatchers.IO) {
                    apiService.setupTotp()
                }
                android.util.Log.d("TotpSetup", "Response: code=${response.code()} success=${response.body()?.success}")

                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null) {
                        setupLoaded = true
                        displayQrCode(data.qrCodeUrl)
                        binding.tvManualKey.text = data.secret
                        binding.tvManualKey.visibility = View.VISIBLE
                        binding.tvManualKeyLabel.visibility = View.VISIBLE
                        binding.ivQrCode.visibility = View.VISIBLE
                        setupVerifyButton()
                    } else {
                        showSetupError("No setup data received")
                    }
                } else {
                    val errorMsg = try {
                        val body = response.errorBody()?.string() ?: ""
                        if (body.startsWith("{")) {
                            org.json.JSONObject(body).optString("message", response.message())
                        } else {
                            response.message()
                        }
                    } catch (e: Exception) {
                        response.message()
                    }
                    android.util.Log.e("TotpSetup", "Setup failed: code=${response.code()} msg=$errorMsg")
                    showSetupError("Failed to load 2FA setup: $errorMsg")
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                showSetupError("Network error: ${e.message}")
            }
        }
    }

    private fun showSetupError(message: String) {
        binding.progressBar.visibility = View.GONE
        Toast.makeText(this@TotpSetupActivity, message, Toast.LENGTH_LONG).show()
        binding.btnVerify.text = "Retry Setup"
        binding.btnVerify.isEnabled = true
        binding.btnVerify.setOnClickListener {
            binding.btnVerify.text = "Verify and Continue"
            setupVerifyButton()
            loadTotpSetup()
        }
    }

    private fun displayQrCode(qrCodeUrl: String) {
        try {
            val base64String = qrCodeUrl.substringAfter("base64,")
            val decodedBytes = Base64.decode(base64String, Base64.DEFAULT)
            val bitmap = BitmapFactory.decodeByteArray(decodedBytes, 0, decodedBytes.size)
            binding.ivQrCode.setImageBitmap(bitmap)
        } catch (e: Exception) {
            Toast.makeText(this, "Failed to display QR code", Toast.LENGTH_SHORT).show()
        }
    }

    private fun verifyTotp(totpCode: String) {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false

        lifecycleScope.launch {
            try {
                val apiService = RetrofitClient.getApiService(this@TotpSetupActivity)
                val response: Response<TotpVerifyResponse> = withContext(Dispatchers.IO) {
                    apiService.verifyTotpSetup(
                        body = mapOf("token" to totpCode)
                    )
                }

                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null && data.backupCodes.isNotEmpty()) {
                        backupCodes = data.backupCodes
                        showBackupCodes()
                    } else {
                        navigateToDashboard()
                    }
                } else {
                    Toast.makeText(
                        this@TotpSetupActivity,
                        "Invalid code. Please try again.",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true
                Toast.makeText(
                    this@TotpSetupActivity,
                    "Error: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun showBackupCodes() {
        binding.cardBackupCodes.visibility = View.VISIBLE
        binding.btnContinueToDashboard.visibility = View.VISIBLE
        binding.tvBackupCodes.text = backupCodes.joinToString("\n")

        binding.ivQrCode.visibility = View.GONE
        binding.tvInstruction.visibility = View.GONE
        binding.tvManualKeyLabel.visibility = View.GONE
        binding.tvManualKey.visibility = View.GONE
        binding.tilTotpCode.visibility = View.GONE
        binding.btnVerify.visibility = View.GONE

        Toast.makeText(
            this,
            "2FA setup complete! Save your backup codes.",
            Toast.LENGTH_LONG
        ).show()
    }

    private fun copyBackupCodesToClipboard() {
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        val clip = ClipData.newPlainText("Backup Codes", backupCodes.joinToString("\n"))
        clipboard.setPrimaryClip(clip)
        Toast.makeText(this, "Backup codes copied to clipboard", Toast.LENGTH_SHORT).show()

        // Clear clipboard after 60 seconds for security
        Handler(Looper.getMainLooper()).postDelayed({
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                    clipboard.clearPrimaryClip()
                } else {
                    // API 26-27: overwrite with empty content
                    clipboard.setPrimaryClip(ClipData.newPlainText("", ""))
                }
            } catch (_: Exception) {}
        }, 60_000)
    }

    private fun navigateToDashboard() {
        tokenManager.setTotpSetupPending(false)
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }

    /**
     * Do NOT clear totpSetupPending on destroy — only clear it on successful TOTP verification
     * (in navigateToDashboard). This ensures that if the user backgrounds the app or swipes it
     * from recents, they'll be sent back to TOTP setup on next launch.
     */
    override fun onBackPressed() {
        // Prevent going back — user must complete TOTP setup
        Toast.makeText(this, "Please complete 2FA setup to continue", Toast.LENGTH_SHORT).show()
    }
}
