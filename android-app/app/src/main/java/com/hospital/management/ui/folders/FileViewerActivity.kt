package com.hospital.management.ui.folders

import android.graphics.Bitmap
import android.graphics.pdf.PdfRenderer
import android.os.Bundle
import android.os.ParcelFileDescriptor
import android.view.ViewGroup
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.bumptech.glide.Glide
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.ui.base.BaseActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileOutputStream
import java.net.URL

/**
 * A3 — In-app file viewer. Images via Glide, PDFs via PdfRenderer.
 * Fetches a signed URL (B5) before downloading when available.
 *
 * Launch via Intent extras:
 *   patientId, folderName, fileId, fileName, mimeType, [fileUrl]
 */
class FileViewerActivity : BaseActivity() {

    private lateinit var progress: ProgressBar
    private lateinit var content: FrameLayout
    private lateinit var pageIndicator: TextView
    private lateinit var prevBtn: Button
    private lateinit var nextBtn: Button

    private var pdfRenderer: PdfRenderer? = null
    private var pdfFile: File? = null
    private var pageIndex = 0
    private var pdfImageView: ImageView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)

        val patientId = intent.getStringExtra("patientId") ?: run { finish(); return }
        val folderName = intent.getStringExtra("folderName") ?: run { finish(); return }
        val fileId = intent.getStringExtra("fileId") ?: run { finish(); return }
        val fileName = intent.getStringExtra("fileName") ?: "File"
        val mimeType = intent.getStringExtra("mimeType") ?: ""
        val fallbackUrl = intent.getStringExtra("fileUrl")

        title = fileName

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
        }
        progress = ProgressBar(this)
        root.addView(progress)

        content = FrameLayout(this).apply {
            layoutParams = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                0,
                1f,
            )
        }
        root.addView(content)

        val nav = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            visibility = android.view.View.GONE
        }
        prevBtn = Button(this).apply { text = "Prev"; setOnClickListener { showPdfPage(pageIndex - 1) } }
        nextBtn = Button(this).apply { text = "Next"; setOnClickListener { showPdfPage(pageIndex + 1) } }
        pageIndicator = TextView(this).apply {
            gravity = android.view.Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        nav.addView(prevBtn); nav.addView(pageIndicator); nav.addView(nextBtn)
        root.addView(nav)

        setContentView(root)

        loadFile(patientId, folderName, fileId, mimeType, fallbackUrl, nav)
    }

    private fun loadFile(
        patientId: String,
        folderName: String,
        fileId: String,
        mimeType: String,
        fallbackUrl: String?,
        nav: LinearLayout,
    ) {
        lifecycleScope.launch {
            try {
                val api = RetrofitClient.getApiService(this@FileViewerActivity)
                val signed = try {
                    val r = withContext(Dispatchers.IO) {
                        api.getFileSignedUrl(patientId, folderName, fileId, false)
                    }
                    r.body()?.data?.url
                } catch (_: Exception) { null }

                val url = signed ?: fallbackUrl
                if (url.isNullOrBlank()) {
                    progress.visibility = android.view.View.GONE
                    Toast.makeText(this@FileViewerActivity, "No URL available", Toast.LENGTH_LONG).show()
                    return@launch
                }

                when {
                    mimeType.startsWith("image/") -> showImage(url)
                    mimeType == "application/pdf" -> showPdf(url, nav)
                    else -> {
                        progress.visibility = android.view.View.GONE
                        Toast.makeText(this@FileViewerActivity,
                            "Preview not available for this type", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                progress.visibility = android.view.View.GONE
                Toast.makeText(this@FileViewerActivity, "Error: ${e.message}", Toast.LENGTH_LONG).show()
            }
        }
    }

    private fun showImage(url: String) {
        progress.visibility = android.view.View.GONE
        val iv = ImageView(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        content.addView(iv)
        Glide.with(this).load(url).into(iv)
    }

    private suspend fun showPdf(url: String, nav: LinearLayout) {
        // Update UI for download phase
        withContext(Dispatchers.Main) {
            progress.visibility = android.view.View.VISIBLE
            pageIndicator.text = "Downloading PDF..."
            nav.visibility = android.view.View.VISIBLE
            prevBtn.visibility = android.view.View.GONE
            nextBtn.visibility = android.view.View.GONE
        }

        // Download to cache with progress tracking
        val file = withContext(Dispatchers.IO) {
            val out = File.createTempFile("viewer_", ".pdf", cacheDir)
            val connection = URL(url).openConnection()
            connection.connect()
            val totalSize = connection.contentLength
            
            connection.getInputStream().use { input ->
                FileOutputStream(out).use { output ->
                    val buffer = ByteArray(8192)
                    var bytesRead: Int
                    var totalRead = 0L
                    while (input.read(buffer).also { bytesRead = it } != -1) {
                        output.write(buffer, 0, bytesRead)
                        totalRead += bytesRead
                        if (totalSize > 0) {
                            val progressPercent = (totalRead * 100 / totalSize).toInt()
                            withContext(Dispatchers.Main) {
                                pageIndicator.text = "Downloading: $progressPercent%"
                            }
                        }
                    }
                }
            }
            out
        }
        pdfFile = file
        val descriptor = ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY)
        pdfRenderer = PdfRenderer(descriptor)

        withContext(Dispatchers.Main) {
            progress.visibility = android.view.View.GONE
            prevBtn.visibility = android.view.View.VISIBLE
            nextBtn.visibility = android.view.View.VISIBLE
            
            pdfImageView = ImageView(this@FileViewerActivity).apply {
                layoutParams = FrameLayout.LayoutParams(
                    FrameLayout.LayoutParams.MATCH_PARENT,
                    FrameLayout.LayoutParams.MATCH_PARENT,
                )
                scaleType = ImageView.ScaleType.FIT_CENTER
            }
            content.addView(pdfImageView)
            showPdfPage(0)
        }
    }

    private fun showPdfPage(index: Int) {
        val renderer = pdfRenderer ?: return
        if (index < 0 || index >= renderer.pageCount) return
        pageIndex = index
        val page = renderer.openPage(index)
        val bmp = Bitmap.createBitmap(page.width * 2, page.height * 2, Bitmap.Config.ARGB_8888)
        page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
        pdfImageView?.setImageBitmap(bmp)
        page.close()
        pageIndicator.text = "Page ${index + 1} of ${renderer.pageCount}"
        prevBtn.isEnabled = index > 0
        nextBtn.isEnabled = index < renderer.pageCount - 1
    }

    override fun onDestroy() {
        super.onDestroy()
        try { pdfRenderer?.close() } catch (_: Exception) {}
        try { pdfFile?.delete() } catch (_: Exception) {}
    }

    override fun onSupportNavigateUp(): Boolean { finish(); return true }
}
