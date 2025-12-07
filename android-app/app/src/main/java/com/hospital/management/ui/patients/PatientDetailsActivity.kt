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

class PatientDetailsActivity : AppCompatActivity() {
    private lateinit var binding: ActivityPatientDetailsBinding
    private lateinit var repository: PatientRepository
    private var patientId: String = ""
    private var isEditMode = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPatientDetailsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        repository = PatientRepository(apiService, tokenManager)

        patientId = intent.getStringExtra("PATIENT_ID") ?: ""

        setupClickListeners()
        loadPatientDetails()
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

    private fun loadPatientDetails() {
        binding.progressBar.visibility = View.VISIBLE
        binding.scrollView.visibility = View.GONE

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val response = repository.getPatientById(patientId)
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    binding.scrollView.visibility = View.VISIBLE

                    if (response.isSuccessful && response.body()?.get("success") == true) {
                        val data = response.body()?.get("data") as? Map<*, *>
                        displayPatientInfo(data)
                    } else {
                        Toast.makeText(this@PatientDetailsActivity, "Failed to load patient details", Toast.LENGTH_SHORT).show()
                        finish()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@PatientDetailsActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                    finish()
                }
            }
        }
    }

    private fun displayPatientInfo(data: Map<*, *>?) {
        data?.let {
            binding.etPatientName.setText(it["patientName"] as? String ?: "")
            binding.etEmail.setText(it["email"] as? String ?: "")
            binding.etPhone.setText(it["phone"] as? String ?: "")
            binding.etDateOfBirth.setText(formatDate(it["dateOfBirth"] as? String ?: ""))
            binding.etMrn.setText(it["medicalRecordNumber"] as? String ?: "")
            binding.etNotes.setText(it["notes"] as? String ?: "")
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

        binding.progressBar.visibility = View.VISIBLE

        CoroutineScope(Dispatchers.IO).launch {
            try {
                val requestBody = mapOf(
                    "patientName" to patientName,
                    "email" to email,
                    "phone" to phone,
                    "dateOfBirth" to dateOfBirth,
                    "medicalRecordNumber" to mrn,
                    "notes" to notes
                )

                val response = repository.updatePatient(patientId, requestBody)
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE

                    if (response.isSuccessful && response.body()?.get("success") == true) {
                        Toast.makeText(this@PatientDetailsActivity, "Patient updated successfully", Toast.LENGTH_SHORT).show()
                        disableEditMode()
                    } else {
                        val errorMsg = response.body()?.get("message") as? String ?: "Failed to update patient"
                        Toast.makeText(this@PatientDetailsActivity, errorMsg, Toast.LENGTH_SHORT).show()
                    }
                }
            } catch (e: Exception) {
                withContext(Dispatchers.Main) {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@PatientDetailsActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
                }
            }
        }
    }
}
