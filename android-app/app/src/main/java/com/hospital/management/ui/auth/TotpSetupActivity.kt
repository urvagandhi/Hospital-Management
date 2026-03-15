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

class TotpSetupActivity : AppCompatActivity() {
    private lateinit var binding: ActivityTotpSetupBinding
    private lateinit var tokenManager: TokenManager
    private var backupCodes: List<String> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityTotpSetupBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)

        loadTotpSetup()

        binding.btnVerify.setOnClickListener {
            val totpCode = binding.etTotpCode.text.toString()
            if (totpCode.length == 6) {
                verifyTotp(totpCode)
            } else {
                Toast.makeText(this, "Please enter a 6-digit code", Toast.LENGTH_SHORT).show()
            }
        }

        binding.btnCopyBackupCodes.setOnClickListener {
            copyBackupCodesToClipboard()
        }

        binding.btnContinueToDashboard.setOnClickListener {
            navigateToDashboard()
        }
    }

    private fun loadTotpSetup() {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnVerify.isEnabled = false

        lifecycleScope.launch {
            try {
                val accessToken = withContext(Dispatchers.IO) { tokenManager.getAccessToken() }

                if (accessToken == null) {
                    Toast.makeText(
                        this@TotpSetupActivity,
                        "Session expired. Please login again.",
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                    return@launch
                }

                val apiService = RetrofitClient.getApiService(this@TotpSetupActivity)
                val response: Response<TotpSetupResponse> = withContext(Dispatchers.IO) {
                    apiService.setupTotp("Bearer $accessToken")
                }

                binding.progressBar.visibility = View.GONE
                binding.btnVerify.isEnabled = true

                if (response.isSuccessful && response.body()?.success == true) {
                    val data = response.body()?.data
                    if (data != null) {
                        displayQrCode(data.qrCodeUrl)
                        binding.tvManualKey.text = data.secret
                    }
                } else {
                    Toast.makeText(
                        this@TotpSetupActivity,
                        "Failed to load setup: ${response.message()}",
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
                val accessToken = withContext(Dispatchers.IO) { tokenManager.getAccessToken() }

                if (accessToken == null) {
                    Toast.makeText(
                        this@TotpSetupActivity,
                        "Session expired",
                        Toast.LENGTH_SHORT
                    ).show()
                    finish()
                    return@launch
                }

                val apiService = RetrofitClient.getApiService(this@TotpSetupActivity)
                val response: Response<TotpVerifyResponse> = withContext(Dispatchers.IO) {
                    apiService.verifyTotpSetup(
                        authorization = "Bearer $accessToken",
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
                }
            } catch (_: Exception) {}
        }, 60_000)
    }

    private fun navigateToDashboard() {
        val intent = Intent(this, DashboardActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        finish()
    }
}
