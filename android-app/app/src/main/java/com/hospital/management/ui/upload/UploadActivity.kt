package com.hospital.management.ui.upload

import android.app.Activity
import android.content.Intent
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
import com.hospital.management.utils.FileLogger
import java.util.Collections

class UploadActivity : BaseActivity() {

    companion object {
        private const val TAG = "UploadActivity"
        private val MAX_SERVER_UPLOAD_BYTES = com.hospital.management.BuildConfig.MAX_UPLOAD_SIZE_MB * 1024L * 1024L
    }

    private lateinit var binding: ActivityUploadBinding
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager
    private lateinit var scannerLauncher: androidx.activity.result.ActivityResultLauncher<Intent>

    private val scannedPages = mutableListOf<Uri>()
    private var scannedPdfUri: Uri? = null
    private lateinit var pageAdapter: PageAdapter
    private var currentPageIndex = 0
    private var replaceIndex = -1

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityUploadBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupScannerLauncher()
        setupViewModel()
        setupObservers()
        loadScannedPages()
        setupRecyclerView()
        setupClickListeners()
        setupFormFields()

        FileLogger.i(TAG, "UploadActivity created:" +
                "\n  patientId=$patientId" +
                "\n  patientName=$patientName" +
                "\n  folderName=$folderName" +
                "\n  scannedPages=${scannedPages.size}" +
                "\n  hasPdfUri=${scannedPdfUri != null}")
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

