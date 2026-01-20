package com.hospital.management.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.hospital.management.R
import com.hospital.management.databinding.ActivityDashboardBinding
import com.hospital.management.ui.admission.AdmissionActivity
import com.hospital.management.ui.auth.LoginActivity
import com.hospital.management.ui.folders.FolderViewActivity
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.launch

class DashboardActivity : AppCompatActivity() {
    private lateinit var binding: ActivityDashboardBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var authViewModel: AuthViewModel
    private lateinit var patientViewModel: com.hospital.management.presentation.viewmodel.PatientViewModel
    private lateinit var patientAdapter: com.hospital.management.ui.patients.PatientAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityDashboardBinding.inflate(layoutInflater)
        setContentView(binding.root)
        setSupportActionBar(binding.toolbar)
        supportActionBar?.title = ""
        tokenManager = TokenManager(this)
        setupViewModels()
        setupHospitalInfo()
        setupPatientList()
        setupPatientObservers()
        setupPatientListeners()
        SessionManager.updateLastInteractionTime(this)
    }

    override fun onResume() {
        super.onResume()
        SessionManager.updateLastInteractionTime(this)
        fetchAndDisplayHospitalInfo()
        patientViewModel.getPatients()
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.dashboard_menu, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_logout -> {
                showLogoutDialog()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun showLogoutDialog() {
        AlertDialog.Builder(this, R.style.AlertDialogTheme)
            .setTitle("Logout")
            .setMessage("Are you sure you want to logout?")
            .setPositiveButton("Yes") { _, _ ->
                logout()
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun logout() {
        authViewModel.logout()
        val intent = Intent(this@DashboardActivity, LoginActivity::class.java)
        intent.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        startActivity(intent)
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        finish()
    }

    private fun setupViewModels() {
        val apiService = RetrofitClient.getApiService(this)
        val authRepository = AuthRepository(apiService, tokenManager)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(authRepository = authRepository, patientRepository = patientRepository)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]
        patientViewModel = ViewModelProvider(this, factory)[com.hospital.management.presentation.viewmodel.PatientViewModel::class.java]
    }

    private fun setupHospitalInfo() {
        lifecycleScope.launch {
            val hospitalName = tokenManager.getHospitalName() ?: ""
            val logoUrl = tokenManager.getHospitalLogoUrl() ?: ""
            binding.tvHospitalName.text = hospitalName
            binding.tvToolbarHospitalName.text = hospitalName
            if (logoUrl.isNotEmpty()) {
                Glide.with(this@DashboardActivity)
                    .load(logoUrl)
                    .circleCrop()
                    .placeholder(R.mipmap.ic_launcher)
                    .error(R.mipmap.ic_launcher)
                    .into(binding.ivToolbarLogo)
            }
        }
    }

    private fun fetchAndDisplayHospitalInfo() {
        lifecycleScope.launch {
            val apiService = RetrofitClient.getApiService(this@DashboardActivity)
            try {
                val response = apiService.getCurrentHospital()
                if (response.isSuccessful && response.body() != null) {
                    val hospital = response.body()!!
                    binding.tvHospitalName.text = hospital.hospitalName
                    binding.tvToolbarHospitalName.text = hospital.hospitalName
                    if (!hospital.logoUrl.isNullOrEmpty() && !hospital.logoUrl.contains("placeholder")) {
                        Glide.with(this@DashboardActivity)
                            .load(hospital.logoUrl)
                            .circleCrop()
                            .placeholder(R.mipmap.ic_launcher)
                            .error(R.mipmap.ic_launcher)
                            .into(binding.ivToolbarLogo)
                    } else {
                        binding.ivToolbarLogo.setImageResource(R.mipmap.ic_launcher)
                    }
                    tokenManager.saveHospitalInfo(hospital._id, hospital.hospitalName, hospital.logoUrl ?: "")
                } else {
                    Toast.makeText(this@DashboardActivity, "Failed to fetch hospital details.", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                Toast.makeText(this@DashboardActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun setupPatientList() {
        patientAdapter = com.hospital.management.ui.patients.PatientAdapter(mutableListOf()) { patient ->
            val intent = Intent(this, FolderViewActivity::class.java)
            intent.putExtra("PATIENT_ID", patient._id)
            intent.putExtra("PATIENT_NAME", patient.patientName)
            startActivity(intent)
        }
        binding.rvPatients.layoutManager = LinearLayoutManager(this)
        binding.rvPatients.adapter = patientAdapter
        patientViewModel.getPatients()
    }

    private fun setupPatientObservers() {
        lifecycleScope.launch {
            patientViewModel.patients.collect { patients ->
                patientAdapter.updateList(patients)
                binding.layoutEmpty.visibility = if (patients.isEmpty()) View.VISIBLE else View.GONE
                binding.tvPatientCount.text = patients.size.toString()
            }
        }
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when (state) {
                    is com.hospital.management.presentation.viewmodel.PatientState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is com.hospital.management.presentation.viewmodel.PatientState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(this@DashboardActivity, state.message ?: "Success", Toast.LENGTH_SHORT).show()
                    }
                    is com.hospital.management.presentation.viewmodel.PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(this@DashboardActivity, "Patient error: ${state.message}", Toast.LENGTH_LONG).show()
                    }
                    else -> binding.progressBar.visibility = View.GONE
                }
            }
        }
    }

    private fun setupPatientListeners() {
        binding.btnNewAdmission.setOnClickListener {
            startActivity(Intent(this, AdmissionActivity::class.java))
        }
        binding.swipeRefresh.setOnRefreshListener {
            patientViewModel.getPatients()
            fetchAndDisplayHospitalInfo()
            binding.swipeRefresh.isRefreshing = false
        }
        binding.searchView.setOnQueryTextListener(object : androidx.appcompat.widget.SearchView.OnQueryTextListener {
            override fun onQueryTextSubmit(query: String?): Boolean {
                patientAdapter.filter.filter(query)
                return false
            }
            override fun onQueryTextChange(newText: String?): Boolean {
                patientAdapter.filter.filter(newText)
                return false
            }
        })
    }
}
