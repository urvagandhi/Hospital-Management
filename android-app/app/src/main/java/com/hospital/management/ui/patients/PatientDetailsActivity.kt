package com.hospital.management.ui.patients

import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.databinding.ActivityPatientDetailsBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.text.SimpleDateFormat
import java.util.Locale

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.models.Patient
import com.hospital.management.ui.folders.FolderAdapter
import com.hospital.management.ui.folders.FolderDetailsActivity

class PatientDetailsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPatientDetailsBinding
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager
    private var patientId: String = ""
    private var isEditMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPatientDetailsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()

        patientId = intent.getStringExtra("PATIENT_ID") ?: ""

        setupViews()
        setupClickListeners()
        setupObservers()
        loadPatientDetails()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupViews() {
        binding.scrollView.visibility = View.GONE
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener { finish() }

        binding.btnEdit.setOnClickListener {
            if (isEditMode) {
                savePatientDetails()
            } else {
                enableEditMode()
            }
        }
    }

    private fun setupObservers() {
         lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is PatientState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        if (state.message == "Patient updated successfully") {
                             Toast.makeText(this@PatientDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                             disableEditMode()
                        } else if (state.message?.isNotEmpty() == true && state.message != "Patient loaded") {
                             Toast.makeText(this@PatientDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(this@PatientDetailsActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> binding.progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentPatient.collect { patient ->
                 if (patient != null && patient._id == patientId) {
                     displayPatientInfo(patient)
                     binding.scrollView.visibility = View.VISIBLE
                 }
            }
        }
    }

    private fun loadPatientDetails() {
         patientViewModel.getPatientById(patientId)
    }

    private fun displayPatientInfo(patient: Patient) {
        binding.etPatientName.setText(patient.patientName)
        binding.etEmail.setText(patient.email ?: "")
        binding.etPhone.setText(patient.phone)
        binding.etDateOfBirth.setText(formatDate(patient.dateOfBirth))
        binding.etMrn.setText(patient.medicalRecordNumber)
        binding.etNotes.setText("") // Placeholder as notes not in model yet

        // Setup Folders RecyclerView
        val folders = patient.folders
        if (folders.isNotEmpty()) {
            val folderAdapter = FolderAdapter(folders) { folder ->
                // Navigate to folder details
                val intent = android.content.Intent(this, FolderDetailsActivity::class.java)
                intent.putExtra("PATIENT_ID", patient._id)
                intent.putExtra("FOLDER_NAME", folder.name)
                intent.putExtra("FILE_COUNT", folder.fileCount)
                startActivity(intent)
            }
            binding.rvFolders.layoutManager = androidx.recyclerview.widget.GridLayoutManager(this, 2)
            binding.rvFolders.adapter = folderAdapter
            binding.rvFolders.visibility = View.VISIBLE
        } else {
            binding.rvFolders.visibility = View.GONE
            // Optionally show "No folders" text if added to layout
        }
    }

    private fun formatDate(dateString: String): String {
        if (dateString.isEmpty()) return ""
        return try {
            val inputFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.getDefault())
            val outputFormat = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
            val date = inputFormat.parse(dateString)
            date?.let { outputFormat.format(it) } ?: dateString.substringBefore("T")
        } catch (e: Exception) {
            dateString.substringBefore("T")
        }
    }

    private fun enableEditMode() {
        isEditMode = true
        binding.btnEdit.text = "Save"
        binding.etPatientName.isEnabled = true
        binding.etEmail.isEnabled = true
        binding.etPhone.isEnabled = true
        binding.etDateOfBirth.isEnabled = true
        binding.etMrn.isEnabled = true
        binding.etNotes.isEnabled = true
    }

    private fun disableEditMode() {
        isEditMode = false
        binding.btnEdit.text = "Edit"
        binding.etPatientName.isEnabled = false
        binding.etEmail.isEnabled = false
        binding.etPhone.isEnabled = false
        binding.etDateOfBirth.isEnabled = false
        binding.etMrn.isEnabled = false
        binding.etNotes.isEnabled = false
    }

    private fun savePatientDetails() {
        val patientName = binding.etPatientName.text.toString()
        val email = binding.etEmail.text.toString()
        val phone = binding.etPhone.text.toString()
        val dateOfBirth = binding.etDateOfBirth.text.toString()
        val mrn = binding.etMrn.text.toString()
        val notes = binding.etNotes.text.toString()

        if (patientName.isBlank()) {
            Toast.makeText(this, "Patient name is required", Toast.LENGTH_SHORT).show()
            return
        }

        val requestBody = mapOf(
            "patientName" to patientName,
            "email" to email,
            "phone" to phone,
            "dateOfBirth" to dateOfBirth,
            "medicalRecordNumber" to mrn,
            "notes" to notes
        )

        patientViewModel.updatePatient(patientId, requestBody)
    }
}
