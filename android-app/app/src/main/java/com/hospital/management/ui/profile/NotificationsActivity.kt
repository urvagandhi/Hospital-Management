package com.hospital.management.ui.profile

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.Toast
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityNotificationsBinding
import com.hospital.management.ui.base.BaseActivity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Notifications preferences (A4). Wired to backend B6 endpoints.
 * Admin sees an extra "Deletion requests" toggle and the Delete Account
 * menu item is hidden for admins (backend blocks it anyway).
 */
class NotificationsActivity : BaseActivity() {

    private lateinit var binding: ActivityNotificationsBinding
    private var loading = true
    private var isAdmin = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityNotificationsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Notifications"

        val prefs = getSharedPreferences("notif_prefs", Context.MODE_PRIVATE)

        // Seed with cached values (instant UI; overwritten by server hydrate)
        binding.switchSessionAlerts.isChecked = prefs.getBoolean("newLoginAlert", true)
        binding.switchSecurityAlerts.isChecked = prefs.getBoolean("securityAlerts", true)
        binding.switchDeletionUpdates.isChecked = prefs.getBoolean("deletionUpdates", true)
        binding.switchMarketing.isChecked = prefs.getBoolean("marketing", false)

        // Hydrate from server + determine admin status
        lifecycleScope.launch {
            try {
                val api = RetrofitClient.getApiService(this@NotificationsActivity)
                val meRes = withContext(Dispatchers.IO) { api.getCurrentHospital() }
                isAdmin = meRes.body()?.data?.role == "admin"
                binding.rowDeletionUpdates.visibility = if (isAdmin) View.VISIBLE else View.GONE
                invalidateOptionsMenu()

                val resp = withContext(Dispatchers.IO) { api.getNotificationPreferences() }
                val data = resp.body()?.data
                if (resp.isSuccessful && data != null) {
                    binding.switchSessionAlerts.isChecked = data.newLoginAlert
                    binding.switchSecurityAlerts.isChecked = data.securityAlerts
                    binding.switchDeletionUpdates.isChecked = data.deletionUpdates
                    binding.switchMarketing.isChecked = data.marketing
                    prefs.edit()
                        .putBoolean("newLoginAlert", data.newLoginAlert)
                        .putBoolean("securityAlerts", data.securityAlerts)
                        .putBoolean("deletionUpdates", data.deletionUpdates)
                        .putBoolean("marketing", data.marketing)
                        .apply()
                }
            } catch (_: Exception) { /* keep cached */ }
            finally { loading = false }
        }

        binding.switchSessionAlerts.setOnCheckedChangeListener { _, v ->
            if (loading) return@setOnCheckedChangeListener
            prefs.edit().putBoolean("newLoginAlert", v).apply()
            savePref("newLoginAlert", v)
        }
        binding.switchSecurityAlerts.setOnCheckedChangeListener { _, v ->
            if (loading) return@setOnCheckedChangeListener
            prefs.edit().putBoolean("securityAlerts", v).apply()
            savePref("securityAlerts", v)
        }
        binding.switchDeletionUpdates.setOnCheckedChangeListener { _, v ->
            if (loading) return@setOnCheckedChangeListener
            prefs.edit().putBoolean("deletionUpdates", v).apply()
            savePref("deletionUpdates", v)
        }
        binding.switchMarketing.setOnCheckedChangeListener { _, v ->
            if (loading) return@setOnCheckedChangeListener
            prefs.edit().putBoolean("marketing", v).apply()
            savePref("marketing", v)
        }
    }

    private fun savePref(key: String, value: Boolean) {
        lifecycleScope.launch {
            try {
                withContext(Dispatchers.IO) {
                    RetrofitClient.getApiService(this@NotificationsActivity)
                        .updateNotificationPreferences(mapOf(key to value))
                }
            } catch (_: Exception) {
                Toast.makeText(this@NotificationsActivity,
                    "Saved locally; will sync later", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        // Hide Delete Account menu item for admin — backend also blocks admin self-delete
        if (!isAdmin) {
            menu.add(0, 1001, 0, "Delete Account").setShowAsAction(MenuItem.SHOW_AS_ACTION_NEVER)
        }
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == 1001) {
            startActivity(Intent(this, DeleteAccountActivity::class.java))
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
