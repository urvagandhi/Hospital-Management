package com.hospital.management.ui.upload

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.recyclerview.widget.ItemTouchHelper
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityUploadBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.io.FileOutputStream
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.scanner.ScannerActivity
import java.util.Collections

class UploadActivity : BaseActivity() {

    companion object {
        private const val MAX_SERVER_UPLOAD_BYTES = 20L * 1024L * 1024L
    }

    private lateinit var binding: ActivityUploadBinding
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager

    private val scannedPages = mutableListOf<Uri>()
    private var scannedPdfUri: Uri? = null
    private lateinit var pageAdapter: PageAdapter
    private var currentPageIndex = 0

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityUploadBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()
        setupObservers()
        loadScannedPages()
        setupRecyclerView()
        setupClickListeners()
        setupFormFields()
    }

    private var patientName: String = ""
    private var patientId: String = ""
    private var folderName: String = ""

    private fun setupFormFields() {
        patientId = intent.getStringExtra("PATIENT_ID") ?: ""
        folderName = intent.getStringExtra("FOLDER_NAME") ?: ""
        patientName = intent.getStringExtra("PATIENT_NAME") ?: ""

        // Set dynamic title
        val title = if (patientName.isNotEmpty()) "$patientName / $folderName" else folderName
        binding.tvTitle.text = title

        // Show patient name prefix in filename hint
        val sanitizedPatientName = patientName.replace(Regex("[^A-Za-z0-9 ]"), "").trim()
        if (sanitizedPatientName.isNotEmpty()) {
            binding.tilFileName.hint = "File name (optional)"
            binding.tilFileName.prefixText = "${sanitizedPatientName}_"
        }
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(
            apiService, tokenManager,
            com.hospital.management.data.local.AppDatabase.getDatabase(this).patientCacheDao()
        )
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun loadScannedPages() {
        val scannerPdfUri = intent.getStringExtra(ScannerActivity.EXTRA_SCANNED_PDF_URI)
        if (!scannerPdfUri.isNullOrBlank()) {
            scannedPdfUri = Uri.parse(scannerPdfUri)
        }

        // Get multiple pages from scanner
        val pageUris = intent.getStringArrayExtra(ScannerActivity.EXTRA_SCANNED_PAGES)

        if (pageUris != null && pageUris.isNotEmpty()) {
            scannedPages.addAll(pageUris.map { Uri.parse(it) })
        } else {
            // Fallback for single image (backward compatibility)
            val singleUri = intent.getStringExtra("imageUri")
            if (singleUri != null) {
                scannedPages.add(Uri.parse(singleUri))
            }
        }

        updatePageCount()
        updateMainPreview()
    }

    private fun setupRecyclerView() {
        pageAdapter = PageAdapter(
            pages = scannedPages,
            onPageClick = { index ->
                currentPageIndex = index
                updateMainPreview()
                pageAdapter.setSelectedPosition(index)
            },
            onPageDelete = { index ->
                if (scannedPages.size > 1) {
                    scannedPages.removeAt(index)
                    pageAdapter.notifyItemRemoved(index)
                    if (currentPageIndex >= scannedPages.size) {
                        currentPageIndex = scannedPages.size - 1
                    }
                    updateMainPreview()
                    updatePageCount()
                } else {
                    Toast.makeText(this, "Cannot delete the only page", Toast.LENGTH_SHORT).show()
                }
            }
        )

        binding.rvPages.apply {
            layoutManager = LinearLayoutManager(this@UploadActivity, LinearLayoutManager.HORIZONTAL, false)
            adapter = pageAdapter
        }

        // Setup drag to reorder
        val itemTouchHelper = ItemTouchHelper(object : ItemTouchHelper.SimpleCallback(
            ItemTouchHelper.LEFT or ItemTouchHelper.RIGHT, 0
        ) {
            override fun onMove(
                recyclerView: RecyclerView,
                viewHolder: RecyclerView.ViewHolder,
                target: RecyclerView.ViewHolder
            ): Boolean {
                val from = viewHolder.bindingAdapterPosition
                val to = target.bindingAdapterPosition
                Collections.swap(scannedPages, from, to)
                pageAdapter.notifyItemMoved(from, to)
                return true
            }

            override fun onSwiped(viewHolder: RecyclerView.ViewHolder, direction: Int) {}
        })
        itemTouchHelper.attachToRecyclerView(binding.rvPages)

        // Show/hide recycler based on page count
        binding.rvPages.visibility = if (scannedPages.size > 1) View.VISIBLE else View.GONE
        binding.tvPagesLabel.visibility = if (scannedPages.size > 1) View.VISIBLE else View.GONE
    }

    private fun updateMainPreview() {
        if (scannedPages.isNotEmpty() && currentPageIndex < scannedPages.size) {
            binding.ivPreview.setImageURI(scannedPages[currentPageIndex])
        } else {
            binding.ivPreview.setImageDrawable(null)
        }
    }

    private fun updatePageCount() {
        binding.tvPageCount.text = if (scannedPages.isNotEmpty()) {
            "${scannedPages.size} page${if (scannedPages.size > 1) "s" else ""} scanned"
        } else if (scannedPdfUri != null) {
            "Scanner PDF ready"
        } else {
            "No pages scanned"
        }
        binding.rvPages.visibility = if (scannedPages.size > 1) View.VISIBLE else View.GONE
        binding.tvPagesLabel.visibility = if (scannedPages.size > 1) View.VISIBLE else View.GONE
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.btnUpload.isEnabled = false
                        binding.tvUploadProgress.visibility = View.VISIBLE
                    }
                    is PatientState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        binding.tvUploadProgress.visibility = View.GONE
                        if (state.message == "File uploaded successfully") {
                            Toast.makeText(this@UploadActivity, state.message, Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    }
                    is PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        binding.tvUploadProgress.visibility = View.GONE
                        Toast.makeText(this@UploadActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        binding.tvUploadProgress.visibility = View.GONE
                    }
                }
            }
        }
    }

    private fun setupClickListeners() {
        binding.btnUpload.setOnClickListener {
            uploadFiles()
        }

        binding.btnBack.setOnClickListener {
            finish()
        }
    }

    private fun uploadFiles() {
        // Use class properties directly
        if (patientId.isEmpty() || folderName.isEmpty() || (scannedPages.isEmpty() && scannedPdfUri == null)) {
            Toast.makeText(this, "Missing patient info or documents", Toast.LENGTH_SHORT).show()
            return
        }

        binding.btnUpload.isEnabled = false
        binding.progressBar.visibility = View.VISIBLE
        binding.tvUploadProgress.visibility = View.VISIBLE
        binding.tvUploadProgress.text = "Creating PDF..."

        lifecycleScope.launch {
            val database = com.hospital.management.data.local.AppDatabase.getDatabase(this@UploadActivity)
            val docRepository = com.hospital.management.data.repository.DocumentRepository(
                RetrofitClient.getApiService(this@UploadActivity),
                database.documentDao(),
                this@UploadActivity
            )

            try {
                // Build filename: use user input if provided, otherwise auto-generate
                val userInput = binding.etFileName.text.toString().trim()
                val sanitizedPatientName = patientName.replace(Regex("[^A-Za-z0-9]"), "_").take(30)
                val pdfFileName = if (userInput.isNotEmpty()) {
                    val sanitizedInput = userInput.replace(Regex("[^A-Za-z0-9_\\- ]"), "_")
                    "${sanitizedPatientName}_${sanitizedInput}.pdf"
                } else {
                    val sanitizedFolderName = folderName.replace(Regex("[^A-Za-z0-9]"), "_").take(30)
                    "${sanitizedPatientName}_${sanitizedFolderName}_${System.currentTimeMillis()}.pdf"
                }

                val pdfResult: com.hospital.management.utils.PdfUtils.PdfResult? = when {
                    scannedPdfUri != null -> {
                        binding.tvUploadProgress.text = "Preparing scanner PDF..."
                        withContext(Dispatchers.IO) {
                            val copiedPdf = copyPdfFromUri(scannedPdfUri!!, pdfFileName)
                            if (copiedPdf != null && copiedPdf.length() <= MAX_SERVER_UPLOAD_BYTES) {
                                // Raw copy — no compression profile applied.
                                com.hospital.management.utils.PdfUtils.PdfResult(copiedPdf, -1)
                            } else {
                                copiedPdf?.delete()
                                com.hospital.management.utils.PdfUtils.recompressPdfFromUri(
                                    applicationContext,
                                    scannedPdfUri!!,
                                    pdfFileName,
                                    folderName
                                )
                            }
                        }
                    }
                    scannedPages.isNotEmpty() -> {
                        binding.tvUploadProgress.text = "Converting ${scannedPages.size} page(s) to PDF..."
                        withContext(Dispatchers.IO) {
                            com.hospital.management.utils.PdfUtils.createPdfFromImages(
                                applicationContext,
                                scannedPages,
                                pdfFileName,
                                folderName
                            )
                        }
                    }
                    else -> null
                }

                val pdfFile = pdfResult?.file
                val uploadProfileUsed = pdfResult?.profileUsed ?: -1

                if (pdfFile == null) {
                    withContext(Dispatchers.Main) {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        binding.tvUploadProgress.visibility = View.GONE
                        Toast.makeText(this@UploadActivity, "Failed to create PDF", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                // Keep generated PDFs within the backend's hard upload cap.
                if (pdfFile.length() > MAX_SERVER_UPLOAD_BYTES) {
                    withContext(Dispatchers.Main) {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        binding.tvUploadProgress.visibility = View.GONE
                        val sizeMb = "%.1f".format(pdfFile.length().toDouble() / (1024.0 * 1024.0))
                        Toast.makeText(
                            this@UploadActivity,
                            "File is ${sizeMb}MB. Max upload is 20MB. Reduce pages and try again.",
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    pdfFile.delete()
                    return@launch
                }

                val isOnline = isNetworkAvailable()
                // One key per logical upload. Reused on offline save so the worker's
                // retry dedupes server-side if the original request already succeeded.
                val idempotencyKey = docRepository.newIdempotencyKey()

                if (isOnline) {
                    binding.tvUploadProgress.text = "Uploading PDF..."
                    val result = docRepository.uploadDocument(patientId, folderName, pdfFile, idempotencyKey, uploadProfileUsed)

                    binding.progressBar.visibility = View.GONE
                    binding.btnUpload.isEnabled = true
                    binding.tvUploadProgress.visibility = View.GONE

                    if (result.isSuccess) {
                        // Delete local PDF after successful upload
                        pdfFile.delete()
                        Toast.makeText(this@UploadActivity, "PDF uploaded successfully!", Toast.LENGTH_SHORT).show()
                        finish()
                    } else {
                        if (result.retryable) {
                            // Retryable failures (network/server) are safe to queue for later sync.
                            // Tag with current hospitalId so the sync worker can refuse to upload
                            // it under a different account if the user logs out and another logs in.
                            val ownerHospitalId = tokenManager.getHospitalId() ?: ""
                            docRepository.saveOffline(patientId, folderName, android.net.Uri.fromFile(pdfFile).toString(), ownerHospitalId, idempotencyKey, uploadProfileUsed)
                            Toast.makeText(this@UploadActivity, "Upload failed. Saved offline.", Toast.LENGTH_LONG).show()
                            finish()
                        } else {
                            // Permanent failures (e.g. payload rejected) should not be queued as pending.
                            pdfFile.delete()
                            val backendMessage = result.message?.takeIf { it.isNotBlank() } ?: "Upload rejected by server"
                            Toast.makeText(this@UploadActivity, backendMessage, Toast.LENGTH_LONG).show()
                        }
                    }
                } else {
                    // Offline - save PDF locally with its key + owner tag
                    val ownerHospitalId = tokenManager.getHospitalId() ?: ""
                    docRepository.saveOffline(patientId, folderName, android.net.Uri.fromFile(pdfFile).toString(), ownerHospitalId, idempotencyKey)

                    binding.progressBar.visibility = View.GONE
                    binding.btnUpload.isEnabled = true
                    binding.tvUploadProgress.visibility = View.GONE

                    Toast.makeText(this@UploadActivity, "Saved offline. Will sync when connected.", Toast.LENGTH_LONG).show()
                    finish()
                }
            } catch (e: Exception) {
                e.printStackTrace()
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    binding.btnUpload.isEnabled = true
                    binding.tvUploadProgress.visibility = View.GONE
                    Toast.makeText(this@UploadActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return false
        return activeNetwork.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private suspend fun saveFileForStorage(uri: Uri, index: Int): File? = withContext(Dispatchers.IO) {
        try {
             // Compress image first
             val compressedFile = com.hospital.management.utils.ImageUtils.compressImage(applicationContext, uri)
             if (compressedFile == null) return@withContext null

             val fileName = "doc_${System.currentTimeMillis()}_$index.jpg"
             // Use app's private files directory so it's safer
             val file = File(filesDir, fileName)

             // Copy compressed file to permanent storage
             compressedFile.copyTo(file, overwrite = true)
             return@withContext file
        } catch(e: Exception) {
            e.printStackTrace()
            return@withContext null
        }
    }

    private fun copyPdfFromUri(uri: Uri, outputFileName: String): File? {
        return try {
            val safeFileName = if (outputFileName.lowercase().endsWith(".pdf")) {
                outputFileName
            } else {
                "$outputFileName.pdf"
            }
            val file = File(filesDir, safeFileName)
            contentResolver.openInputStream(uri)?.use { input ->
                FileOutputStream(file).use { output ->
                    input.copyTo(output)
                }
            } ?: return null
            file
        } catch (e: Exception) {
            e.printStackTrace()
            null
        }
    }

    private suspend fun getFileFromUri(uri: Uri, index: Int): File? = withContext(Dispatchers.IO) {
        try {
            // For content:// URIs, copy to app's cache directory
            if (uri.scheme == "content") {
                val inputStream = contentResolver.openInputStream(uri)
                val file = File(cacheDir, "scan_page_${index}_${System.currentTimeMillis()}.jpg")
                inputStream?.use { input ->
                    FileOutputStream(file).use { output ->
                        input.copyTo(output)
                    }
                }
                return@withContext file
            } else {
                // For file:// URIs
                return@withContext File(uri.path!!)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            return@withContext null
        }
    }

    // Inner adapter class for page thumbnails
    inner class PageAdapter(
        private val pages: List<Uri>,
        private val onPageClick: (Int) -> Unit,
        private val onPageDelete: (Int) -> Unit
    ) : RecyclerView.Adapter<PageAdapter.PageViewHolder>() {

        private var selectedPosition = 0

        fun setSelectedPosition(position: Int) {
            val oldPosition = selectedPosition
            selectedPosition = position
            notifyItemChanged(oldPosition)
            notifyItemChanged(position)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): PageViewHolder {
            val view = LayoutInflater.from(parent.context)
                .inflate(R.layout.item_page_thumbnail, parent, false)
            return PageViewHolder(view)
        }

        override fun onBindViewHolder(holder: PageViewHolder, position: Int) {
            holder.bind(pages[position], position)
        }

        override fun getItemCount() = pages.size

        inner class PageViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
            private val ivThumbnail: ImageView = itemView.findViewById(R.id.ivThumbnail)
            private val tvPageNumber: TextView = itemView.findViewById(R.id.tvPageNumber)
            private val btnDelete: View = itemView.findViewById(R.id.btnDelete)
            private val cardView: View = itemView.findViewById(R.id.cardThumbnail)

            fun bind(uri: Uri, position: Int) {
                ivThumbnail.setImageURI(uri)
                tvPageNumber.text = "Page ${position + 1}"

                // Highlight selected
                cardView.alpha = if (position == selectedPosition) 1f else 0.7f
                cardView.scaleX = if (position == selectedPosition) 1f else 0.95f
                cardView.scaleY = if (position == selectedPosition) 1f else 0.95f

                itemView.setOnClickListener { onPageClick(position) }
                btnDelete.setOnClickListener { onPageDelete(position) }
            }
        }
    }
}
