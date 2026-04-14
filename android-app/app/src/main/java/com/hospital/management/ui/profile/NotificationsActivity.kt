package com.hospital.management.ui.profile

import android.content.Context
import android.os.Bundle
import com.hospital.management.databinding.ActivityNotificationsBinding
import com.hospital.management.ui.base.BaseActivity

/**
 * Notifications preferences stub (Task #28).
 *
 * Stores toggles locally in SharedPreferences. A future release will wire
 * these preferences to a server-side endpoint so they roam with the account.
 * Kept separate so we can swap persistence without touching the UI.
 */
class NotificationsActivity : BaseActivity() {

    private lateinit var binding: ActivityNotificationsBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityNotificationsBinding.inflate(layoutInflater)
        setContentView(binding.root)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        title = "Notifications"

        val prefs = getSharedPreferences("notif_prefs", Context.MODE_PRIVATE)
        binding.switchSessionAlerts.isChecked = prefs.getBoolean("session_alerts", true)
        binding.switchSecurityAlerts.isChecked = prefs.getBoolean("security_alerts", true)

        binding.switchSessionAlerts.setOnCheckedChangeListener { _, v ->
            prefs.edit().putBoolean("session_alerts", v).apply()
        }
        binding.switchSecurityAlerts.setOnCheckedChangeListener { _, v ->
            prefs.edit().putBoolean("security_alerts", v).apply()
        }
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }
}
