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
import kotlinx.coroutines.launch
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.os.Environment

class FolderDetailsActivity : BaseActivity() {

    private lateinit var patientViewModel: PatientViewModel
    private lateinit var rvFiles: RecyclerView
    private lateinit var fileAdapter: FileAdapter
    private lateinit var progressBar: View
    private lateinit var tvEmpty: View
    private lateinit var tokenManager: TokenManager
    private lateinit var database: AppDatabase

    private var patientId: String = ""
    private var folderName: String = ""
    private var patientName: String = ""
    private var hospitalName: String = ""
    private var pendingOfflineFiles: List<FileItem> = emptyList()

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
        loadFiles()
    }

    override fun onResume() {
        super.onResume()
        loadFiles()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
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
        progressBar = findViewById(R.id.progressBar)
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
                    is PatientState.Loading -> progressBar.visibility = View.VISIBLE
                    is PatientState.Success -> {
                        progressBar.visibility = View.GONE

                        if (state.message == "PDF Ready" && state.data is okhttp3.ResponseBody) {
                            val safeFolder = folderName.replace(Regex("[^a-zA-Z0-9 ]"), "").trim().replace("\\s+".toRegex(), "_")
                            val fileName = "${safeFolder}.pdf"
                            saveFileToDownloads(state.data, fileName)
                        } else if (state.message == "ZIP Ready" && state.data is okhttp3.ResponseBody) {
                            val safeFolder = folderName.replace(Regex("[^a-zA-Z0-9 ]"), "").trim().replace("\\s+".toRegex(), "_")
                            val fileName = "${safeFolder}.zip"
                            saveFileToDownloads(state.data, fileName)
                        } else if (state.message?.isNotEmpty() == true && state.message != "Files loaded") {
                            Toast.makeText(this@FolderDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        progressBar.visibility = View.GONE
                        // Don't show error toast if we have offline files to display
                        if (pendingOfflineFiles.isEmpty()) {
                            Toast.makeText(this@FolderDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                        // Still display any pending offline files even on error
                        displayFiles(emptyList())
                    }
                    else -> progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentFolderFiles.collect { serverFiles ->
                displayFiles(serverFiles)
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

    private fun showFileOptions(view: View, file: FileItem) {
        val popup = androidx.appcompat.widget.PopupMenu(this, view)
        popup.menu.add("Open")
        popup.menu.add("Open with Drive PDF Viewer")
        popup.menu.add("Download")
        popup.menu.add("Rename")
        popup.menu.add("Delete")

        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Open" -> openFile(file)
                "Open with Drive PDF Viewer" -> openFileInDrive(file)
                "Download" -> downloadFile(file)
                "Rename" -> showRenameDialog(file)
                "Delete" -> confirmDelete(file)
            }
            true
        }
        popup.show()
    }

    private fun showRenameDialog(file: FileItem) {
        val fileId = file._id
        if (fileId.isNullOrEmpty()) {
            Toast.makeText(this, "Cannot rename pending offline files", Toast.LENGTH_SHORT).show()
            return
        }

        val currentName = file.fileName.removeSuffix(".pdf").removeSuffix(".PDF")
        val editText = com.google.android.material.textfield.TextInputEditText(this).apply {
            setText(currentName)
            selectAll()
            setSingleLine()
        }
        val container = android.widget.FrameLayout(this).apply {
            val dp16 = (16 * resources.displayMetrics.density).toInt()
            setPadding(dp16, dp16, dp16, 0)
            addView(editText)
        }

        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Rename File")
            .setView(container)
            .setPositiveButton("Rename") { _, _ ->
                val newName = editText.text.toString().trim()
                if (newName.isNotEmpty()) {
                    val finalName = if (newName.endsWith(".pdf", ignoreCase = true)) newName else "$newName.pdf"
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

    private fun openFileInDrive(file: FileItem) {
        val fileUrl = file.displayUrl
        if (fileUrl.isEmpty()) return

        try {
            val intent = Intent(Intent.ACTION_VIEW)
            intent.setPackage("com.google.android.apps.docs")
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)

            if (fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
                 val localFile = if (fileUrl.startsWith("file://")) {
                    File(Uri.parse(fileUrl).path ?: "")
                } else {
                    File(fileUrl)
                }

                if (localFile.exists()) {
                    val uri = FileProvider.getUriForFile(this, "${packageName}.provider", localFile)
                    intent.setDataAndType(uri, "application/pdf")
                } else {
                    Toast.makeText(this, "File not found locally", Toast.LENGTH_SHORT).show()
                    return
                }
            } else {
                intent.setDataAndType(Uri.parse(fileUrl), "application/pdf")
            }

            try {
                startActivity(intent)
            } catch (e: android.content.ActivityNotFoundException) {
                Toast.makeText(this, "Google Drive PDF Viewer not found, opening with default viewer", Toast.LENGTH_SHORT).show()
                openFile(file)
            }
        } catch (e: Exception) {
            e.printStackTrace()
             Toast.makeText(this, "Error with Drive Viewer, opening with default", Toast.LENGTH_SHORT).show()
            openFile(file)
        }
    }

    private fun downloadFile(file: FileItem) {
        val fileUrl = file.displayUrl

        // Handle local private files (pending offline upload)
        if (fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
            exportLocalFile(file, fileUrl)
            return
        }

        if (fileUrl.isEmpty()) {
            Toast.makeText(this, "File URL invalid", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            val subPath = getDownloadSubPath()
            val request = android.app.DownloadManager.Request(Uri.parse(fileUrl))
                .setTitle(file.name)
                .setDescription("Downloading file...")
                .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, "$subPath/${file.name}")
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(true)

            val downloadManager = getSystemService(android.content.Context.DOWNLOAD_SERVICE) as android.app.DownloadManager
            downloadManager.enqueue(request)
            Toast.makeText(this, "Download started...", Toast.LENGTH_SHORT).show()
        } catch (e: Exception) {
            Toast.makeText(this, "Download failed: ${e.message}", Toast.LENGTH_SHORT).show()
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

    private fun loadFiles() {
        // First, load pending offline files from local database
        lifecycleScope.launch {
            try {
                val pendingDocs = database.documentDao().getPendingForFolder(patientId, folderName)
                pendingOfflineFiles = pendingDocs.map { doc ->
                    val localFile = File(Uri.parse(doc.fileUri).path ?: "")
                    val fileSize = if (localFile.exists()) localFile.length() else 0L
                    val fileName = localFile.name
                    val mimeType = if (fileName.endsWith(".pdf")) "application/pdf" else "image/jpeg"

                    FileItem(
                        fileName = "[Pending] $fileName",
                        fileUrl = doc.fileUri,
                        size = fileSize,
                        mimeType = mimeType,
                        uploadedAt = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.getDefault()).format(java.util.Date(doc.timestamp))
                    )
                }

                // If we have pending files, show them immediately
                if (pendingOfflineFiles.isNotEmpty()) {
                    displayFiles(emptyList())
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }

            // Then try to fetch server files (may fail if offline)
            patientViewModel.getFolderFiles(patientId, folderName)
        }
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
        if (pendingOfflineFiles.isNotEmpty()) {
            syncAndDownload("PDF")
        } else {
            patientViewModel.downloadFolderPdf(patientId, folderName)
        }
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

        // Create OneTimeWorkRequest
        val syncRequest = androidx.work.OneTimeWorkRequest.Builder(com.hospital.management.worker.SyncDocumentsWorker::class.java)
            .setExpedited(androidx.work.OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()

        // Enqueue
        androidx.work.WorkManager.getInstance(this).enqueue(syncRequest)

        // Observe
        androidx.work.WorkManager.getInstance(this).getWorkInfoByIdLiveData(syncRequest.id)
            .observe(this) { workInfo ->
                if (workInfo != null) {
                    when (workInfo.state) {
                        androidx.work.WorkInfo.State.SUCCEEDED -> {
                            progressDialog.dismiss()
                            Toast.makeText(this, "Sync complete. Starting download...", Toast.LENGTH_SHORT).show()
                            // Refresh file list first to ensure UI is up to date (optional)
                            loadFiles()

                            // Trigger actual download
                            if (type == "ZIP") {
                                patientViewModel.downloadFolderZip(patientId, folderName)
                            } else {
                                patientViewModel.downloadFolderPdf(patientId, folderName)
                            }
                        }
                        androidx.work.WorkInfo.State.FAILED -> {
                            progressDialog.dismiss()
                            Toast.makeText(this, "Sync failed. Generating local file...", Toast.LENGTH_SHORT).show()
                            if (type == "ZIP") {
                                generateLocalZip()
                            } else {
                                generateLocalPdf()
                            }
                        }
                        androidx.work.WorkInfo.State.CANCELLED -> {
                            progressDialog.dismiss()
                            Toast.makeText(this, "Sync cancelled. Generating local file...", Toast.LENGTH_SHORT).show()
                            if (type == "ZIP") {
                                generateLocalZip()
                            } else {
                                generateLocalPdf()
                            }
                        }
                        else -> {
                            // running/enqueued
                        }
                    }
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
                                        val file = File(fileItem.fileUrl!!)
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

    // Restored helper methods
    private fun openFile(file: FileItem) {
        val fileUrl = file.displayUrl
        if (fileUrl.isEmpty()) {
            Toast.makeText(this, "File URL not available", Toast.LENGTH_SHORT).show()
            return
        }
        try {
            if (fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
                val localFile = if (fileUrl.startsWith("file://")) {
                    File(Uri.parse(fileUrl).path ?: "")
                } else {
                    File(fileUrl)
                }
                if (localFile.exists()) {
                    val uri = FileProvider.getUriForFile(this, "${packageName}.provider", localFile)
                    openFileWithUri(uri, getMimeType(file.name))
                } else {
                    Toast.makeText(this, "File not found locally", Toast.LENGTH_SHORT).show()
                }
            } else {
                // Remote URL — download to cache first, then open via FileProvider
                downloadAndOpenFile(file)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Error opening file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun downloadAndOpenFile(file: FileItem) {
        val fileUrl = file.displayUrl
        Toast.makeText(this, "Loading file...", Toast.LENGTH_SHORT).show()

        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val url = java.net.URL(fileUrl)
                val connection = url.openConnection() as java.net.HttpURLConnection
                connection.connectTimeout = 15000
                connection.readTimeout = 15000
                connection.connect()

                val cacheDir = File(cacheDir, "viewed_files")
                if (!cacheDir.exists()) cacheDir.mkdirs()

                val cachedFile = File(cacheDir, file.name)
                connection.inputStream.use { input ->
                    cachedFile.outputStream().use { output ->
                        input.copyTo(output)
                    }
                }

                withContext(Dispatchers.Main) {
                    val uri = FileProvider.getUriForFile(
                        this@FolderDetailsActivity,
                        "${packageName}.provider",
                        cachedFile
                    )
                    openFileWithUri(uri, getMimeType(file.name))
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(
                        this@FolderDetailsActivity,
                        "Failed to load file: ${e.message}",
                        Toast.LENGTH_SHORT
                    ).show()
                }
            }
        }
    }

    private fun downloadFolderZip() {
        if (isFolderEmpty()) {
            Toast.makeText(this, "No files to download", Toast.LENGTH_SHORT).show()
            return
        }
        if (pendingOfflineFiles.isNotEmpty()) {
            syncAndDownload("ZIP")
        } else {
            patientViewModel.downloadFolderZip(patientId, folderName)
        }
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

    private fun saveFileToDownloads(body: okhttp3.ResponseBody, fileName: String) {
        lifecycleScope.launch(Dispatchers.IO) {
            try {
                val mimeType = when {
                    fileName.endsWith(".pdf", true) -> "application/pdf"
                    fileName.endsWith(".zip", true) -> "application/zip"
                    else -> "application/octet-stream"
                }
                val resolver = contentResolver
                val relativePath = getDownloadSubPath()
                val contentValues = android.content.ContentValues().apply {
                    put(android.provider.MediaStore.Downloads.DISPLAY_NAME, fileName)
                    put(android.provider.MediaStore.Downloads.MIME_TYPE, mimeType)
                    put(android.provider.MediaStore.Downloads.RELATIVE_PATH, "${Environment.DIRECTORY_DOWNLOADS}/$relativePath")
                    put(android.provider.MediaStore.Downloads.IS_PENDING, 1)
                }
                val uri = resolver.insert(android.provider.MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues)
                if (uri == null) {
                    withContext(Dispatchers.Main) {
                        Toast.makeText(this@FolderDetailsActivity, "Failed to create download entry", Toast.LENGTH_SHORT).show()
                    }
                    return@launch
                }

                resolver.openOutputStream(uri)?.use { output ->
                    body.byteStream().copyTo(output)
                }

                contentValues.clear()
                contentValues.put(android.provider.MediaStore.Downloads.IS_PENDING, 0)
                resolver.update(uri, contentValues, null, null)

                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "Saved to $relativePath/$fileName", Toast.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    Toast.makeText(this@FolderDetailsActivity, "Error saving file: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
