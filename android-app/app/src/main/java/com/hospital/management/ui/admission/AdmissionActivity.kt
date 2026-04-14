package com.hospital.management.ui.admission

import android.os.Bundle
import android.widget.Toast
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityAdmissionBinding

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import android.view.View
import kotlinx.coroutines.launch

class AdmissionActivity : BaseActivity() {
    private lateinit var binding: ActivityAdmissionBinding
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAdmissionBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()
        setupObservers()

        binding.btnBack.setOnClickListener { finish() }

        binding.btnSubmit.setOnClickListener {
            createPatient()
        }
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupObservers() {
        lifecycleScope.launch {
             patientViewModel.patientState.collect { state ->
                 when(state) {
                     is PatientState.Loading -> {
                         binding.progressBar.visibility = View.VISIBLE
                         binding.btnSubmit.isEnabled = false
                     }
                     is PatientState.Success -> {
                         binding.progressBar.visibility = View.GONE
                         binding.btnSubmit.isEnabled = true
                         if (state.message == "Patient created successfully") {
                             Toast.makeText(this@AdmissionActivity, state.message, Toast.LENGTH_SHORT).show()
                             finish()
                         }
                     }
                     is PatientState.Error -> {
                         binding.progressBar.visibility = View.GONE
                         binding.btnSubmit.isEnabled = true
                         Toast.makeText(this@AdmissionActivity, state.message, Toast.LENGTH_SHORT).show()
                     }
                     else -> {
                         binding.progressBar.visibility = View.GONE
                         binding.btnSubmit.isEnabled = true
                     }
                 }
             }
        }
    }

    private fun createPatient() {
        val name = binding.etPatientName.text.toString().trim()
        val remarks = binding.etRemarks.text.toString().trim()

        if (name.isEmpty()) {
            Toast.makeText(this, "Patient name is required", Toast.LENGTH_SHORT).show()
            return
        }

        val patientRequest = com.hospital.management.data.models.PatientRequest(
            patientName = name,
            remarks = remarks.ifEmpty { null }
        )

        patientViewModel.createPatient(patientRequest)
    }
}
