package com.hospital.management.ui.scanner

import android.app.Activity
import android.content.Intent
import android.os.Bundle
import com.hospital.management.utils.FileLogger
import android.widget.Toast
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.hospital.management.ui.base.BaseActivity
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.RESULT_FORMAT_JPEG
import com.google.mlkit.vision.documentscanner.GmsDocumentScannerOptions.SCANNER_MODE_FULL
import com.google.mlkit.vision.documentscanner.GmsDocumentScanning
import com.google.mlkit.vision.documentscanner.GmsDocumentScanningResult
import com.hospital.management.ui.upload.UploadActivity

class ScannerActivity : BaseActivity() {

    private lateinit var scannerLauncher: ActivityResultLauncher<IntentSenderRequest>

    companion object {
        private const val TAG = "DocumentScanner"
        const val EXTRA_SCANNED_PAGES = "scanned_pages"
        const val EXTRA_SCANNED_PDF_URI = "scanned_pdf_uri"
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
                val scannedPdfUri = scanningResult?.pdf?.uri?.toString()

                scanningResult?.pages?.let { pages ->
                    if (pages.isNotEmpty() || !scannedPdfUri.isNullOrBlank()) {
                        FileLogger.d(TAG, "Scanned ${pages.size} page(s), pdf=${!scannedPdfUri.isNullOrBlank()}")

                        // Get URIs of all scanned pages
                        val pageUris = pages.map { it.imageUri.toString() }.toTypedArray()

                        // Navigate to upload activity with all pages
                        val intent = Intent(this, UploadActivity::class.java).apply {
                            putExtra(EXTRA_SCANNED_PAGES, pageUris)
                            if (!scannedPdfUri.isNullOrBlank()) {
                                putExtra(EXTRA_SCANNED_PDF_URI, scannedPdfUri)
                            }
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
                    // PDF-only result path (some scanner versions/devices)
                    scanningResult?.pdf?.let { pdf ->
                        FileLogger.d(TAG, "PDF generated: ${pdf.uri}, ${pdf.pageCount} pages")
                        val intent = Intent(this, UploadActivity::class.java).apply {
                            putExtra(EXTRA_SCANNED_PDF_URI, pdf.uri.toString())
                            putExtra("PATIENT_ID", getIntent().getStringExtra("PATIENT_ID"))
                            putExtra("FOLDER_NAME", getIntent().getStringExtra("FOLDER_NAME"))
                            putExtra("PATIENT_NAME", getIntent().getStringExtra("PATIENT_NAME"))
                        }
                        startActivity(intent)
                    }
                    finish()
                }
            } else {
                FileLogger.d(TAG, "Scanning cancelled or failed")
                finish()
            }
        }
    }

    private fun startDocumentScanner() {
        val builder = GmsDocumentScannerOptions.Builder()
            .setGalleryImportAllowed(true)       // Allow importing from gallery
            .setPageLimit(30)                     // ML Kit hard ceiling - Allow up to 30 pages
            .setScannerMode(SCANNER_MODE_FULL)  // Auto edge-detect, perspective correct, shadow removal
        configureA4PageSize(builder)
        configureResultFormats(builder)

        val options = builder.build()

        val scanner = GmsDocumentScanning.getClient(options)

        scanner.getStartScanIntent(this)
            .addOnSuccessListener { intentSender ->
                scannerLauncher.launch(
                    IntentSenderRequest.Builder(intentSender).build()
                )
            }
            .addOnFailureListener { e ->
                FileLogger.e(TAG, "Failed to start scanner", e)
                Toast.makeText(
                    this,
                    "Failed to start scanner: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
                finish()
            }
    }

    private fun configureResultFormats(builder: GmsDocumentScannerOptions.Builder) {
        // Always support JPEG output.
        // If this ML Kit version exposes PDF output, request JPEG+PDF via reflection.
        try {
            val pdfConst = GmsDocumentScannerOptions::class.java
                .getField("RESULT_FORMAT_PDF")
                .getInt(null)

            val setFormats = builder.javaClass.getMethod("setResultFormats", IntArray::class.java)
            setFormats.invoke(builder, intArrayOf(RESULT_FORMAT_JPEG, pdfConst))
            return
        } catch (_: Exception) {
            FileLogger.d(TAG, "PDF result format not available in current ML Kit version")
        }

        builder.setResultFormats(RESULT_FORMAT_JPEG)
    }

    private fun configureA4PageSize(builder: GmsDocumentScannerOptions.Builder) {
        // Try to enforce A4 on newer ML Kit builds while keeping compatibility with older ones.
        val candidates = listOf(
            Candidate("PAGE_SIZE_A4", listOf("setPageSize", "setPageFormat", "setPaperSize")),
            Candidate("PAGE_ASPECT_RATIO_A4", listOf("setPageAspectRatio", "setAspectRatio"))
        )

        for (candidate in candidates) {
            val value = try {
                GmsDocumentScannerOptions::class.java.getField(candidate.constantName).getInt(null)
            } catch (_: Exception) {
                continue
            }

            for (methodName in candidate.builderMethods) {
                try {
                    val method = builder.javaClass.getMethod(methodName, Int::class.javaPrimitiveType)
                    method.invoke(builder, value)
                    FileLogger.d(TAG, "Scanner constrained to A4 via $methodName")
                    return
                } catch (_: Exception) {
                    // Try next candidate method.
                }
            }
        }

        FileLogger.d(TAG, "A4 scanner constraint API not exposed; A4 is enforced in upload PDF generation")
    }

    private data class Candidate(
        val constantName: String,
        val builderMethods: List<String>
    )
}
