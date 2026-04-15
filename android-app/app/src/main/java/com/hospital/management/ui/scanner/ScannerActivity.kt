package com.hospital.management.ui.scanner

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.hospital.management.ui.base.BaseActivity
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_BASE
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.hospital.management.ui.upload.UploadActivity

class ScannerActivity : BaseActivity() {

    private lateinit var scannerLauncher: ActivityResultLauncher<IntentSenderRequest>

    companion object {
        private const val TAG = "DocumentScanner"
        const val EXTRA_SCANNED_PAGES = "scanned_pages"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        setupScannerLauncher()
        startDocumentScanner()
    }

    private fun setupScannerLauncher() {
        scannerLauncher = registerForActivityResult(
            ActivityResultContracts.StartIntentSenderForResult()
        ) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val scanningResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)

                scanningResult?.pages?.let { pages ->
                    if (pages.isNotEmpty()) {
                        Log.d(TAG, "Scanned ${pages.size} page(s)")

                        // Get URIs of all scanned pages
                        val pageUris = pages.map { it.imageUri.toString() }.toTypedArray()

                        // Navigate to upload activity with all pages
                        val intent = Intent(this, UploadActivity::class.java).apply {
                            putExtra(EXTRA_SCANNED_PAGES, pageUris)
                            // Also pass first page for backward compatibility
                            putExtra("imageUri", pageUris.firstOrNull())
                            // Forward patient details
                            putExtra("PATIENT_ID", getIntent().getStringExtra("PATIENT_ID"))
                            putExtra("FOLDER_NAME", getIntent().getStringExtra("FOLDER_NAME"))
                            putExtra("PATIENT_NAME", getIntent().getStringExtra("PATIENT_NAME"))
                        }
                        startActivity(intent)
                        finish()
                    } else {
                        Toast.makeText(this, "No pages scanned", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                } ?: run {
                    // Check for PDF result (optional)
                    scanningResult?.pdf?.let { pdf ->
                        Log.d(TAG, "PDF generated: ${pdf.uri}, ${pdf.pageCount} pages")
                        Toast.makeText(this, "Document scanned: ${pdf.pageCount} pages", Toast.LENGTH_SHORT).show()
                    }
                    finish()
                }
            } else {
                Log.d(TAG, "Scanning cancelled or failed")
                finish()
            }
        }
    }

    private fun startDocumentScanner() {
        val options = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)       // Allow importing from gallery
            .setPageLimit(20)                     // Allow up to 20 pages
            .setResultFormats(RESULT_FORMAT_JPEG) // Get JPEG images
            .setScannerMode(SCANNER_MODE_BASE)  // No auto-enhancement applied
            .build()

        val scanner = GmsDocumentScanning.getClient(options)

        scanner.getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                scannerLauncher.launch(
                    IntentSenderRequest.Builder(intentSender).build()
                )
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Failed to start scanner", e)
                Toast.makeText(
                    this,
                    "Failed to start scanner: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
    }
}
