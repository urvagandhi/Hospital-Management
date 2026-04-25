package com.hospital.management.ui.dashboard

import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.bumptech.glide.Glide
import com.hospital.management.R
import com.hospital.management.databinding.ActivityDashboardBinding
import com.hospital.management.ui.admission.AdmissionActivity
import com.hospital.management.ui.auth.LoginActivity
import androidx.work.BackoffPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit
import com.hospital.management.worker.SyncDocumentsWorker
import com.hospital.management.ui.folders.FolderViewActivity
import com.hospital.management.presentation.viewmodel.AuthViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import android.annotation.SuppressLint
import android.content.Context
import com.google.android.material.badge.BadgeDrawable
import com.google.android.material.badge.BadgeUtils
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class DashboardActivity : BaseActivity() {
    private lateinit var binding: ActivityDashboardBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var authViewModel: AuthViewModel
    private lateinit var patientViewModel: com.hospital.management.presentation.viewmodel.PatientViewModel
    private lateinit var patientAdapter: com.hospital.management.ui.patients.PatientAdapter
    private var searchDebounceJob: Job? = null
    private var currentMenu: Menu? = null
    private var syncBadge: BadgeDrawable? = null

    override fun isShowingCachedData(): Boolean =
        ::patientViewModel.isInitialized && patientViewModel.patients.value.isNotEmpty()

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
        requestNotificationPermissionIfNeeded()
        setupWorkProgressBanner()
    }

    private fun setupWorkProgressBanner() {
        // Self-observing banner that auto-shows/hides based on in-flight
        // WorkManager jobs tagged hms_download / hms_upload / hms_sync.
        findViewById<com.hospital.management.ui.components.WorkProgressBanner>(
            R.id.workProgressBanner
        )?.observe(this)
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            val granted = checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) ==
                android.content.pm.PackageManager.PERMISSION_GRANTED
            if (!granted) {
                requestPermissions(arrayOf(android.Manifest.permission.POST_NOTIFICATIONS), 1001)
            }
        }
    }

    // SESSION_REVOKED receiver is now handled by BaseActivity
    // Offline banner is now handled by BaseActivity.observeNetworkStatus()

    override fun onResume() {
        super.onResume()
        SessionManager.updateLastInteractionTime(this)
        setupHospitalInfo() // Always load cached hospital info
        // Always call getPatients — ViewModel falls back to Room cache when offline
        patientViewModel.getPatients()
        if (isNetworkAvailable()) {
            fetchAndDisplayHospitalInfo()
        }
    }

    private var isAdmin = false

    @SuppressLint("UnsafeOptInUsageError")
    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.dashboard_menu, menu)
        currentMenu = menu
        observePendingBadge()
        return true
    }

    @SuppressLint("UnsafeOptInUsageError")
    private fun observePendingBadge() {
        val db = AppDatabase.getDatabase(this)
        lifecycleScope.launch {
            db.documentDao().observePendingCount().collect { count ->
                val badge = syncBadge ?: BadgeDrawable.create(this@DashboardActivity).also { syncBadge = it }
                if (count > 0) {
                    badge.number = count
                    BadgeUtils.attachBadgeDrawable(badge, binding.toolbar, R.id.action_sync)
                } else {
                    BadgeUtils.detachBadgeDrawable(badge, binding.toolbar, R.id.action_sync)
                    syncBadge = null
                }
            }
        }
    }

    override fun onPrepareOptionsMenu(menu: Menu): Boolean {
        return super.onPrepareOptionsMenu(menu)
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_logout -> { showLogoutDialog(); true }
            R.id.action_sync -> { startSync(); true }
            R.id.action_profile -> {
                startActivity(Intent(this, com.hospital.management.ui.profile.ProfileActivity::class.java))
                true
            }
            R.id.action_change_password -> {
                startActivity(Intent(this, com.hospital.management.ui.profile.ChangePasswordSettingsActivity::class.java))
                true
            }
            R.id.action_sessions -> {
                startActivity(Intent(this, com.hospital.management.ui.profile.SessionsActivity::class.java))
                true
            }
            R.id.action_notifications -> {
                startActivity(Intent(this, com.hospital.management.ui.profile.NotificationsActivity::class.java))
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

        // Reset any docs stuck in UPLOADING from a previously cancelled worker
        // before enqueuing, so they're picked up immediately by this run.
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            AppDatabase.getDatabase(this@DashboardActivity).documentDao().resetStuckUploading()
        }

        Toast.makeText(this, "Starting sync...", Toast.LENGTH_SHORT).show()
        // KEEP — if a sync is already running, let it finish rather than cancelling
        // mid-upload. REPLACE caused a race where the cancelled worker had already
        // uploaded but hadn't deleted the Room entry, leaving docs stuck in UPLOADING.
        val syncWorkRequest = OneTimeWorkRequestBuilder<SyncDocumentsWorker>()
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 30, TimeUnit.SECONDS)
            .build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "auto_sync_documents",
            ExistingWorkPolicy.KEEP,
            syncWorkRequest
        )

        WorkManager.getInstance(this).getWorkInfosForUniqueWorkLiveData("auto_sync_documents")
            .observe(this) { workInfos ->
                val workInfo = workInfos?.firstOrNull()
                if (workInfo != null && workInfo.state == WorkInfo.State.SUCCEEDED) {
                    Toast.makeText(this, "Sync completed successfully!", Toast.LENGTH_SHORT).show()
                } else if (workInfo != null && workInfo.state == WorkInfo.State.FAILED) {
                    Toast.makeText(this, "Sync failed. Retry later.", Toast.LENGTH_SHORT).show()
                }
            }
    }

    private fun showLogoutDialog() {
        // Read pending-uploads count for THIS hospital before showing the
        // dialog. If there are unsynced docs, the user gets a stronger warning
        // because logout will discard them (healthcare-compliance: we never
        // upload doc A's queued scans under doc B's later session).
        lifecycleScope.launch {
            val hospitalId = tokenManager.getHospitalId().orEmpty()
            val pendingCount = if (hospitalId.isNotEmpty()) {
                try {
                    AppDatabase.getDatabase(this@DashboardActivity)
                        .documentDao()
                        .getPendingCountForHospital(hospitalId)
                } catch (_: Throwable) { 0 }
            } else 0

            val online = isNetworkAvailable()
            val (title, message, confirmLabel) = when {
                pendingCount > 0 && !online -> Triple(
                    "Discard unsynced scans?",
                    "You have $pendingCount document(s) waiting to upload but you're offline. " +
                        "Logging out now will discard them — they cannot be transferred to another " +
                        "account on this device. Logout anyway?",
                    "Discard & Logout",
                )
                pendingCount > 0 -> Triple(
                    "$pendingCount upload(s) still syncing",
                    "There are $pendingCount document(s) still uploading. " +
                        "Logging out will cancel them. Wait for sync to finish, or logout anyway?",
                    "Discard & Logout",
                )
                else -> Triple(
                    "Logout",
                    "Are you sure you want to logout?",
                    "Logout",
                )
            }

            AlertDialog.Builder(this@DashboardActivity, R.style.AlertDialogTheme)
                .setTitle(title)
                .setMessage(message)
                .setPositiveButton(confirmLabel) { _, _ -> logout() }
                .setNegativeButton("Cancel", null)
                .show()
        }
    }

    @OptIn(kotlinx.coroutines.DelicateCoroutinesApi::class)
    private fun logout() {
        // Single canonical logout path. SessionManager.logoutUser:
        //   • Cancels in-flight sync worker
        //   • Deletes pending uploads owned by this hospital
        //   • Calls /api/auth/logout (or queues OfflineLogoutWorker if offline)
        //   • Clears local tokens
        //   • Navigates to LoginActivity
        // Runs on GlobalScope (NOT lifecycleScope) so it survives the
        // imminent finish() of this activity. NonCancellable inside
        // SessionManager.logoutUser further protects the backend call.
        kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.Main) {
            SessionManager.logoutUser(this@DashboardActivity.applicationContext)
        }
        if (android.os.Build.VERSION.SDK_INT >= 34) {
            overrideActivityTransition(OVERRIDE_TRANSITION_OPEN, android.R.anim.fade_in, android.R.anim.fade_out)
        } else {
            @Suppress("DEPRECATION")
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
        }
        finish()
    }

    private fun setupViewModels() {
        val apiService = RetrofitClient.getApiService(this)
        val authRepository = AuthRepository(apiService, tokenManager)
        val patientRepository = PatientRepository(
            apiService, tokenManager,
            com.hospital.management.data.local.AppDatabase.getDatabase(this).patientCacheDao()
        )
        val factory = ViewModelFactory(authRepository = authRepository, patientRepository = patientRepository)
        authViewModel = ViewModelProvider(this, factory)[AuthViewModel::class.java]
        patientViewModel = ViewModelProvider(this, factory)[com.hospital.management.presentation.viewmodel.PatientViewModel::class.java]
    }

    private fun setupHospitalInfo() {
        lifecycleScope.launch {
            var hospitalName = tokenManager.getHospitalName() ?: "Hospital"
            if (hospitalName.isEmpty()) hospitalName = "Hospital"

            val logoUrl = tokenManager.getHospitalLogoUrl() ?: ""

            binding.tvToolbarHospitalName.text = hospitalName
            applyHospitalAvatar(hospitalName, logoUrl)
        }
    }

    /**
     * Show a real logo image if one exists, otherwise render initials on a
     * brand-gradient circle. Keeps appearance consistent with web navbar.
     */
    private fun applyHospitalAvatar(hospitalName: String, logoUrl: String) {
        val isPlaceholder = logoUrl.isEmpty() || logoUrl.contains("placeholder", ignoreCase = true)
        if (!isPlaceholder) {
            binding.tvToolbarInitials.visibility = View.GONE
            binding.ivToolbarLogo.visibility = View.VISIBLE
            Glide.with(this@DashboardActivity)
                .load(logoUrl)
                .circleCrop()
                .into(binding.ivToolbarLogo)
        } else {
            binding.ivToolbarLogo.visibility = View.GONE
            binding.tvToolbarInitials.visibility = View.VISIBLE
            binding.tvToolbarInitials.text = hospitalInitials(hospitalName)
        }
    }

    private fun hospitalInitials(name: String): String {
        val parts = name.trim().split("\\s+".toRegex()).filter { it.isNotEmpty() }
        return when {
            parts.size >= 2 -> "${parts.first().first()}${parts[1].first()}".uppercase()
            parts.isNotEmpty() -> parts[0].take(2).uppercase()
            else -> "H"
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
                        // Track admin status so overflow menu hides Danger group for admins.
                        isAdmin = hospital.role == "admin"
                        invalidateOptionsMenu()
                        
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
                    applyHospitalAvatar(name, logoUrl)
                    
                    // Save to cache only if we have valid values to update
                    tokenManager.saveHospitalInfo(hospital._id, name, logoUrl)

                    }
                } else {
                    // API failed - keep existing cached data
                }
            } catch (e: Exception) {
                // Error - keep existing cached data
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
                searchDebounceJob?.cancel()
                val search = query?.trim()
                if (!search.isNullOrEmpty()) {
                    patientViewModel.getPatients(search = search)
                } else {
                    patientViewModel.getPatients()
                }
                binding.searchView.clearFocus()
                return true
            }
            override fun onQueryTextChange(newText: String?): Boolean {
                searchDebounceJob?.cancel()
                searchDebounceJob = lifecycleScope.launch {
                    delay(350)
                    val search = newText?.trim()
                    if (!search.isNullOrEmpty()) {
                        patientViewModel.getPatients(search = search)
                    } else {
                        patientViewModel.getPatients()
                    }
                }
                return true
            }
        })
    }
}
