package com.hospital.management.ui.profile

import android.os.Bundle
import android.view.View
import androidx.appcompat.app.AlertDialog
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.repository.AuthRepository
import com.hospital.management.data.repository.ProfileRepository
import com.hospital.management.databinding.ActivitySessionsBinding
import com.hospital.management.presentation.viewmodel.ProfileEvent
import com.hospital.management.presentation.viewmodel.ProfileViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.ui.components.GlassSnackbar
import kotlinx.coroutines.launch

/**
 * Active sessions screen (Task #28). Lists every session tied to the
 * logged-in hospital; the user can revoke individual non-current sessions
 * or kick all other devices at once.
 */
class SessionsActivity : BaseActivity() {

    private lateinit var binding: ActivitySessionsBinding
    private lateinit var vm: ProfileViewModel
    private lateinit var adapter: SessionsAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivitySessionsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Active Sessions"

        val tokenManager = TokenManager(this)
        val apiService = RetrofitClient.getApiService(this)
        val authRepo = AuthRepository(apiService, tokenManager)
        val profileRepo = ProfileRepository(apiService)
        val factory = ViewModelFactory(authRepository = authRepo, profileRepository = profileRepo)
        vm = ViewModelProvider(this, factory)[ProfileViewModel::class.java]

        adapter = SessionsAdapter(onRevoke = { id ->
            if (id.isNullOrBlank()) {
                GlassSnackbar.show(this, "Session ID missing. Please refresh and try again.", GlassSnackbar.Variant.ERROR)
            } else {
                confirmRevoke(id)
            }
        })
        binding.rvSessions.layoutManager = LinearLayoutManager(this)
        binding.rvSessions.adapter = adapter

        binding.btnRevokeAll.setOnClickListener {
            AlertDialog.Builder(this)
                .setTitle("Sign out all other devices?")
                .setMessage("Your current session will stay signed in.")
                .setPositiveButton("Sign out others") { _, _ -> vm.revokeAllOthers() }
                .setNegativeButton("Cancel", null)
                .show()
        }

        observe()
        vm.loadSessions()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    private fun confirmRevoke(id: String) {
        AlertDialog.Builder(this)
            .setTitle("Revoke this session?")
            .setMessage("The device will be signed out immediately.")
            .setPositiveButton("Revoke") { _, _ -> vm.revokeSession(id) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun observe() {
        lifecycleScope.launch {
            vm.event.collect { state ->
                when (state) {
                    is ProfileEvent.Loading -> binding.loadingOverlay.visibility = View.VISIBLE
                    is ProfileEvent.SessionsLoaded -> {
                        binding.loadingOverlay.visibility = View.GONE
                        adapter.submit(state.sessions)
                        binding.tvEmpty.visibility = if (state.sessions.isEmpty()) View.VISIBLE else View.GONE
                    }
                    is ProfileEvent.Error -> {
                        binding.loadingOverlay.visibility = View.GONE
                        GlassSnackbar.show(this@SessionsActivity, state.message, GlassSnackbar.Variant.ERROR)
                        vm.reset()
                    }
                    else -> binding.loadingOverlay.visibility = View.GONE
                }
            }
        }
    }
}
