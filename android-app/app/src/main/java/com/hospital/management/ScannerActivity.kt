package com.hospital.management

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File

class ScannerActivity : AppCompatActivity() {

    private lateinit var repository: PatientRepository
    private var patientId: String = ""
    private var folderName: String = ""

    private val scannerLauncher = registerForActivityResult(
        ActivityResultContracts.StartIntentSenderForResult()
    ) { result ->
        android.util.Log.d("ScannerActivity", "Scanner result - ResultCode: ${result.resultCode}, Data: ${result.data}")
        
        // Check if ML Kit returned success but with null data (module download failure)
        if (result.resultCode == RESULT_OK && result.data == null) {
            android.util.Log.w("ScannerActivity", "ML Kit returned OK but with null data - module unavailable")
            Toast.makeText(this, "Document scanner not available on emulator. Using file picker.", Toast.LENGTH_LONG).show()
            showFallbackOptions()
            return@registerForActivityResult
        }
        
        if (result.resultCode == RESULT_OK) {
            try {
                val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
                android.util.Log.d("ScannerActivity", "Scan result obtained: ${scanResult != null}")
                
                scanResult?.pages?.let { pages ->
                    android.util.Log.d("ScannerActivity", "Pages scanned: ${pages.size}")
                    // Get the PDF file
                    scanResult.pdf?.let { pdf ->
                        android.util.Log.d("ScannerActivity", "PDF URI: ${pdf.uri}")
                        uploadScannedDocument(pdf.uri)
                        return@registerForActivityResult
                    }
                }
                // If we reach here, scanning failed
                android.util.Log.w("ScannerActivity", "Scanning completed but no valid result")
                Toast.makeText(this, "Scanning failed. Using file picker instead.", Toast.LENGTH_LONG).show()
                showFallbackOptions()
            } catch (e: Exception) {
                android.util.Log.e("ScannerActivity", "Error processing scan result: ${e.message}", e)
                Toast.makeText(this, "Scanner error. Using file picker instead.", Toast.LENGTH_LONG).show()
                showFallbackOptions()
            }
        } else if (result.resultCode == RESULT_CANCELED) {
            android.util.Log.d("ScannerActivity", "Scanning cancelled by user")
            Toast.makeText(this, "Scanning cancelled", Toast.LENGTH_SHORT).show()
            finish()
        } else {
            // Error occurred - check for specific error codes
            android.util.Log.e("ScannerActivity", "Scanner error - ResultCode: ${result.resultCode}")
            Toast.makeText(this, "Scanner not available on emulator. Using file picker instead.", Toast.LENGTH_LONG).show()
            showFallbackOptions()
        }
    }
    
