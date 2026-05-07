package com.hospital.management.ui.folders

import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.core.content.FileProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.models.FileItem
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.hospital.management.utils.FeatureFlags
import com.hospital.management.worker.DownloadProgress
import com.hospital.management.worker.DownloadStage
import com.hospital.management.worker.DownloadWorker
import com.hospital.management.worker.formatDownloadSubtext
import kotlinx.coroutines.flow.distinctUntilChangedBy
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.isActive
import android.widget.TextView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import android.os.Environment
import com.hospital.management.utils.FileLogger
import com.hospital.management.ui.components.WorkProgressBanner

class FolderDetailsActivity : BaseActivity() {

    override fun isShowingCachedData(): Boolean =
        ::patientViewModel.isInitialized && patientViewModel.currentFolderFiles.value.isNotEmpty()

    private lateinit var patientViewModel: PatientViewModel
    private lateinit var rvFiles: RecyclerView
    private lateinit var fileAdapter: FileAdapter
    private lateinit var initialProgressBar: View
    private lateinit var workProgressBanner: WorkProgressBanner
    private lateinit var tvEmpty: View
    private lateinit var tokenManager: TokenManager
    private lateinit var database: AppDatabase

    private var patientId: String = ""
    private var folderName: String = ""
    private var patientName: String = ""
    private var hospitalName: String = ""
    private var pendingOfflineFiles: List<FileItem> = emptyList()
    private val completedUploadWorkIds = mutableSetOf<java.util.UUID>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_folder_details)

        tokenManager = TokenManager(this)
        database = AppDatabase.getDatabase(this)
        setupViewModel()

        // Get folder info from intent
        patientId = intent.getStringExtra("PATIENT_ID") ?: ""
        folderName = intent.getStringExtra("FOLDER_NAME") ?: ""
        patientName = intent.getStringExtra("PATIENT_NAME") ?: ""
        val patientDisplayId = intent.getStringExtra("PATIENT_DISPLAY_ID") ?: ""

        // Fetch hospital name for download folder hierarchy
        lifecycleScope.launch {
            hospitalName = tokenManager.getHospitalName() ?: "Hospital"
        }

        // Populate patient info row
        findViewById<android.widget.TextView>(R.id.tvPatientName).text = patientName
        findViewById<android.widget.TextView>(R.id.tvPatientId).text = patientDisplayId

        setupViews()
        setupObservers()
        setupPendingDocsObserver()
        setupUploadObserver()
        loadFiles()
    }

    override fun onResume() {
        super.onResume()
        // Only fetch from server on resume; pending docs are kept live via the Flow observer
        patientViewModel.getFolderFiles(patientId, folderName)
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(
            apiService, tokenManager,
            database.patientCacheDao()
        )
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }



    private fun setupViews() {
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }

        val displayName = folderName
            .replace("-", " ")
            .split(" ")
            .joinToString(" ") { it.replaceFirstChar { c -> c.uppercase() } }
        findViewById<android.widget.TextView>(R.id.tvFolderName).text = displayName
        findViewById<android.widget.TextView>(R.id.tvFolderDisplayName).text = displayName

        val fileCount = intent.getIntExtra("FILE_COUNT", 0)
        findViewById<android.widget.TextView>(R.id.tvFileCount).text = "$fileCount files"

        rvFiles = findViewById(R.id.rvFiles)
        initialProgressBar = findViewById(R.id.initialProgressBar)
        workProgressBanner = findViewById(R.id.workProgressBanner)
        workProgressBanner.observe(this)
        tvEmpty = findViewById(R.id.layoutEmpty)

        rvFiles.layoutManager = LinearLayoutManager(this)

        // FAB for scan document
        findViewById<View>(R.id.fabScan).setOnClickListener {
            val intent = Intent(this, com.hospital.management.ui.scanner.ScannerActivity::class.java)
            intent.putExtra("PATIENT_ID", patientId)
            intent.putExtra("FOLDER_NAME", folderName)
            intent.putExtra("PATIENT_NAME", patientName)
            startActivity(intent)
        }

        // FAB for download folder
        findViewById<View>(R.id.fabDownload).setOnClickListener {
            showDownloadOptionsDialog()
        }
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> initialProgressBar.visibility = View.VISIBLE
                    is PatientState.Success -> {
                        initialProgressBar.visibility = View.GONE
                        // Bulk download flows now go through DownloadWorker — its
                        // notifications carry the user from progress to completion.
                        // Only generic Success messages (e.g. patient updates) bubble
                        // here; "Files loaded" stays silent.
                        if (state.message?.isNotEmpty() == true && state.message != "Files loaded") {
                            Toast.makeText(this@FolderDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        initialProgressBar.visibility = View.GONE
                        // Only show error toast when online and no offline files are shown
                        if (pendingOfflineFiles.isEmpty() && isNetworkAvailable()) {
                            Toast.makeText(this@FolderDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                        // Use whatever server files we already have in memory (offline fallback)
                        initialProgressBar.visibility = View.GONE
                    }
                    else -> initialProgressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentFolderFiles.collect { serverFiles ->
                displayFiles(serverFiles)
            }
        }
    }

    private fun setupUploadObserver() {
        androidx.work.WorkManager.getInstance(this)
            .getWorkInfosByTagLiveData(com.hospital.management.worker.UploadWorker.TAG_UPLOAD)
            .observe(this) { workInfos ->
                var shouldRefresh = false
                workInfos?.forEach { workInfo ->
                    if (workInfo.state == androidx.work.WorkInfo.State.SUCCEEDED) {
                        if (completedUploadWorkIds.add(workInfo.id)) {
                            shouldRefresh = true
                        }
                    }
                }
                if (shouldRefresh) {
                    loadFiles()
                }
            }
    }

    private fun displayFiles(serverFiles: List<FileItem>) {
        // Combine server files with pending offline files
        val allFiles = pendingOfflineFiles + serverFiles

        if (allFiles.isNotEmpty()) {
            fileAdapter = FileAdapter(allFiles,
                onFileClick = { file ->
                    openFile(file)
                },
                onOptionClick = { view, file ->
                    showFileOptions(view, file)
                },
                onRetryClick = { file ->
                    retryUpload(file)
                }
            )
            rvFiles.adapter = fileAdapter
            rvFiles.visibility = View.VISIBLE
            tvEmpty.visibility = View.GONE
        } else {
            rvFiles.visibility = View.GONE
            tvEmpty.visibility = View.VISIBLE
        }
    }

    private fun retryUpload(file: FileItem) {
        if (!isNetworkAvailable()) {
            Toast.makeText(this, "No internet connection available", Toast.LENGTH_SHORT).show()
            return
        }

        val idempotencyKey = file.idempotencyKey ?: return
        
        lifecycleScope.launch {
            val db = AppDatabase.getDatabase(this@FolderDetailsActivity)
            val doc = db.documentDao().getDocumentByIdempotencyKey(idempotencyKey)
            if (doc != null) {
                // Update status to PENDING
                db.documentDao().update(doc.copy(status = com.hospital.management.data.local.SyncStatus.PENDING))
                
                // Enqueue UploadWorker with KEEP policy
                val constraints = androidx.work.Constraints.Builder()
                    .setRequiredNetworkType(androidx.work.NetworkType.CONNECTED)
                    .build()

                val inputData = androidx.work.Data.Builder()
                    .putLong(com.hospital.management.worker.UploadWorker.KEY_OFFLINE_DOC_ID, doc.id)
                    .putString(com.hospital.management.worker.UploadWorker.KEY_PATIENT_ID, doc.patientId)
                    .putString(com.hospital.management.worker.UploadWorker.KEY_FOLDER_NAME, doc.folderName)
                    .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_URI, doc.fileUri)
                    .putString(com.hospital.management.worker.UploadWorker.KEY_FILE_NAME, android.net.Uri.parse(doc.fileUri).lastPathSegment ?: "document.pdf")
                    .putString(com.hospital.management.worker.UploadWorker.KEY_IDEMPOTENCY_KEY, idempotencyKey)
                    .putInt(com.hospital.management.worker.UploadWorker.KEY_UPLOAD_PROFILE_USED, doc.uploadProfileUsed)
                    .putString(com.hospital.management.worker.UploadWorker.KEY_OWNER_HOSPITAL_ID, doc.ownerHospitalId)
                    .build()

                val request = androidx.work.OneTimeWorkRequestBuilder<com.hospital.management.worker.UploadWorker>()
                    .setInputData(inputData)
                    .setConstraints(constraints)
                    .addTag(com.hospital.management.worker.UploadWorker.TAG_UPLOAD)
                    .setBackoffCriteria(
                        androidx.work.BackoffPolicy.EXPONENTIAL,
                        30,
                        java.util.concurrent.TimeUnit.SECONDS
                    )
                    .build()

                androidx.work.WorkManager.getInstance(this@FolderDetailsActivity).enqueueUniqueWork(
                    "upload_$idempotencyKey",
                    androidx.work.ExistingWorkPolicy.KEEP,
                    request
                )
                Toast.makeText(this@FolderDetailsActivity, "Retrying upload...", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showFileOptions(view: View, file: FileItem) {
        val popup = androidx.appcompat.widget.PopupMenu(this, view)
        val isLocal = file.syncStatus != null

        if (isLocal) {
            popup.menu.add("Open")
            popup.menu.add("Delete from Queue")
        } else {
            popup.menu.add("Open")
            popup.menu.add("Download")
            popup.menu.add("Rename")
            popup.menu.add("Delete")
        }

        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Open" -> openFile(file)
                "Download" -> downloadFile(file)
                "Rename" -> showRenameDialog(file)
                "Delete" -> confirmDelete(file)
                "Delete from Queue" -> confirmDeleteLocal(file)
            }
            true
        }
        popup.show()
    }

    private fun confirmDeleteLocal(file: FileItem) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle(getString(R.string.queue_action_delete_confirm_title))
            .setMessage(getString(R.string.queue_action_delete_confirm_msg))
            .setPositiveButton("Delete") { _, _ ->
                val key = file.idempotencyKey ?: return@setPositiveButton
                lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
                    val db = AppDatabase.getDatabase(this@FolderDetailsActivity)
                    val doc = db.documentDao().getDocumentByIdempotencyKey(key)
                    if (doc != null) {
                        db.documentDao().delete(doc)
                        val localFile = java.io.File(android.net.Uri.parse(doc.fileUri).path ?: "")
                        if (localFile.exists()) localFile.delete()
                    }
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showRenameDialog(file: FileItem) {
        val fileId = file._id
        if (fileId.isNullOrEmpty()) {
            Toast.makeText(this, "Cannot rename pending offline files", Toast.LENGTH_SHORT).show()
            return
        }

        // The filename is structured as "{sanitizedPatientName}_{docName}.pdf".
        // Only the docName part is editable — the patient prefix stays fixed so
        // all files for a patient stay consistently named.
        val sanitizedPatient = patientName.replace(Regex("[^A-Za-z0-9]"), "_").take(30)
        val prefix = "${sanitizedPatient}_"
        val nameWithoutExt = file.fileName.removeSuffix(".pdf").removeSuffix(".PDF")
        val hasPrefix = nameWithoutExt.startsWith(prefix)
        val editablePart = if (hasPrefix) nameWithoutExt.removePrefix(prefix) else nameWithoutExt

        val dp = resources.displayMetrics.density

        val prefixLabel = android.widget.TextView(this).apply {
            text = prefix
            textSize = 16f
            setTextColor(android.graphics.Color.parseColor("#888888"))
            setPadding(0, 0, 4, 0)
        }

        val editText = com.google.android.material.textfield.TextInputEditText(this).apply {
            setText(editablePart)
            selectAll()
            setSingleLine()
        }

        // Row: [prefix label (grey)] [editable field]
        val row = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            addView(prefixLabel)
            addView(editText, android.widget.LinearLayout.LayoutParams(0, android.widget.LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }

        val container = android.widget.FrameLayout(this).apply {
            val pad = (16 * dp).toInt()
            setPadding(pad, pad, pad, 0)
            addView(row)
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Rename File")
            .setView(container)
            .setPositiveButton("Rename") { _, _ ->
                val suffix = editText.text.toString().trim()
                if (suffix.isNotEmpty()) {
                    val sanitizedSuffix = suffix.replace(Regex("[^A-Za-z0-9_\\- ]"), "_")
                    val finalName = if (hasPrefix) {
                        "${prefix}${sanitizedSuffix}.pdf"
                    } else {
                        val s = if (sanitizedSuffix.endsWith(".pdf", ignoreCase = true)) sanitizedSuffix else "$sanitizedSuffix.pdf"
                        s
                    }
                    renameFile(file, fileId, finalName)
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun renameFile(@Suppress("UNUSED_PARAMETER") file: FileItem, fileId: String, newFileName: String) {
        lifecycleScope.launch {
            try {
                val apiService = com.hospital.management.data.api.RetrofitClient.getApiService(this@FolderDetailsActivity)
                val response = apiService.renameFile(patientId, folderName, fileId, mapOf("newFileName" to newFileName))
                if (response.isSuccessful) {
                    Toast.makeText(this@FolderDetailsActivity, "File renamed", Toast.LENGTH_SHORT).show()
                    loadFiles()
                } else {
                    Toast.makeText(this@FolderDetailsActivity, "Rename failed", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@FolderDetailsActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    /**
     * Unified file opening method with persistent disk cache.
     * Hits cache in <100ms. Shows progress dialog for downloads.
     */
    private fun openFile(file: FileItem) {
        val fileUrl = file.displayUrl
        if (fileUrl.isEmpty()) return

        val isRemote = !(fileUrl.startsWith("file://") || fileUrl.startsWith("/"))
        
        // Phase 2: Instant Cache Check
        if (isRemote) {
            val fileIdSafe = file._id ?: file.fileName.hashCode().toString()
            val docDir = java.io.File(java.io.File(cacheDir, "doc_cache"), fileIdSafe)
            val cachedFile = java.io.File(docDir, file.fileName)

            if (cachedFile.exists() && cachedFile.length() > 0) {
                // Cache HIT - Instant Open
                launchFileIntent(cachedFile)
                return
            }
        } else {
            // Local file (pending upload)
            val localFile = if (fileUrl.startsWith("file://")) java.io.File(android.net.Uri.parse(fileUrl).path ?: "") else java.io.File(fileUrl)
            if (localFile.exists()) {
                launchFileIntent(localFile)
            } else {
                Toast.makeText(this, "Local file not found", Toast.LENGTH_SHORT).show()
            }
            return
        }

        // Cache MISS - Route through DownloadWorker (Banner will show progress)
        if (!isNetworkAvailable()) {
            showOfflineDialog("Connect to the internet to download this file.")
            return
        }

        enqueueSingleDownload(file)
    }

    private fun enqueueSingleDownload(file: FileItem) {
        lifecycleScope.launch {
            val accessToken = tokenManager.getAccessToken() ?: ""
            val authHost = try { java.net.URL(RetrofitClient.BASE_URL).host } catch (_: Exception) { null }

            val inputData = Data.Builder()
                .putString(DownloadWorker.KEY_DOWNLOAD_URL, file.displayUrl)
                .putString(DownloadWorker.KEY_FILE_NAME, file.fileName)
                .putString(DownloadWorker.KEY_MIME_TYPE, file.mimeType)
                .putString(DownloadWorker.KEY_PATIENT_NAME, patientName)
                .putString(DownloadWorker.KEY_HOSPITAL_NAME, hospitalName)
                .putString(DownloadWorker.KEY_FOLDER_NAME, folderName)
                .putString(DownloadWorker.KEY_DOWNLOAD_SUB_PATH, "doc_cache/${file._id ?: "temp"}")
                .putString(DownloadWorker.KEY_AUTH_TOKEN, accessToken)
                .putString(DownloadWorker.KEY_AUTH_HOST, authHost)
                .build()

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val request = OneTimeWorkRequestBuilder<DownloadWorker>()
            .setInputData(inputData)
            .setConstraints(constraints)
            .addTag(DownloadWorker.TAG_DOWNLOAD)
            .build()

            WorkManager.getInstance(this@FolderDetailsActivity).enqueueUniqueWork(
                "view_${file._id ?: file.fileName.hashCode()}",
                ExistingWorkPolicy.KEEP,
                request
            )

            // Observe progress to open file on completion
            WorkManager.getInstance(this@FolderDetailsActivity).getWorkInfoByIdLiveData(request.id)
                .observe(this@FolderDetailsActivity) { workInfo ->
                    if (workInfo != null && workInfo.state == WorkInfo.State.SUCCEEDED) {
                        val path = workInfo.outputData.getString("cached_path")
                        if (!path.isNullOrEmpty()) {
                            launchFileIntent(File(path))
                        }
                    }
                }
        }
    }

    private fun launchFileIntent(file: java.io.File) {
        try {
            val uri = androidx.core.content.FileProvider.getUriForFile(this, "${packageName}.provider", file)
            val mimeType = getMimeType(file.name)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            
            // Try specific high-quality viewers first for better UX
            val packagePriority = when (mimeType) {
                "application/pdf" -> listOf("com.google.android.apps.docs", "com.adobe.reader", "com.microsoft.office.officehub")
                else -> emptyList()
            }

            for (pkg in packagePriority) {
                try {
                    intent.setPackage(pkg)
                    startActivity(intent)
                    return
                } catch (e: Exception) { continue }
            }

            // Fallback to chooser
            intent.setPackage(null)
            startActivity(Intent.createChooser(intent, "Open file"))
        } catch (e: Exception) {
            Toast.makeText(this, "Could not open file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun formatFileSize(bytes: Long): String {
        return when {
            bytes < 1024 -> "$bytes B"
            bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
            else -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        }
    }

    private fun trimCacheIfNeeded(docCacheDir: File) {
        try {
            val maxSizeBytes = 250L * 1024 * 1024 // 250 MB
            var currentSize = 0L
            val allFiles = mutableListOf<File>()

            // doc_cache contains subdirectories (fileIdSafe), which contain the actual files
            docCacheDir.listFiles()?.forEach { subDir ->
                if (subDir.isDirectory) {
                    subDir.listFiles()?.forEach { file ->
                        if (file.isFile) {
                            currentSize += file.length()
                            allFiles.add(file)
                        }
                    }
                }
            }

            if (currentSize <= maxSizeBytes) return

            // Sort by last modified (oldest first)
            allFiles.sortBy { it.lastModified() }

            var bytesDeleted = 0L
            val targetBytesToDelete = currentSize - (maxSizeBytes * 0.8).toLong() // Shrink to 80%

            for (file in allFiles) {
                if (bytesDeleted >= targetBytesToDelete) break
                val size = file.length()
                val parent = file.parentFile
                if (file.delete()) {
                    bytesDeleted += size
                    // Delete the parent folder if empty
                    parent?.delete()
                }
            }
        } catch (e: Exception) {
            com.hospital.management.utils.FileLogger.e("CacheEviction", "Failed to trim cache: ${e.message}")
        }
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun showOfflineDialog(message: String = "You are currently offline. Please connect to the internet and try again.") {
        AlertDialog.Builder(this)
            .setTitle("No Internet Connection")
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun downloadFile(file: FileItem) {
        val fileUrl = file.displayUrl

        // Pending offline file — copy from local storage
        if (fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
            exportLocalFile(file, fileUrl)
            return
        }

        if (fileUrl.isEmpty()) {
            Toast.makeText(this, "File URL invalid", Toast.LENGTH_SHORT).show()
            return
        }

        if (!isNetworkAvailable()) {
            showOfflineDialog("This file is stored on the server. Connect to the internet to download it.")
            return
        }

        if (FeatureFlags.USE_DOWNLOAD_WORKER) {
            enqueueDownloadWorker(file)
        } else {
            legacyDownloadFile(file)
        }
    }

    private fun enqueueDownloadWorker(file: FileItem) {
        lifecycleScope.launch {
            val accessToken = tokenManager.getAccessToken()
            val authHost = try { java.net.URL(RetrofitClient.BASE_URL).host } catch (_: Exception) { null }

            // Use compressed endpoint for PDFs when compression is enabled
            val downloadUrl = if (file.isPdf && FeatureFlags.USE_COMPRESSION_SERVICE && file._id != null) {
                "${RetrofitClient.BASE_URL}/api/patients/$patientId/files/${Uri.encode(folderName)}/${file._id}/compressed"
            } else {
                file.displayUrl
            }

            val inputData = Data.Builder()
                .putString(DownloadWorker.KEY_DOWNLOAD_URL, downloadUrl)
                .putString(DownloadWorker.KEY_FILE_NAME, file.name)
                .putString(DownloadWorker.KEY_MIME_TYPE, getMimeType(file.name))
                .putString(DownloadWorker.KEY_PATIENT_NAME, patientName)
                .putString(DownloadWorker.KEY_HOSPITAL_NAME, hospitalName)
                .putString(DownloadWorker.KEY_FOLDER_NAME, folderName)
                .putString(DownloadWorker.KEY_DOWNLOAD_SUB_PATH, getDownloadSubPath())
                .putString(DownloadWorker.KEY_AUTH_TOKEN, accessToken)
                .putString(DownloadWorker.KEY_AUTH_HOST, authHost)
                .build()

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(inputData)
                .setConstraints(constraints)
                .addTag(DownloadWorker.TAG_DOWNLOAD)
                .build()

            // Unique work keyed by URL — double-tap skips if already running
            val workName = "download_${file.displayUrl.hashCode()}"
            val workManager = WorkManager.getInstance(this@FolderDetailsActivity)
            workManager.enqueueUniqueWork(workName, ExistingWorkPolicy.KEEP, request)

            // Snackbar with Cancel action — complements the notification's Cancel button
            com.google.android.material.snackbar.Snackbar
                .make(rvFiles, getString(R.string.download_snackbar_started, file.name),
                    com.google.android.material.snackbar.Snackbar.LENGTH_LONG)
                .setAction(R.string.cancel) {
                    workManager.cancelWorkById(request.id)
                }
                .show()

            workManager.getWorkInfoByIdLiveData(request.id).observe(this@FolderDetailsActivity) { workInfo ->
                if (workInfo == null) return@observe

                // Single source of truth: parse DownloadProgress from the same payload
                // the worker publishes to the foreground notification.
                val progress = DownloadProgress.fromData(workInfo.progress)

                when (workInfo.state) {
                    WorkInfo.State.ENQUEUED -> {
                        // WorkProgressBanner now handles the UI for enqueued/running states
                    }
                    WorkInfo.State.RUNNING -> {
                        // richer consumers (e.g. a progress row) can read progress.percent /
                        // formatDownloadSubtext(progress) to render bytes + speed.
                        FileLogger.d(
                            "FolderDetailsActivity",
                            "download progress stage=${progress?.stage} " +
                                    "pct=${progress?.percent} " +
                                    "subtext=${progress?.let { formatDownloadSubtext(it) }}"
                        )
                    }
                    WorkInfo.State.SUCCEEDED -> {
                        Toast.makeText(
                            this@FolderDetailsActivity,
                            getString(R.string.download_toast_done, file.name),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    WorkInfo.State.FAILED -> {
                        val reason = workInfo.outputData.getString(DownloadWorker.KEY_ERROR_REASON) ?: ""
                        val detail = workInfo.outputData.getString(DownloadWorker.KEY_STATUS) ?: ""
                        val msg = when (reason) {
                            DownloadWorker.ERROR_AUTH_EXPIRED -> getString(R.string.download_err_auth)
                            DownloadWorker.ERROR_STORAGE_FULL -> getString(R.string.download_err_storage)
                            DownloadWorker.ERROR_SERVER -> getString(R.string.download_err_server)
                            DownloadWorker.ERROR_CANCELLED -> getString(R.string.download_toast_cancelled)
                            else -> getString(R.string.download_err_network_with_detail, detail)
                        }
                        Toast.makeText(this@FolderDetailsActivity, msg, Toast.LENGTH_LONG).show()
                    }
                    WorkInfo.State.CANCELLED -> {
                        Toast.makeText(
                            this@FolderDetailsActivity,
                            R.string.download_toast_cancelled,
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    else -> { /* ENQUEUED, BLOCKED */ }
                }
            }
        }
    }

    /**
     * Routes folder/patient bulk downloads through DownloadWorker so they get
     * the same foreground service + live byte progress + click-to-open
     * completion notification as single-file downloads.
     *
     * @param relativePath path under [RetrofitClient.BASE_URL] (e.g.
     *   "/api/patients/123/folders/Foo/download/pdf"). Will not be mutated.
     * @param fileName output filename; sanitized + suffixed by caller.
     * @param mimeType "application/pdf" or "application/zip".
     * @param method "GET" or "POST".
     * @param requestBodyJson JSON string body for POST; null for GET / empty POST.
     * @param subPath MediaStore RELATIVE_PATH suffix under DIRECTORY_DOWNLOADS.
     * @param uniqueWorkName unique-work key — double-tap on the same dialog
     *   shouldn't enqueue two of the same job.
     */
    private fun enqueueBulkDownloadWorker(
        relativePath: String,
        fileName: String,
        mimeType: String,
        method: String,
        requestBodyJson: String?,
        subPath: String,
        uniqueWorkName: String,
        targetSizeMb: Int = 5
    ) {
        lifecycleScope.launch {
            val accessToken = tokenManager.getAccessToken()
            val authHost = try { java.net.URL(RetrofitClient.BASE_URL).host } catch (_: Exception) { null }
            val downloadUrl = "${RetrofitClient.BASE_URL}$relativePath"

            val builder = Data.Builder()
                .putString(DownloadWorker.KEY_DOWNLOAD_URL, downloadUrl)
                .putString(DownloadWorker.KEY_FILE_NAME, fileName)
                .putString(DownloadWorker.KEY_MIME_TYPE, mimeType)
                .putString(DownloadWorker.KEY_PATIENT_NAME, patientName)
                .putString(DownloadWorker.KEY_HOSPITAL_NAME, hospitalName)
                .putString(DownloadWorker.KEY_FOLDER_NAME, folderName)
                .putString(DownloadWorker.KEY_DOWNLOAD_SUB_PATH, subPath)
                .putString(DownloadWorker.KEY_AUTH_TOKEN, accessToken)
                .putString(DownloadWorker.KEY_AUTH_HOST, authHost)
                .putString(DownloadWorker.KEY_HTTP_METHOD, method)
                .putInt(DownloadWorker.KEY_TARGET_SIZE_MB, targetSizeMb)
            if (!requestBodyJson.isNullOrEmpty()) {
                builder.putString(DownloadWorker.KEY_REQUEST_BODY_JSON, requestBodyJson)
            }

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(builder.build())
                .setConstraints(constraints)
                .addTag(DownloadWorker.TAG_DOWNLOAD)
                .build()

            val workManager = WorkManager.getInstance(this@FolderDetailsActivity)
            workManager.enqueueUniqueWork(uniqueWorkName, ExistingWorkPolicy.KEEP, request)

            com.google.android.material.snackbar.Snackbar
                .make(rvFiles, getString(R.string.download_snackbar_started, fileName),
                    com.google.android.material.snackbar.Snackbar.LENGTH_LONG)
                .setAction(R.string.cancel) {
                    workManager.cancelWorkById(request.id)
                }
                .show()

            workManager.getWorkInfoByIdLiveData(request.id).observe(this@FolderDetailsActivity) { workInfo ->
                if (workInfo == null) return@observe
                when (workInfo.state) {
                    WorkInfo.State.RUNNING -> { }
                    WorkInfo.State.SUCCEEDED -> {
                        Toast.makeText(
                            this@FolderDetailsActivity,
                            getString(R.string.download_toast_done, fileName),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    WorkInfo.State.FAILED -> {
                        val reason = workInfo.outputData.getString(DownloadWorker.KEY_ERROR_REASON) ?: ""
                        val detail = workInfo.outputData.getString(DownloadWorker.KEY_STATUS) ?: ""
                        val msg = when (reason) {
                            DownloadWorker.ERROR_AUTH_EXPIRED -> getString(R.string.download_err_auth)
                            DownloadWorker.ERROR_STORAGE_FULL -> getString(R.string.download_err_storage)
                            DownloadWorker.ERROR_SERVER -> getString(R.string.download_err_server)
                            DownloadWorker.ERROR_CANCELLED -> getString(R.string.download_toast_cancelled)
                            else -> getString(R.string.download_err_network_with_detail, detail)
                        }
                        Toast.makeText(this@FolderDetailsActivity, msg, Toast.LENGTH_LONG).show()
                    }
                    WorkInfo.State.CANCELLED -> {
                        Toast.makeText(
                            this@FolderDetailsActivity,
                            R.string.download_toast_cancelled,
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    else -> { /* ENQUEUED / BLOCKED */ }
                }
            }
        }
    }

    /** Legacy inline download — kept for rollback via FeatureFlags.USE_DOWNLOAD_WORKER = false */
    private fun legacyDownloadFile(file: FileItem) {
        Toast.makeText(this, "Downloading…", Toast.LENGTH_SHORT).show()

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                // Match the modern path: route PDFs through the compression sidecar
                // when the flag is on, fall back to the raw Cloudinary URL otherwise.
                val useCompressed = file.isPdf &&
                    FeatureFlags.USE_COMPRESSION_SERVICE &&
                    file._id != null
                val downloadUrl = if (useCompressed) {
                    "${RetrofitClient.BASE_URL}/api/patients/$patientId/files/${Uri.encode(folderName)}/${file._id}/compressed"
                } else {
                    file.displayUrl
                }
                val accessToken = if (useCompressed) tokenManager.getAccessToken() else null

                val conn = (java.net.URL(downloadUrl).openConnection() as java.net.HttpURLConnection).also {
                    it.connectTimeout = 15_000
                    it.readTimeout = 60_000
                    if (!accessToken.isNullOrBlank()) {
                        it.setRequestProperty("Authorization", "Bearer $accessToken")
                    }
                    it.connect()
                }
                if (conn.responseCode !in 200..299) throw Exception("Server error ${conn.responseCode}")

                val fileName = file.name
                val mimeType = getMimeType(fileName)
                val subPath = getDownloadSubPath()

                val cv = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$subPath")
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = contentResolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv)
                    ?: throw Exception("Could not create download entry")

                contentResolver.openOutputStream(uri)?.use { out ->
                    conn.inputStream.use { it.copyTo(out, bufferSize = 16 * 1024) }
                }

                cv.clear()
                cv.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                contentResolver.update(uri, cv, null, null)

                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "Saved: $fileName", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun exportLocalFile(file: FileItem, fileUrl: String) {
        try {
            val sourceFile = if (fileUrl.startsWith("file://")) {
                File(Uri.parse(fileUrl).path ?: "")
            } else {
                File(fileUrl)
            }

            if (!sourceFile.exists()) {
                Toast.makeText(this, "Source file not found", Toast.LENGTH_SHORT).show()
                return
            }

            val cleanName = file.name.replace("[Pending] ", "")
            val mimeType = getMimeType(cleanName)

            val resolver = contentResolver
            val relativePath = getDownloadSubPath()
            val contentValues = android.content.ContentValues().apply {
                put(android.provider.MediaStore.Downloads.DISPLAY_NAME, cleanName)
                put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativePath")
                put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
            }
            val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
            if (uri == null) {
                Toast.makeText(this, "Failed to create download entry", Toast.LENGTH_SHORT).show()
                return
            }

            resolver.openOutputStream(uri)?.use { output ->
                sourceFile.inputStream().use { input ->
                    input.copyTo(output)
                }
            }

            contentValues.clear()
            contentValues.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
            resolver.update(uri, contentValues, null, null)

            com.hospital.management.utils.DownloadNotifier.notifyCompleted(
                applicationContext, uri, cleanName, mimeType
            )

            Toast.makeText(this, "Saved to $relativePath/$cleanName", Toast.LENGTH_LONG).show()
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Export failed: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showDownloadNotification(file: File) {
        val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
        val channelId = "download_channel"

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Downloads",
                android.app.NotificationManager.IMPORTANCE_DEFAULT
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(Intent.ACTION_VIEW)
        val uri = FileProvider.getUriForFile(this, "${packageName}.provider", file)
        intent.setDataAndType(uri, "application/pdf")
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

        val pendingIntent = android.app.PendingIntent.getActivity(
            this,
            0,
            intent,
            android.app.PendingIntent.FLAG_IMMUTABLE or android.app.PendingIntent.FLAG_UPDATE_CURRENT
        )

        val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
            .setContentTitle("File Downloaded")
            .setContentText(file.name)
            .setSmallIcon(R.drawable.ic_file_document)
            .setContentIntent(pendingIntent)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun confirmDelete(file: FileItem) {
        AlertDialog.Builder(this)
            .setTitle("Delete File")
            .setMessage("Are you sure you want to delete ${file.name}?")
            .setPositiveButton("Delete") { _, _ ->
                deleteFile(file)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun deleteFile(file: FileItem) {
        val fileUrl = file.displayUrl

        // Check if pending offline file
        if (file.fileName.startsWith("[Pending]") || fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
            lifecycleScope.launch {
                try {
                    // Find doc in DB
                    val pendingDocs = database.documentDao().getPendingForFolder(patientId, folderName)
                    val doc = pendingDocs.find { it.fileUri == fileUrl }

                    if (doc != null) {
                        database.documentDao().delete(doc)
                        // Also delete actual file
                        val localFile = File(Uri.parse(fileUrl).path ?: "")
                        if (localFile.exists()) localFile.delete()

                        Toast.makeText(this@FolderDetailsActivity, "File deleted", Toast.LENGTH_SHORT).show()
                        loadFiles()
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@FolderDetailsActivity, "Error deleting file", Toast.LENGTH_SHORT).show()
                }
            }
        } else {
            // Server file
            val fileId = file._id
            if (fileId.isNullOrEmpty()) {
                Toast.makeText(this, "Cannot delete file: missing server id", Toast.LENGTH_SHORT).show()
                return
            }

            lifecycleScope.launch {
                try {
                    val apiService = RetrofitClient.getApiService(this@FolderDetailsActivity)
                    val response = apiService.deleteFile(patientId, folderName, fileId)
                    if (response.isSuccessful) {
                        Toast.makeText(this@FolderDetailsActivity, "File deleted", Toast.LENGTH_SHORT).show()
                        loadFiles()
                    } else {
                        Toast.makeText(this@FolderDetailsActivity, "Delete failed", Toast.LENGTH_SHORT).show()
                    }
                } catch (e: Exception) {
                    Toast.makeText(this@FolderDetailsActivity, "Error deleting file", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    /**
     * Observes pending offline docs for this folder via a Room Flow.
     * When the sync worker deletes a doc (upload succeeded), the Flow emits the updated list,
     * [Pending] items disappear from the UI, and server files are refreshed automatically.
     */
    private fun setupPendingDocsObserver() {
        lifecycleScope.launch {
            val hospitalId = tokenManager.getHospitalId() ?: ""
            var prevCount = -1
            database.documentDao().observeFolderQueue(patientId, folderName, hospitalId)
                .distinctUntilChangedBy { it.size }
                .collect { pendingDocs ->
                    pendingOfflineFiles = pendingDocs.map { doc ->
                        val localFile = java.io.File(android.net.Uri.parse(doc.fileUri).path ?: "")
                        val fileSize = if (localFile.exists()) localFile.length() else 0L
                        val fileName = doc.displayName
                        val mimeType = if (fileName.endsWith(".pdf")) "application/pdf" else "image/jpeg"
                        
                        val statusPrefix = when (doc.status) {
                            com.hospital.management.data.local.SyncStatus.FAILED -> "[Failed] "
                            com.hospital.management.data.local.SyncStatus.UPLOADING -> "[Uploading] "
                            else -> "[Pending] "
                        }
                        
                        com.hospital.management.data.models.FileItem(
                            fileName = "$statusPrefix$fileName",
                            fileUrl = doc.fileUri,
                            size = fileSize,
                            mimeType = mimeType,
                            uploadedAt = java.text.SimpleDateFormat(
                                "yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault()
                            ).format(java.util.Date(doc.timestamp)),
                            syncStatus = doc.status.name,
                            errorMessage = doc.errorMessage,
                            idempotencyKey = doc.idempotencyKey
                        )
                    }
                    // Refresh display with current server files
                    displayFiles(patientViewModel.currentFolderFiles.value)

                    // When sync finishes (pending count drops to 0), re-fetch server files
                    // so newly-uploaded files appear without the user navigating away
                    if (prevCount > 0 && pendingDocs.isEmpty()) {
                        patientViewModel.getFolderFiles(patientId, folderName)
                    }
                    prevCount = pendingDocs.size
                }
        }
    }

    private fun loadFiles() {
        // Fetch server files (Flow observer handles pending docs independently)
        patientViewModel.getFolderFiles(patientId, folderName)
    }

    private fun showDownloadOptionsDialog() {
        val options = arrayOf("Download as PDF", "Download as ZIP")

        AlertDialog.Builder(this)
            .setTitle("Download Folder Files")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> downloadFolderPdf()
                    1 -> downloadFolderZip()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun isFolderEmpty(): Boolean {
        return pendingOfflineFiles.isEmpty() && patientViewModel.currentFolderFiles.value.isEmpty()
    }

    private fun downloadFolderPdf() {
        if (isFolderEmpty()) {
            Toast.makeText(this, "No files to download", Toast.LENGTH_SHORT).show()
            return
        }
        if (!isNetworkAvailable() && pendingOfflineFiles.isEmpty()) {
            showOfflineDialog("Connect to the internet to download this folder.")
            return
        }
        if (pendingOfflineFiles.isNotEmpty()) {
            syncAndDownload("PDF")
        } else {
            startFolderPdfDownload()
        }
    }

    /**
     * Routes folder PDF through DownloadWorker. Bytes stream live, progress
     * shows in the foreground notification, and tapping the completion
     * notification opens the saved PDF — same behaviour as single-file PDFs.
     */
    private fun startFolderPdfDownload() {
        val safeFolder = folderName
            .replace(Regex("[^a-zA-Z0-9]"), "_")
            .trim('_')
            .ifEmpty { "folder" }
        val fileName = "$safeFolder.pdf"
        enqueueBulkDownloadWorker(
            relativePath = "/api/patients/$patientId/folders/${Uri.encode(folderName)}/download/pdf",
            fileName = fileName,
            mimeType = "application/pdf",
            method = "GET",
            requestBodyJson = null,
            subPath = getDownloadSubPath(),
            uniqueWorkName = "folder_pdf_${patientId}_${folderName.hashCode()}"
        )
    }

    // ... helper method to sync before download
    private fun syncAndDownload(type: String) {
        val progressDialog = androidx.appcompat.app.AlertDialog.Builder(this)
            .setMessage("Syncing pending files to server...")
            .setCancelable(false)
            .setView(android.widget.ProgressBar(this).apply {
                setPadding(0, 48, 0, 48)
                isIndeterminate = true
            })
            .show()

        // Use the same unique name as auto-sync so only one worker runs at a time
        val syncRequest = androidx.work.OneTimeWorkRequest.Builder(com.hospital.management.worker.SyncDocumentsWorker::class.java)
            .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()

        androidx.work.WorkManager.getInstance(this).enqueueUniqueWork(
            "auto_sync_documents",
            androidx.work.ExistingWorkPolicy.KEEP,
            syncRequest
        )

        androidx.work.WorkManager.getInstance(this)
            .getWorkInfosForUniqueWorkLiveData("auto_sync_documents")
            .observe(this) { workInfos ->
                val workInfo = workInfos?.firstOrNull() ?: return@observe
                when (workInfo.state) {
                    androidx.work.WorkInfo.State.SUCCEEDED -> {
                        progressDialog.dismiss()
                        Toast.makeText(this, "Sync complete. Starting download...", Toast.LENGTH_SHORT).show()
                        if (type == "ZIP") {
                            startFolderZipDownload()
                        } else {
                            startFolderPdfDownload()
                        }
                    }
                    androidx.work.WorkInfo.State.FAILED -> {
                        progressDialog.dismiss()
                        Toast.makeText(this, "Sync failed. Generating local file...", Toast.LENGTH_SHORT).show()
                        if (type == "ZIP") generateLocalZip() else generateLocalPdf()
                    }
                    androidx.work.WorkInfo.State.CANCELLED -> {
                        progressDialog.dismiss()
                        Toast.makeText(this, "Sync cancelled. Generating local file...", Toast.LENGTH_SHORT).show()
                        if (type == "ZIP") generateLocalZip() else generateLocalPdf()
                    }
                    else -> { /* running/enqueued — wait */ }
                }
            }
    }

    private fun generateLocalZip() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (pendingOfflineFiles.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@FolderDetailsActivity, "No local files to zip", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                val fileName = "${folderName}_local.zip"
                val zipFile = File(cacheDir, fileName)

                var filesAdded = 0

                FileOutputStream(zipFile).use { fos ->
                    java.util.zip.ZipOutputStream(java.io.BufferedOutputStream(fos)).use { zos ->
                        for (fileItem in pendingOfflineFiles) {
                            try {
                                val uri = Uri.parse(fileItem.fileUrl)
                                var inputStream: InputStream? = null

                                // Try to open input stream based on URI scheme
                                if (uri.scheme == "content") {
                                    inputStream = contentResolver.openInputStream(uri)
                                } else {
                                    // Handle file path (with or without file:// scheme)
                                    val path = uri.path
                                    if (path != null) {
                                        val file = File(path)
                                        if (file.exists()) {
                                            inputStream = java.io.FileInputStream(file)
                                        }
                                    } else if (!fileItem.fileUrl.isNullOrEmpty()) {
                                        // Try plain file path string
                                        val file = File(fileItem.fileUrl)
                                        if (file.exists()) {
                                            inputStream = java.io.FileInputStream(file)
                                        }
                                    }
                                }

                                if (inputStream != null) {
                                    inputStream.use { msg ->
                                        // Clean filename
                                        val entryName = fileItem.fileName.replace("[Pending] ", "")
                                        val entry = java.util.zip.ZipEntry(entryName)
                                        zos.putNextEntry(entry)
                                        msg.copyTo(zos)
                                        zos.closeEntry()
                                        filesAdded++
                                    }
                                }
                            } catch (e: Exception) {
                                e.printStackTrace()
                            }
                        }
                    }
                }

                if (filesAdded > 0) {
                    saveLocalFileToMediaStore(zipFile, fileName, "application/zip")
                    zipFile.delete()
                } else {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@FolderDetailsActivity, "Failed to zip files. Valid local files not found.", Toast.LENGTH_LONG).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "ZIP generation failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private suspend fun saveLocalFileToMediaStore(sourceFile: File, displayName: String, mimeType: String) {
        val resolver = contentResolver
        val relativePath = getDownloadSubPath()
        val contentValues = android.content.ContentValues().apply {
            put(android.provider.MediaStore.Downloads.DISPLAY_NAME, displayName)
            put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
            put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativePath")
            put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
        if (uri == null) {
            withContext(Dispatchers.Main) {
                Toast.makeText(this@FolderDetailsActivity, "Failed to save to Downloads", Toast.LENGTH_SHORT).show()
            }
            return
        }
        resolver.openOutputStream(uri)?.use { output ->
            sourceFile.inputStream().use { it.copyTo(output) }
        }
        contentValues.clear()
        contentValues.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, contentValues, null, null)

        com.hospital.management.utils.DownloadNotifier.notifyCompleted(
            applicationContext, uri, displayName, mimeType
        )

        withContext(Dispatchers.Main) {
            Toast.makeText(this@FolderDetailsActivity, "Saved to $relativePath/$displayName", Toast.LENGTH_LONG).show()
        }
    }

    private fun generateLocalPdf() {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                if (pendingOfflineFiles.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@FolderDetailsActivity, "No local files to convert", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                // Collect valid local PDF files
                val localPdfFiles = mutableListOf<File>()
                for (fileItem in pendingOfflineFiles) {
                    try {
                        val uri = Uri.parse(fileItem.fileUrl)
                        val file: File? = when (uri.scheme) {
                            "content" -> {
                                val tmp = File(cacheDir, "merge_tmp_${System.currentTimeMillis()}.pdf")
                                contentResolver.openInputStream(uri)?.use { input ->
                                    tmp.outputStream().use { input.copyTo(it) }
                                }
                                tmp
                            }
                            "file" -> File(uri.path ?: "")
                            else -> File(fileItem.fileUrl ?: "")
                        }
                        if (file != null && file.exists() && file.length() > 0) {
                            localPdfFiles.add(file)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }

                if (localPdfFiles.isEmpty()) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@FolderDetailsActivity, "No valid local PDF files found", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                if (localPdfFiles.size == 1) {
                    // Single PDF — save via MediaStore
                    val fileName = "${folderName}_local.pdf"
                    saveLocalFileToMediaStore(localPdfFiles[0], fileName, "application/pdf")
                } else {
                    // Multiple PDFs — bundle as ZIP in cache, then save via MediaStore
                    val zipFileName = "${folderName}_local.zip"
                    val zipFile = File(cacheDir, zipFileName)
                    java.util.zip.ZipOutputStream(zipFile.outputStream()).use { zos ->
                        localPdfFiles.forEachIndexed { index, pdfFile ->
                            val entry = java.util.zip.ZipEntry("${folderName}_doc_${index + 1}.pdf")
                            zos.putNextEntry(entry)
                            pdfFile.inputStream().use { it.copyTo(zos) }
                            zos.closeEntry()
                        }
                    }

                    saveLocalFileToMediaStore(zipFile, zipFileName, "application/zip")
                    zipFile.delete()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "PDF generation failed: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun getMimeType(fileName: String): String {
        return when {
            fileName.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
            fileName.endsWith(".jpg", ignoreCase = true) || fileName.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
            fileName.endsWith(".png", ignoreCase = true) -> "image/png"
            fileName.endsWith(".webp", ignoreCase = true) -> "image/webp"
            else -> "*/*"
        }
    }

    private fun openFileWithUri(uri: Uri, mimeType: String) {
        try {
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, mimeType)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(intent)
        } catch (e: android.content.ActivityNotFoundException) {
            Toast.makeText(this, "No app found to open this file type", Toast.LENGTH_SHORT).show()
        }
    }


    private fun downloadFolderZip() {
        if (isFolderEmpty()) {
            Toast.makeText(this, "No files to download", Toast.LENGTH_SHORT).show()
            return
        }
        if (!isNetworkAvailable() && pendingOfflineFiles.isEmpty()) {
            showOfflineDialog("Connect to the internet to download this folder.")
            return
        }
        if (pendingOfflineFiles.isNotEmpty()) {
            syncAndDownload("ZIP")
        } else {
            startFolderZipDownload()
        }
    }

    /** Routes folder ZIP through DownloadWorker — see [startFolderPdfDownload]. */
    private fun startFolderZipDownload() {
        val safeFolder = folderName
            .replace(Regex("[^a-zA-Z0-9]"), "_")
            .trim('_')
            .ifEmpty { "folder" }
        val fileName = "$safeFolder.zip"
        enqueueBulkDownloadWorker(
            relativePath = "/api/patients/$patientId/folders/${Uri.encode(folderName)}/download/zip",
            fileName = fileName,
            mimeType = "application/zip",
            method = "GET",
            requestBodyJson = null,
            subPath = getDownloadSubPath(),
            uniqueWorkName = "folder_zip_${patientId}_${folderName.hashCode()}"
        )
    }

    private fun getDownloadSubPath(includeFolder: Boolean = true): String {
        val safeHospital = hospitalName.replace(Regex("[^a-zA-Z0-9 _-]"), "").trim().ifEmpty { "Hospital" }
        val safePatient = patientName.replace(Regex("[^a-zA-Z0-9 _-]"), "").trim().ifEmpty { "Patient" }
        val safeFolder = folderName.replace(Regex("[^a-zA-Z0-9 _-]"), "").trim()
        return if (includeFolder && safeFolder.isNotEmpty()) {
            "HospitalRecords/$safeHospital/$safePatient/$safeFolder"
        } else {
            "HospitalRecords/$safeHospital/$safePatient"
        }
    }
}
