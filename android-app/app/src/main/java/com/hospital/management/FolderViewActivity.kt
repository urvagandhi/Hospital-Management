package com.hospital.management

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.models.Folder
import kotlinx.coroutines.launch

class FolderViewActivity : AppCompatActivity() {

    private lateinit var patientViewModel: PatientViewModel
    private lateinit var rvFolders: RecyclerView
    private lateinit var folderAdapter: FolderAdapter
    private lateinit var progressBar: View
    private lateinit var tvEmpty: View
    private lateinit var tokenManager: TokenManager

    private var patientId: String = ""
    private var patientName: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_folder_view)

        tokenManager = TokenManager(this)
        setupViewModel()

        // Get patient info from intent
        patientId = intent.getStringExtra("PATIENT_ID") ?: ""
        patientName = intent.getStringExtra("PATIENT_NAME") ?: "Patient"

        setupViews()
        setupObservers()
        loadFolders()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupViews() {
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }
        findViewById<android.widget.TextView>(R.id.tvPatientName).text = patientName

        rvFolders = findViewById(R.id.rvFolders)
        progressBar = findViewById(R.id.progressBar)
        tvEmpty = findViewById(R.id.tvEmpty)

        rvFolders.layoutManager = GridLayoutManager(this, 2)

        // Button to view patient details
        findViewById<View>(R.id.btnPatientDetails).setOnClickListener {
            val intent = Intent(this, com.hospital.management.ui.patients.PatientDetailsActivity::class.java)
            intent.putExtra("PATIENT_ID", patientId)
            startActivity(intent)
        }

        // FAB for scan document
        findViewById<View>(R.id.fabScan).setOnClickListener {
            showFolderSelectionDialog()
        }

        // FAB for download all
        findViewById<View>(R.id.fabDownloadAll).setOnClickListener {
            showDownloadOptionsDialog()
        }

        // FAB for create folder
        findViewById<View>(R.id.fabCreateFolder)?.setOnClickListener {
            showCreateFolderDialog()
        }
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> progressBar.visibility = View.VISIBLE
                    is PatientState.Success -> {
                        progressBar.visibility = View.GONE
                        if (state.message?.isNotEmpty() == true && state.message != "Patient loaded") {
                             Toast.makeText(this@FolderViewActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        progressBar.visibility = View.GONE
                        Toast.makeText(this@FolderViewActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentPatient.collect { patient ->
                if (patient != null && patient._id == patientId) {
                    val folders = patient.folders
                    if (folders.isNotEmpty()) {
                        folderAdapter = FolderAdapter(folders) { folder ->
                            // Navigate to folder details
                            val intent = Intent(this@FolderViewActivity, FolderDetailsActivity::class.java)
                            intent.putExtra("PATIENT_ID", patientId)
                            intent.putExtra("FOLDER_NAME", folder.name)
                            intent.putExtra("FILE_COUNT", folder.fileCount)
                            startActivity(intent)
                        }
                        rvFolders.adapter = folderAdapter
                        rvFolders.visibility = View.VISIBLE
                        tvEmpty.visibility = View.GONE
                    } else {
                        rvFolders.visibility = View.GONE
                        tvEmpty.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private fun loadFolders() {
        patientViewModel.getPatientById(patientId)
    }

    private fun showCreateFolderDialog() {
        val input = android.widget.EditText(this)
        input.hint = "Enter folder name"
        input.setPadding(50, 20, 50, 20)

        AlertDialog.Builder(this)
            .setTitle("Create New Folder")
            .setView(input)
            .setPositiveButton("Create") { _, _ ->
                val folderName = input.text.toString().trim()
                if (folderName.isNotEmpty()) {
                    createFolder(folderName)
                } else {
                    Toast.makeText(this, "Folder name cannot be empty", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun createFolder(folderName: String) {
        patientViewModel.createFolder(patientId, folderName)
    }

    private fun showFolderSelectionDialog() {
        val patient = patientViewModel.currentPatient.value ?: return
        val folders = patient.folders

        if (folders.isEmpty()) {
            Toast.makeText(this@FolderViewActivity, "No folders available", Toast.LENGTH_SHORT).show()
            return
        }

        val folderNames = folders.map { it.name }.toTypedArray()

        AlertDialog.Builder(this@FolderViewActivity)
            .setTitle("Select Folder")
            .setItems(folderNames) { _, which ->
                // Navigate to scanner
                val intent = Intent(this@FolderViewActivity, ScannerActivity::class.java)
                intent.putExtra("PATIENT_ID", patientId)
                intent.putExtra("FOLDER_NAME", folderNames[which])
                startActivity(intent)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showDownloadOptionsDialog() {
        val options = arrayOf("Download as PDF", "Download as ZIP")

        AlertDialog.Builder(this)
            .setTitle("Download All Files")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> downloadAllPdf()
                    1 -> downloadAllZip()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun downloadAllPdf() {
        patientViewModel.downloadAllPdf(patientId)
    }

    private fun downloadAllZip() {
        patientViewModel.downloadAllZip(patientId)
    }

    override fun onResume() {
        super.onResume()
        loadFolders() // Refresh folder list when returning from scanner
    }
}
