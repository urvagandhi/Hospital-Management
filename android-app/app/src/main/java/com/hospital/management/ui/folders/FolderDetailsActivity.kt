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

class FolderDetailsActivity : AppCompatActivity() {

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

        setupViews()
        setupObservers()
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

        rvFiles = findViewById(R.id.rvFiles)
        progressBar = findViewById(R.id.progressBar)
        tvEmpty = findViewById(R.id.tvEmpty)

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
                        if (state.message?.isNotEmpty() == true && state.message != "Files loaded") {
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
        popup.menu.add("Delete")
        
        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Open" -> openFile(file)
                "Open with Drive PDF Viewer" -> openFileInDrive(file)
                "Download" -> downloadFile(file)
                "Delete" -> confirmDelete(file)
            }
            true
        }
        popup.show()
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
            
            if (intent.resolveActivity(packageManager) != null) {
                startActivity(intent)
            } else {
                Toast.makeText(this, "Google Drive Drive PDF Viewer not found, opening with default viewer", Toast.LENGTH_SHORT).show()
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
            val request = android.app.DownloadManager.Request(Uri.parse(fileUrl))
                .setTitle(file.name)
                .setDescription("Downloading file...")
                .setNotificationVisibility(android.app.DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(android.os.Environment.DIRECTORY_DOWNLOADS, file.name)
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

            val downloadsDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_DOWNLOADS)
            val destFile = File(downloadsDir, file.name.replace("[Pending] ", ""))

            sourceFile.inputStream().use { input ->
                destFile.outputStream().use { output ->
                    input.copyTo(output)
                }
            }

            // Scannable for media provider
            android.media.MediaScannerConnection.scanFile(
                this,
                arrayOf(destFile.absolutePath),
                null,
                null
            )

            Toast.makeText(this, "Saved to Downloads: ${destFile.name}", Toast.LENGTH_LONG).show()
            showDownloadNotification(destFile)
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
            // TODO: Implement server delete
             Toast.makeText(this, "Deleting server files is not supported yet", Toast.LENGTH_SHORT).show()
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

    private fun downloadFolderPdf() {
        patientViewModel.downloadFolderPdf(patientId, folderName)
    }

    private fun openFile(file: FileItem) {
        val fileUrl = file.displayUrl
        
        if (fileUrl.isEmpty()) {
            Toast.makeText(this, "File URL not available", Toast.LENGTH_SHORT).show()
            return
        }
        
        try {
            // Check if it's a local file (pending offline upload)
            if (fileUrl.startsWith("file://") || fileUrl.startsWith("/")) {
                // Local file - use FileProvider to open
                val localFile = if (fileUrl.startsWith("file://")) {
                    File(Uri.parse(fileUrl).path ?: "")
                } else {
                    File(fileUrl)
                }
                
                if (localFile.exists()) {
                    val uri = FileProvider.getUriForFile(
                        this,
                        "${packageName}.provider",
                        localFile
                    )
                    
                    val mimeType = when {
                        file.name.endsWith(".pdf", ignoreCase = true) -> "application/pdf"
                        file.name.endsWith(".jpg", ignoreCase = true) || file.name.endsWith(".jpeg", ignoreCase = true) -> "image/jpeg"
                        file.name.endsWith(".png", ignoreCase = true) -> "image/png"
                        else -> "*/*"
                    }
                    
                    val intent = Intent(Intent.ACTION_VIEW).apply {
                        setDataAndType(uri, mimeType)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    
                    if (intent.resolveActivity(packageManager) != null) {
                        startActivity(intent)
                    } else {
                        Toast.makeText(this, "No app found to open this file", Toast.LENGTH_SHORT).show()
                    }
                } else {
                    Toast.makeText(this, "File not found locally", Toast.LENGTH_SHORT).show()
                }
            } else {
                // Server file - open in browser
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(fileUrl))
                startActivity(intent)
            }
        } catch (e: Exception) {
            e.printStackTrace()
            Toast.makeText(this, "Error opening file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }

    private fun downloadFolderZip() {
        patientViewModel.downloadFolderZip(patientId, folderName)
    }

    override fun onResume() {
        super.onResume()
        // Refresh files when returning to this activity
        loadFiles()
        
        // Request notification permission for Android 13+
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            if (checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != 
                android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 101)
            }
        }
    }
}
