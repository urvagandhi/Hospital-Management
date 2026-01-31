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
            fileAdapter = FileAdapter(allFiles) { file ->
                // View or download file
                Toast.makeText(this@FolderDetailsActivity, "Opening ${file.name}", Toast.LENGTH_SHORT).show()
            }
            rvFiles.adapter = fileAdapter
            rvFiles.visibility = View.VISIBLE
            tvEmpty.visibility = View.GONE
        } else {
            rvFiles.visibility = View.GONE
            tvEmpty.visibility = View.VISIBLE
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

    private fun downloadFolderZip() {
        patientViewModel.downloadFolderZip(patientId, folderName)
    }

    override fun onResume() {
        super.onResume()
        loadFiles() // Refresh file list when returning from scanner
    }
}