    private val filePickerLauncher = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        if (uri != null) {
            uploadScannedDocument(uri)
        } else {
            Toast.makeText(this, "No file selected", Toast.LENGTH_SHORT).show()
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        
        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        repository = PatientRepository(apiService, tokenManager)
        
        // Get patient and folder info from intent
        patientId = intent.getStringExtra("PATIENT_ID") ?: ""
        folderName = intent.getStringExtra("FOLDER_NAME") ?: ""

        android.util.Log.d("ScannerActivity", "onCreate - PatientID: $patientId, FolderName: $folderName")

        if (patientId.isEmpty() || folderName.isEmpty()) {
            Toast.makeText(this, "Invalid parameters: Patient ID or Folder Name missing", Toast.LENGTH_LONG).show()
            finish()
            return
        }

        // Check if running on emulator - ML Kit doesn't work reliably on emulators
        if (isEmulator()) {
            android.util.Log.d("ScannerActivity", "Emulator detected, using file picker")
            Toast.makeText(this, "Document scanner not available on emulator. Using file picker.", Toast.LENGTH_LONG).show()
            showFallbackOptions()
        } else {
            try {
                startDocumentScanner()
            } catch (e: Exception) {
                android.util.Log.e("ScannerActivity", "Error starting scanner", e)
                Toast.makeText(this, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                showFallbackOptions()
            }
        }
    }
    
    private fun isEmulator(): Boolean {
        val result = (android.os.Build.FINGERPRINT.startsWith("generic")
                || android.os.Build.FINGERPRINT.startsWith("unknown")
                || android.os.Build.FINGERPRINT.contains("sdk_gphone")
                || android.os.Build.FINGERPRINT.contains("emulator")
                || android.os.Build.MODEL.contains("google_sdk")
                || android.os.Build.MODEL.contains("Emulator")
                || android.os.Build.MODEL.contains("Android SDK built for x86")
                || android.os.Build.MODEL.contains("sdk_gphone")
                || android.os.Build.MANUFACTURER.contains("Genymotion")
                || android.os.Build.MANUFACTURER == "Google" && (android.os.Build.MODEL.contains("sdk") || android.os.Build.DEVICE.contains("emu"))
                || (android.os.Build.BRAND.startsWith("generic") && android.os.Build.DEVICE.startsWith("generic"))
                || "google_sdk" == android.os.Build.PRODUCT
                || android.os.Build.PRODUCT.contains("sdk")
                || android.os.Build.PRODUCT.contains("vbox")
                || android.os.Build.HARDWARE.contains("goldfish")
                || android.os.Build.HARDWARE.contains("ranchu"))
        
        android.util.Log.d("ScannerActivity", "Emulator check - MODEL: ${android.os.Build.MODEL}, MANUFACTURER: ${android.os.Build.MANUFACTURER}, FINGERPRINT: ${android.os.Build.FINGERPRINT}, Result: $result")
        return result
    }

    private fun startDocumentScanner() {
        try {
            val options = GmsDocumentScannerOptions.Builder()
                .setGalleryImportAllowed(true)
                .setPageLimit(20)
                .setResultFormats(
                    GmsDocumentScannerOptions.RESULT_FORMAT_PDF,
                    GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
                )
                .setScannerMode(GmsDocumentScannerOptions.SCANNER_MODE_FULL)
                .build()

            val scanner = GmsDocumentScanning.getClient(options)

            scanner.getStartScanIntent(this)
                .addOnSuccessListener { intentSender ->
                    try {
                        scannerLauncher.launch(
                            IntentSenderRequest.Builder(intentSender).build()
                        )
                    } catch (e: Exception) {
                        android.util.Log.e("ScannerActivity", "Error launching scanner", e)
                        Toast.makeText(this, "Scanner launch failed", Toast.LENGTH_SHORT).show()
                        showFallbackOptions()
                    }
                }
                .addOnFailureListener { e ->
                    android.util.Log.e("ScannerActivity", "ML Kit not available", e)
                    // ML Kit not available, show fallback options
                    showFallbackOptions()
                }
        } catch (e: Exception) {
            android.util.Log.e("ScannerActivity", "Error initializing scanner", e)
            Toast.makeText(this, "Scanner initialization failed", Toast.LENGTH_SHORT).show()
            showFallbackOptions()
        }
    }
    
    private fun showFallbackOptions() {
        AlertDialog.Builder(this)
            .setTitle("Upload Document")
            .setMessage("ML Kit Document Scanner is not available on this device. Please choose an option:")
            .setPositiveButton("Pick File") { _, _ ->
                // Use file picker as fallback
                filePickerLauncher.launch("*/*")
            }
            .setNegativeButton("Cancel") { _, _ ->
                finish()
            }
            .setCancelable(false)
            .show()
    }

    private fun uploadScannedDocument(uri: Uri) {
        android.util.Log.d("ScannerActivity", "Starting upload for URI: $uri")
        Toast.makeText(this, "Uploading document...", Toast.LENGTH_SHORT).show()

        lifecycleScope.launch {
            try {
                android.util.Log.d("ScannerActivity", "Opening input stream from URI")
                // Copy URI to temporary file
                val inputStream = contentResolver.openInputStream(uri)
                if (inputStream == null) {
                    android.util.Log.e("ScannerActivity", "Failed to open input stream from URI")
                    Toast.makeText(this@ScannerActivity, "Failed to read selected file", Toast.LENGTH_LONG).show()
                    finish()
                    return@launch
                }
                
                val tempFile = File(cacheDir, "scanned_${System.currentTimeMillis()}.pdf")
                android.util.Log.d("ScannerActivity", "Copying file to temp location: ${tempFile.absolutePath}")
                
                inputStream.use { input ->
                    tempFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }
                
                android.util.Log.d("ScannerActivity", "File copied successfully, size: ${tempFile.length()} bytes")

                // Create multipart request
                val requestFile = tempFile.asRequestBody("application/pdf".toMediaTypeOrNull())
                val body = MultipartBody.Part.createFormData("file", tempFile.name, requestFile)

                android.util.Log.d("ScannerActivity", "Uploading to backend - PatientID: $patientId, Folder: $folderName")
                // Upload to backend
                val response = repository.uploadFile(patientId, folderName, body)
                
                android.util.Log.d("ScannerActivity", "Upload response - Code: ${response.code()}, Successful: ${response.isSuccessful}")
                
                if (response.isSuccessful) {
                    Toast.makeText(this@ScannerActivity, "Document uploaded successfully", Toast.LENGTH_SHORT).show()
                    android.util.Log.d("ScannerActivity", "Upload successful")
                    
                    // Clean up temp file
                    tempFile.delete()
                    
                    // Return to folder view
                    finish()
                } else {
                    val errorBody = response.errorBody()?.string() ?: "Unknown error"
                    android.util.Log.e("ScannerActivity", "Upload failed - Code: ${response.code()}, Error: $errorBody")
                    Toast.makeText(this@ScannerActivity, "Upload failed: ${response.code()}", Toast.LENGTH_LONG).show()
                    tempFile.delete()
                    finish()
                }
            } catch (e: Exception) {
                android.util.Log.e("ScannerActivity", "Upload exception: ${e.message}", e)
                Toast.makeText(this@ScannerActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
                finish()
            }
        }
    }
}
