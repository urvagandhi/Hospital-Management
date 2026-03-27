package com.hospital.management.ui.base

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.AuthInterceptor
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.launch

/**
 * Base activity that all activities should extend.
 * Sets up edge-to-edge display and status bar icon theming.
 * Automatically applies status bar top padding to avoid overlap.
 * Handles SESSION_REVOKED broadcasts for single-device enforcement.
 */
open class BaseActivity : AppCompatActivity() {

    /** Set to true in subclass onCreate (before super) to skip auto inset padding */
    protected var skipAutoInsets = false

    /** Override in auth screens (Login, Splash, etc.) to skip session revocation handling */
    open val isAuthScreen: Boolean = false

    private var sessionRevokedReceiver: BroadcastReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Set status bar icon color based on theme
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        val isDarkMode = (resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES

        // Light mode = dark icons, dark mode = light icons
        insetsController.isAppearanceLightStatusBars = !isDarkMode
        insetsController.isAppearanceLightNavigationBars = !isDarkMode

        // Register session revoked receiver for all non-auth screens
        if (!isAuthScreen) {
            sessionRevokedReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    runOnUiThread {
                        Toast.makeText(
                            this@BaseActivity,
                            "You were logged out because you signed in on another device.",
                            Toast.LENGTH_LONG
                        ).show()
                        lifecycleScope.launch {
                            SessionManager.logoutUser(this@BaseActivity)
                        }
                    }
                }
            }
            registerReceiver(
                sessionRevokedReceiver,
                IntentFilter(AuthInterceptor.ACTION_SESSION_REVOKED),
                Context.RECEIVER_NOT_EXPORTED
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        sessionRevokedReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
    }

    override fun setContentView(layoutResID: Int) {
        super.setContentView(layoutResID)
        applyAutoInsets()
    }

    override fun setContentView(view: View?) {
        super.setContentView(view)
        applyAutoInsets()
    }

    override fun setContentView(view: View?, params: ViewGroup.LayoutParams?) {
        super.setContentView(view, params)
        applyAutoInsets()
    }

    private fun applyAutoInsets() {
        if (skipAutoInsets) return

        // Find a layoutTopSection if it exists (for activities that wrap their top content)
        val topSection = findViewById<View>(com.hospital.management.R.id.layoutTopSection)
        if (topSection != null) {
            applyStatusBarInsets(topSection)
        } else {
            // Fallback: apply padding to the root content view
            val rootView = findViewById<View>(android.R.id.content)
            if (rootView != null) {
                applyStatusBarInsets(rootView)
            }
        }
    }

    /**
     * Apply top padding for status bar insets to the given view.
     */
    protected fun applyStatusBarInsets(view: View) {
        ViewCompat.setOnApplyWindowInsetsListener(view) { v, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.statusBars())
            v.updatePadding(top = insets.top)
            windowInsets
        }
    }
}
