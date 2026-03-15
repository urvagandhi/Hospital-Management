package com.hospital.management.ui.folders

import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
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
        
        // Initialize views
        rvFolders = findViewById(R.id.rvFolders)
        progressBar = findViewById(R.id.progressBar)
        tvEmpty = findViewById(R.id.tvEmpty)
        val tvPatientName = findViewById<android.widget.TextView>(R.id.tvPatientName)
        val tvMrn = findViewById<android.widget.TextView>(R.id.tvMrn)
        val tvPhone = findViewById<android.widget.TextView>(R.id.tvPhone)

        // Set initial data (might be empty initially)
        tvPatientName.text = patientName

        rvFolders.layoutManager = GridLayoutManager(this, 2)

        // Edit Button Logic
        findViewById<View>(R.id.btnEditPatient).setOnClickListener {
            val currentPatient = patientViewModel.currentPatient.value
            if (currentPatient != null && currentPatient._id == patientId) {
                showEditPatientDialog(currentPatient)
            } else {
                Toast.makeText(this, "Patient data not fully loaded yet", Toast.LENGTH_SHORT).show()
            }
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
                        if (state.message?.isNotEmpty() == true && state.message != "Patient loaded" && state.message != "Files loaded") {
                             Toast.makeText(this@FolderViewActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        progressBar.visibility = View.GONE
                        val msg = state.message
                        if (msg.contains("duplicate key error") || msg.contains("medicalRecordNumber")) {
                             showErrorDialog("Update Failed", "A patient with this Medical Record Number (MRN) already exists.\nPlease use a unique MRN.")
                        } else {
                             Toast.makeText(this@FolderViewActivity, msg, Toast.LENGTH_SHORT).show()
                        }
                    }
                    else -> progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentPatient.collect { patient ->
                if (patient != null && patient._id == patientId) {
                    // Update UI with patient details
                    findViewById<android.widget.TextView>(R.id.tvPatientName).text = patient.patientName
                    findViewById<android.widget.TextView>(R.id.tvMrn).text = "MRN: ${patient.medicalRecordNumber}"
                    findViewById<android.widget.TextView>(R.id.tvPhone).text = "Phone: ${patient.phone}"

                    // Update folder list with current pending counts
                    updateFolderList(patient)
                }
            }
        }
    }

    private fun updateFolderList(patient: com.hospital.management.data.models.Patient) {
        lifecycleScope.launch {
            // Get pending files count from local database
            val database = com.hospital.management.data.local.AppDatabase.getDatabase(this@FolderViewActivity)
            val pendingDocs = database.documentDao().getPendingForPatient(patientId)
            
            // Create a map of folder name -> pending count
            val pendingCounts = mutableMapOf<String, Int>()
            for (doc in pendingDocs) {
                pendingCounts[doc.folderName] = (pendingCounts[doc.folderName] ?: 0) + 1
            }

            val folders = patient.folders
            if (folders.isNotEmpty() || pendingCounts.isNotEmpty()) {
                // Create folder list with updated counts
                val updatedFolders = folders.map { folder ->
                    val pendingCount = pendingCounts[folder.name] ?: 0
                    Folder(
                        name = folder.name,
                        files = folder.files,
                        _fileCount = folder.fileCount + pendingCount
                    )
                }
                
                folderAdapter = FolderAdapter(updatedFolders) { folder ->
                    // Navigate to folder details
                    val intent = Intent(this@FolderViewActivity, FolderDetailsActivity::class.java)
                    intent.putExtra("PATIENT_ID", patientId)
                    intent.putExtra("FOLDER_NAME", folder.name)
                    intent.putExtra("FILE_COUNT", folder.fileCount)
                    intent.putExtra("PATIENT_NAME", patient.patientName)
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

    private fun showEditPatientDialog(patient: com.hospital.management.data.models.Patient) {
        // Let's create a layout programmatically to avoid creating a new file for now, or just inflate a simple linear layout
        val layout = android.widget.LinearLayout(this)
        layout.orientation = android.widget.LinearLayout.VERTICAL
        layout.setPadding(50, 40, 50, 40)

        val etName = android.widget.EditText(this)
        etName.hint = "Patient Name"
        etName.setText(patient.patientName)
        layout.addView(etName)

        val etMrn = android.widget.EditText(this)
        etMrn.hint = "Medical Record Number"
        etMrn.setText(patient.medicalRecordNumber)
        layout.addView(etMrn)

        val etPhone = android.widget.EditText(this)
        etPhone.hint = "Phone Number"
        etPhone.setText(patient.phone)
        layout.addView(etPhone)

        AlertDialog.Builder(this)
            .setTitle("Edit Patient Details")
            .setView(layout)
            .setPositiveButton("Update") { _, _ ->
                val name = etName.text.toString().trim()
                val mrn = etMrn.text.toString().trim()
                val phone = etPhone.text.toString().trim()

                if (name.isNotEmpty() && mrn.isNotEmpty()) {
                    val updateData = mapOf(
                        "patientName" to name,
                        "medicalRecordNumber" to mrn,
                        "phone" to phone
                    )
                    patientViewModel.updatePatient(patientId, updateData)
                } else {
                    Toast.makeText(this, "Name and MRN are required", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun showErrorDialog(title: String, message: String) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
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
