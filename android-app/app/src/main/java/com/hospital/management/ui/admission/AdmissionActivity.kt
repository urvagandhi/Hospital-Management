package com.hospital.management.ui.admission

import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityAdmissionBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import android.view.View

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

        // Setup Date Picker for DOB
        binding.etDob.isFocusable = false
        binding.etDob.isClickable = true
        binding.etDob.setOnClickListener {
            showDatePickerDialog()
        }

        binding.btnSubmit.setOnClickListener {
            createPatient()
        }
    }

    private fun showDatePickerDialog() {
        val calendar = java.util.Calendar.getInstance()
        val year = calendar.get(java.util.Calendar.YEAR)
        val month = calendar.get(java.util.Calendar.MONTH)
        val day = calendar.get(java.util.Calendar.DAY_OF_MONTH)

        val datePickerDialog = android.app.DatePickerDialog(
            this,
            { _, selectedYear, selectedMonth, selectedDay ->
                // Format: YYYY-MM-DD
                val formattedDate = String.format("%04d-%02d-%02d", selectedYear, selectedMonth + 1, selectedDay)
                binding.etDob.setText(formattedDate)
            },
            year,
            month,
            day
        )
        datePickerDialog.show()
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
        val name = binding.etPatientName.text.toString()
        val dob = binding.etDob.text.toString()
        val phone = binding.etPhone.text.toString()
        val email = binding.etEmail.text.toString()
        val mrn = binding.etMrn.text.toString()

        if (name.isEmpty() || dob.isEmpty() || phone.isEmpty() || mrn.isEmpty()) {
            Toast.makeText(this, "Please fill all required fields", Toast.LENGTH_SHORT).show()
            return
        }

        val patientRequest = com.hospital.management.data.models.PatientRequest(
            patientName = name,
            dateOfBirth = dob,
            phone = phone,
            email = if (email.isNotEmpty()) email else null,
            medicalRecordNumber = mrn
        )

        patientViewModel.createPatient(patientRequest)
    }
}