    private fun setupScannerLauncher() {
        scannerLauncher = registerForActivityResult(androidx.activity.result.contract.ActivityResultContracts.StartActivityForResult()) { result ->
            if (result.resultCode == Activity.RESULT_OK) {
                val data = result.data
                val newPageUris = data?.getStringArrayExtra(ScannerActivity.EXTRA_SCANNED_PAGES)
                val returnedReplaceIndex = data?.getIntExtra(ScannerActivity.EXTRA_REPLACE_INDEX, -1) ?: -1
                
                if (newPageUris != null && newPageUris.isNotEmpty()) {
                    if (returnedReplaceIndex != -1 && returnedReplaceIndex < scannedPages.size) {
                        // Replace mode: remove the old page and insert new one(s)
                        scannedPages.removeAt(returnedReplaceIndex)
                        scannedPages.addAll(returnedReplaceIndex, newPageUris.map { Uri.parse(it) })
                        pageAdapter.notifyItemRangeChanged(returnedReplaceIndex, scannedPages.size - returnedReplaceIndex)
                        currentPageIndex = returnedReplaceIndex
                    } else {
                        // Append mode
                        val startIndex = scannedPages.size
                        scannedPages.addAll(newPageUris.map { Uri.parse(it) })
                        pageAdapter.notifyItemRangeInserted(startIndex, newPageUris.size)
                        currentPageIndex = scannedPages.size - 1
                    }
                    updateMainPreview()
                    updatePageCount()
                    pageAdapter.setSelectedPosition(currentPageIndex)
                }
            }
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
            },
            onPageRetake = { index ->
                val intent = Intent(this, ScannerActivity::class.java).apply {
                    putExtra("PATIENT_ID", patientId)
                    putExtra("FOLDER_NAME", folderName)
                    putExtra("PATIENT_NAME", patientName)
                    putExtra(ScannerActivity.EXTRA_APPEND_MODE, true)
                    putExtra(ScannerActivity.EXTRA_REPLACE_INDEX, index)
                }
                scannerLauncher.launch(intent)
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
                        binding.btnUpload.isEnabled = false
                    }
                    is PatientState.Success -> {
                        binding.btnUpload.isEnabled = true
                        if (state.message == "File uploaded successfully") {
                            Toast.makeText(this@UploadActivity, state.message, Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    }
                    is PatientState.Error -> {
                        binding.btnUpload.isEnabled = true
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
            onBackPressedDispatcher.onBackPressed()
        }

        binding.btnAddPages.setOnClickListener {
            val intent = Intent(this, ScannerActivity::class.java).apply {
                putExtra("PATIENT_ID", patientId)
                putExtra("FOLDER_NAME", folderName)
                putExtra("PATIENT_NAME", patientName)
                putExtra(ScannerActivity.EXTRA_APPEND_MODE, true)
            }
            scannerLauncher.launch(intent)
        }
    }

    private fun uploadFiles() {
        // Use class properties directly
        if (patientId.isEmpty() || folderName.isEmpty() || (scannedPages.isEmpty() && scannedPdfUri == null)) {
            FileLogger.w(TAG, "Upload aborted — missing data: patientId=${patientId.isNotEmpty()}, " +
                    "folderName=${folderName.isNotEmpty()}, pages=${scannedPages.size}, hasPdf=${scannedPdfUri != null}")
            Toast.makeText(this, "Missing patient info or documents", Toast.LENGTH_SHORT).show()
            return
        }

        FileLogger.i(TAG, "═══ UPLOAD INITIATED ═══" +
                "\n  patientId=$patientId" +
                "\n  patientName=$patientName" +
                "\n  folderName=$folderName" +
                "\n  scannedPages=${scannedPages.size}" +
                "\n  hasScannerPdf=${scannedPdfUri != null}")

        binding.btnUpload.isEnabled = false

        lifecycleScope.launch {
            val database = com.hospital.management.data.local.AppDatabase.getDatabase(this@UploadActivity)
            val docRepository = com.hospital.management.data.repository.DocumentRepository(
                RetrofitClient.getApiService(this@UploadActivity),
                database.documentDao(),
                this@UploadActivity
            )

            try {
                // Build filename
                val userInput = binding.etFileName.text.toString().trim()
                val sanitizedPatientName = patientName.replace(Regex("[^A-Za-z0-9]"), "_").take(30)
                val sanitizedFolderName = folderName.replace(Regex("[^A-Za-z0-9]"), "_").take(30)
                
                val pdfFileName = if (userInput.isNotEmpty()) {
                    val sanitizedInput = userInput.replace(Regex("[^A-Za-z0-9_\\- ]"), "_")
                    "${sanitizedPatientName}_${sanitizedFolderName}_${sanitizedInput}.pdf"
                } else {
                    val random = System.currentTimeMillis().toString().takeLast(6)
                    "${sanitizedPatientName}_${sanitizedFolderName}_${random}.pdf"
                }

                val idempotencyKey = docRepository.newIdempotencyKey()
                val ownerHospitalId = tokenManager.getHospitalId() ?: ""

                // ── STEP 1: Copy images to local durable storage (VERY FAST) ──
                val pendingDir = File(filesDir, "pending_images/$idempotencyKey").also { it.mkdirs() }
                val localImagePaths = withContext(Dispatchers.IO) {
                    scannedPages.mapIndexed { index, uri ->
                        val dest = File(pendingDir, "page_$index.jpg")
                        contentResolver.openInputStream(uri)?.use { input ->
                            dest.outputStream().use { output -> input.copyTo(output) }
                        }
                        Uri.fromFile(dest).toString()
                    }
                }

                // Handle scanner-provided PDF if any
                val scannerPdfUriStr = if (scannedPdfUri != null) {
                    withContext(Dispatchers.IO) {
                        val dest = File(pendingDir, "scanner_source.pdf")
                        contentResolver.openInputStream(scannedPdfUri!!)?.use { input ->
                            dest.outputStream().use { output -> input.copyTo(output) }
                        }
                        Uri.fromFile(dest).toString()
                    }
                } else null

                // ── STEP 2: Insert placeholder row ──
                val isOnline = isNetworkAvailable()
                val initialStatus = if (isOnline) {
                    com.hospital.management.data.local.SyncStatus.UPLOADING
                } else {
                    com.hospital.management.data.local.SyncStatus.PENDING
                }

                val document = com.hospital.management.data.local.OfflineDocument(
                    patientId = patientId,
                    folderName = folderName,
                    fileUri = scannerPdfUriStr ?: "", 
                    status = initialStatus,
                    idempotencyKey = idempotencyKey,
                    ownerHospitalId = ownerHospitalId,
                    displayName = pdfFileName
                )

                val rowId = docRepository.insertQueuedRow(document)

                withContext(Dispatchers.Main) {
                    binding.btnUpload.isEnabled = true

                    if (isOnline) {
                        val constraints = androidx.work.Constraints.Builder()
                            .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                            .build()
                        
                        val inputData = androidx.work.Data.Builder()
                            .putLong("offline_doc_id", rowId)
                            .putString(com.hospital.management.worker.UploadWorker.KEY_PATIENT_ID, patientId)
                            .putString(com.hospital.management.worker.UploadWorker.KEY_FOLDER_NAME, folderName)
                            .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_NAME, pdfFileName)
                            .putStringArray(com.hospital.management.worker.UploadWorker.KEY_IMAGE_URIS, localImagePaths.toTypedArray())
                            .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_URI, scannerPdfUriStr ?: "")
                            .putString(com.hospital.management.worker.UploadWorker.KEY_IDEMPOTENCY_KEY, idempotencyKey)
                            .putString(com.hospital.management.worker.UploadWorker.KEY_OWNER_HOSPITAL_ID, ownerHospitalId)
                            .build()

                        val request = androidx.work.OneTimeWorkRequestBuilder<com.hospital.management.worker.UploadWorker>()
                            .setInputData(inputData)
                            .setConstraints(constraints)
                            .addTag(com.hospital.management.worker.UploadWorker.TAG_UPLOAD)
                            .build()

                        androidx.work.WorkManager.getInstance(applicationContext)
                            .enqueueUniqueWork(
                                "upload_${idempotencyKey}",
                                androidx.work.ExistingWorkPolicy.KEEP,
                                request
                            )

                        Toast.makeText(this@UploadActivity, getString(R.string.upload_in_progress_toast), Toast.LENGTH_LONG).show()
                    } else {
                        Toast.makeText(this@UploadActivity, "Saved offline. Will sync when connected.", Toast.LENGTH_LONG).show()
                    }
                    finish()
                }
            } catch (e: Exception) {
                FileLogger.e(TAG, "Upload initiation failed", e)
                withContext(Dispatchers.Main) {
                    binding.btnUpload.isEnabled = true
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
        private val onPageDelete: (Int) -> Unit,
        private val onPageRetake: (Int) -> Unit
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
            private val btnRetake: View = itemView.findViewById(R.id.btnRetake)
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
                btnRetake.setOnClickListener { onPageRetake(position) }
            }
        }
    }
}
