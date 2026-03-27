package com.hospital.management.ui.base

import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding

/**
 * Base activity that all activities should extend.
 * Sets up edge-to-edge display and status bar icon theming.
 * Automatically applies status bar top padding to avoid overlap.
 */
open class BaseActivity : AppCompatActivity() {

    /** Set to true in subclass onCreate (before super) to skip auto inset padding */
    protected var skipAutoInsets = false

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
