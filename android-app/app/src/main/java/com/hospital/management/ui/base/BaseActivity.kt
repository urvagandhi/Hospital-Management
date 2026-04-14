package com.hospital.management.ui.base

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.text.InputFilter
import android.text.InputType
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.api.AuthInterceptor
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.utils.SessionManager
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Base activity that all activities should extend.
 * Sets up edge-to-edge display and status bar icon theming.
 * Automatically applies status bar top padding to avoid overlap.
 * Handles SESSION_REVOKED + AUTH_CODE_REQUIRED broadcasts.
 */
open class BaseActivity : AppCompatActivity() {

    /** Set to true in subclass onCreate (before super) to skip auto inset padding */
    protected var skipAutoInsets = false

    /** Override in auth screens (Login, Splash, etc.) to skip session revocation handling */
    open val isAuthScreen: Boolean = false

    private var sessionRevokedReceiver: BroadcastReceiver? = null
    private var authCodeRequiredReceiver: BroadcastReceiver? = null

    // Process-wide guard: we only want ONE reverify dialog visible at any
    // time, even if multiple concurrent 401s all fire the broadcast.
    companion object {
        @Volatile private var reverifyDialogShowing = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Enable edge-to-edge
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Set status bar icon color based on theme
        val insetsController = WindowInsetsControllerCompat(window, window.decorView)
        val isDarkMode = (resources.configuration.uiMode and
                android.content.res.Configuration.UI_MODE_NIGHT_MASK) ==
                android.content.res.Configuration.UI_MODE_NIGHT_YES

        insetsController.isAppearanceLightStatusBars = !isDarkMode
        insetsController.isAppearanceLightNavigationBars = !isDarkMode

        // Register broadcast receivers for all non-auth screens
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

            authCodeRequiredReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    runOnUiThread { showAuthCodeReverifyDialog() }
                }
            }
            registerReceiver(
                authCodeRequiredReceiver,
                IntentFilter(AuthInterceptor.ACTION_AUTH_CODE_REQUIRED),
                Context.RECEIVER_NOT_EXPORTED
            )
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        sessionRevokedReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
        authCodeRequiredReceiver?.let {
            try { unregisterReceiver(it) } catch (_: Exception) {}
        }
    }

    /**
     * Blocking dialog that asks the user for the 6-digit Auth Code so we can
     * bump the session's 7-day freshness window without forcing a full
     * re-login. Called when the server returns 401 code=AUTH_CODE_REQUIRED.
     */
    private fun showAuthCodeReverifyDialog() {
        if (reverifyDialogShowing) return
        if (isFinishing || isDestroyed) return
        reverifyDialogShowing = true

        val padding = (resources.displayMetrics.density * 16).toInt()
        val input = EditText(this).apply {
            inputType = InputType.TYPE_CLASS_NUMBER
            hint = "6-digit Auth Code"
            filters = arrayOf(InputFilter.LengthFilter(6))
            setPadding(padding, padding, padding, padding)
        }
        val container = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, 0, padding, 0)
            addView(
                input,
                LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            )
        }

        val dialog = AlertDialog.Builder(this)
            .setTitle("Re-verify your Auth Code")
            .setMessage(
                "For your security, please re-enter your hospital's 6-digit " +
                "Auth Code. You'll stay signed in for another 7 days."
            )
            .setView(container)
            .setCancelable(false)
            .setPositiveButton("Verify", null) // overridden below so Verify doesn't auto-dismiss
            .setNegativeButton("Sign Out") { _, _ ->
                reverifyDialogShowing = false
                lifecycleScope.launch {
                    SessionManager.logoutUser(this@BaseActivity)
                }
            }
            .create()

        dialog.setOnShowListener {
            val btn = dialog.getButton(AlertDialog.BUTTON_POSITIVE)
            btn.setOnClickListener {
                val code = input.text?.toString()?.trim().orEmpty()
                if (!code.matches(Regex("^\\d{6}$"))) {
                    input.error = "Enter a 6-digit code"
                    return@setOnClickListener
                }
                btn.isEnabled = false
                input.isEnabled = false
                performReverify(code) { success, message ->
                    runOnUiThread {
                        if (success) {
                            reverifyDialogShowing = false
                            dialog.dismiss()
                            Toast.makeText(
                                this@BaseActivity,
                                "Verified. You're good for another 7 days.",
                                Toast.LENGTH_SHORT
                            ).show()
                        } else {
                            btn.isEnabled = true
                            input.isEnabled = true
                            input.text?.clear()
                            input.error = message ?: "Invalid code"
                        }
                    }
                }
            }
        }

        // Soft keyboard up automatically
        dialog.window?.setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE)
        dialog.show()
    }

    private fun performReverify(code: String, done: (Boolean, String?) -> Unit) {
        lifecycleScope.launch {
            try {
                val api = RetrofitClient.getApiService(this@BaseActivity)
                val res = withContext(Dispatchers.IO) {
                    api.reverifyAuthCode(mapOf("authCode" to code))
                }
                if (res.isSuccessful && res.body()?.get("success") == true) {
                    done(true, null)
                } else {
                    val msg = (res.body()?.get("message") as? String)
                        ?: "Invalid Auth Code. Please try again."
                    done(false, msg)
                }
            } catch (e: Exception) {
                done(false, "Network error: ${e.message}")
            }
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

        val topSection = findViewById<View>(com.hospital.management.R.id.layoutTopSection)
        if (topSection != null) {
            applyStatusBarInsets(topSection)
        } else {
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
