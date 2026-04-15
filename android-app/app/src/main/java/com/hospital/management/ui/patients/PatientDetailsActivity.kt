package com.hospital.management.ui.patients

import android.os.Bundle
import android.view.View
import android.widget.Toast
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.databinding.ActivityPatientDetailsBinding
import kotlinx.coroutines.launch

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.models.Patient
import com.hospital.management.ui.folders.FolderAdapter
import com.hospital.management.ui.folders.FolderDetailsActivity

class PatientDetailsActivity : BaseActivity() {
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

    override fun onResume() {
        super.onResume()
        loadPatientDetails()
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
        binding.tvTitle.text = patient.patientName
        binding.tvPatientId.text = patient.patientId
        binding.etPatientName.setText(patient.patientName)
        binding.etRemarks.setText(patient.remarks ?: "")

        // Setup Folders RecyclerView
        val folders = patient.folders
        if (folders.isNotEmpty()) {
            val folderAdapter = FolderAdapter(folders) { folder ->
                val intent = android.content.Intent(this, FolderDetailsActivity::class.java)
                intent.putExtra("PATIENT_ID", patient._id)
                intent.putExtra("FOLDER_NAME", folder.name)
                intent.putExtra("FILE_COUNT", folder.fileCount)
                intent.putExtra("PATIENT_NAME", patient.patientName)
                intent.putExtra("PATIENT_DISPLAY_ID", patient.patientId)
                startActivity(intent)
            }
            binding.rvFolders.layoutManager = androidx.recyclerview.widget.GridLayoutManager(this, 2)
            binding.rvFolders.adapter = folderAdapter
            binding.rvFolders.visibility = View.VISIBLE
        } else {
            binding.rvFolders.visibility = View.GONE
        }
    }

    private fun enableEditMode() {
        isEditMode = true
        binding.btnEdit.text = "Save"
        binding.etPatientName.isEnabled = true
        binding.etRemarks.isEnabled = true
    }

    private fun disableEditMode() {
        isEditMode = false
        binding.btnEdit.text = "Edit"
        binding.etPatientName.isEnabled = false
        binding.etRemarks.isEnabled = false
    }

    private fun savePatientDetails() {
        val patientName = binding.etPatientName.text.toString().trim()
        val remarks = binding.etRemarks.text.toString().trim()

        if (patientName.isBlank()) {
            Toast.makeText(this, "Patient name is required", Toast.LENGTH_SHORT).show()
            return
        }

        val requestBody = mapOf(
            "patientName" to patientName,
            "remarks" to remarks
        )

        patientViewModel.updatePatient(patientId, requestBody)
    }
}
