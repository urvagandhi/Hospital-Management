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
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.hospital.management.worker.SyncDocumentsWorker
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

    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val activeNetwork = connectivityManager.getNetworkCapabilities(network) ?: return false
        return activeNetwork.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

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
        setupHospitalInfo() // Always load cached hospital info
        if (isNetworkAvailable()) {
            fetchAndDisplayHospitalInfo()
            patientViewModel.getPatients()
        }
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
            R.id.action_sync -> {
                startSync()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun startSync() {
        if (!isNetworkAvailable()) {
            Toast.makeText(this, "No internet connection available", Toast.LENGTH_SHORT).show()
            return
        }

        Toast.makeText(this, "Starting sync...", Toast.LENGTH_SHORT).show()
        val syncWorkRequest = OneTimeWorkRequestBuilder<SyncDocumentsWorker>().build()
        WorkManager.getInstance(this).enqueue(syncWorkRequest)

        WorkManager.getInstance(this).getWorkInfoByIdLiveData(syncWorkRequest.id)
            .observe(this) { workInfo ->
                if (workInfo != null && workInfo.state == WorkInfo.State.SUCCEEDED) {
                    Toast.makeText(this, "Sync completed successfully!", Toast.LENGTH_SHORT).show()
                } else if (workInfo != null && workInfo.state == WorkInfo.State.FAILED) {
                    Toast.makeText(this, "Sync failed. Retry later.", Toast.LENGTH_SHORT).show()
                }
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
            var hospitalName = tokenManager.getHospitalName() ?: "Hospital"
            if (hospitalName.isEmpty()) hospitalName = "Hospital"
            
            val logoUrl = tokenManager.getHospitalLogoUrl() ?: ""
            
            // DEBUG: Toast cached values
            Toast.makeText(this@DashboardActivity, "Cache: $hospitalName, Logo: ${logoUrl.take(10)}...", Toast.LENGTH_SHORT).show()
            
            binding.tvToolbarHospitalName.text = hospitalName
            if (logoUrl.isNotEmpty()) {
                Glide.with(this@DashboardActivity)
                    .load(logoUrl)
                    .circleCrop()
                    .placeholder(R.drawable.ic_splash_logo)
                    .error(R.drawable.ic_splash_logo)
                    .into(binding.ivToolbarLogo)
            } else {
                 binding.ivToolbarLogo.setImageResource(R.drawable.ic_splash_logo)
            }
        }
    }

    private fun fetchAndDisplayHospitalInfo() {
        lifecycleScope.launch {
            val apiService = RetrofitClient.getApiService(this@DashboardActivity)
            try {
                val response = apiService.getCurrentHospital()
                if (response.isSuccessful && response.body() != null) {
                    val responseBody = response.body()!!
                    
                    if (responseBody.data != null) {
                        val hospital = responseBody.data
                        
                        // DEBUG: Toast API success
                        Toast.makeText(this@DashboardActivity, "API: ${hospital.hospitalName}", Toast.LENGTH_SHORT).show()
                        
                        // Get current cached values to preserve if API returns empty
                        val cachedName = tokenManager.getHospitalName()
                        val cachedLogoUrl = tokenManager.getHospitalLogoUrl()
                        
                        // Use API name if valid, otherwise keep cached
                        val name = if (!hospital.hospitalName.isNullOrEmpty()) {
                            hospital.hospitalName
                        } else {
                            cachedName ?: "Hospital"
                        }
                    
                    // Use API logo URL only if it's valid (not empty and not a placeholder)
                    val logoUrl = if (!hospital.logoUrl.isNullOrEmpty() && !hospital.logoUrl.contains("placeholder")) {
                        hospital.logoUrl
                    } else {
                        cachedLogoUrl ?: ""
                    }
                    
                    // Update display with the resolved values
                    binding.tvToolbarHospitalName.text = name
                    
                    if (logoUrl.isNotEmpty()) {
                        Glide.with(this@DashboardActivity)
                            .load(logoUrl)
                            .circleCrop()
                            .placeholder(R.drawable.ic_splash_logo)
                            .error(R.drawable.ic_splash_logo)
                            .into(binding.ivToolbarLogo)
                    } else {
                        binding.ivToolbarLogo.setImageResource(R.drawable.ic_splash_logo)
                    }
                    
                    // Save to cache only if we have valid values to update
                    tokenManager.saveHospitalInfo(hospital._id, name, logoUrl)
                    }
                } else {
                    // API failed - keep existing cached data
                     Toast.makeText(this@DashboardActivity, "API Failed: ${response.code()}", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                // Error - keep existing cached data
                 Toast.makeText(this@DashboardActivity, "API Error: ${e.message}", Toast.LENGTH_SHORT).show()
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
                        // Don't show toast for routine loads, only for specific actions
                        if (state.message != null && state.message != "Patients loaded" && state.message != "Success") {
                            Toast.makeText(this@DashboardActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is com.hospital.management.presentation.viewmodel.PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        // Only show error if it's not a network timeout when offline
                        if (isNetworkAvailable()) {
                            Toast.makeText(this@DashboardActivity, "Error: ${state.message}", Toast.LENGTH_SHORT).show()
                        } else {
                            // Show offline indicator without annoying toast
                            binding.layoutEmpty.visibility = View.VISIBLE
                        }
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
