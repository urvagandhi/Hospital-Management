package com.hospital.management.ui.patients

import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.hospital.management.ui.folders.FolderViewActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.Patient
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.databinding.ActivityPatientListBinding
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import kotlinx.coroutines.launch

class PatientListActivity : BaseActivity() {
    private lateinit var binding: ActivityPatientListBinding
    private lateinit var adapter: PatientAdapter
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityPatientListBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)

        setupViewModel()
        setupRecyclerView()
        setupClickListeners()
        setupObservers()

        // Initial Load
        loadPatients()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupRecyclerView() {
        adapter = PatientAdapter(mutableListOf()) { patient ->
            // Navigate to patient details/folders
            val intent = Intent(this, FolderViewActivity::class.java)
            intent.putExtra("PATIENT_ID", patient._id)
            intent.putExtra("PATIENT_NAME", patient.patientName)
            startActivity(intent)
        }

        binding.rvPatients.layoutManager = LinearLayoutManager(this)
        binding.rvPatients.adapter = adapter
    }

    private fun setupClickListeners() {
        binding.btnBack.setOnClickListener {
            finish()
        }

        binding.fabAddPatient.setOnClickListener {
            startActivity(Intent(this, com.hospital.management.ui.admission.AdmissionActivity::class.java))
        }

        binding.swipeRefresh.setOnRefreshListener {
            loadPatients()
        }

        binding.searchView.setOnQueryTextListener(object : androidx.appcompat.widget.SearchView.OnQueryTextListener {
            override fun onQueryTextSubmit(query: String?): Boolean {
                adapter.filter.filter(query)
                return false
            }

            override fun onQueryTextChange(newText: String?): Boolean {
                adapter.filter.filter(newText)
                return false
            }
        })
    }

    private fun setupObservers() {
        // Observe State
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when (state) {
                    is PatientState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is PatientState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        binding.swipeRefresh.isRefreshing = false
                    }
                    is PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.swipeRefresh.isRefreshing = false
                        Toast.makeText(this@PatientListActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        binding.progressBar.visibility = View.GONE
                        binding.swipeRefresh.isRefreshing = false
                    }
                }
            }
        }

        // Observe Data
        lifecycleScope.launch {
            patientViewModel.patients.collect { patients ->
               if (patients.isEmpty()) {
                   binding.layoutEmpty.visibility = View.VISIBLE
                   binding.rvPatients.visibility = View.GONE
                   adapter.updateList(emptyList())
               } else {
                   binding.layoutEmpty.visibility = View.GONE
                   binding.rvPatients.visibility = View.VISIBLE
                   adapter.updateList(patients)
               }
            }
        }
    }

    private fun loadPatients() {
        patientViewModel.getPatients()
    }
}
