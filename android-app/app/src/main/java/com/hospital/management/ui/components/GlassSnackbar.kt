package com.hospital.management.ui.components

import android.app.Activity
import android.graphics.drawable.GradientDrawable
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.hospital.management.R

/**
 * Custom glass-styled snackbar that floats above the bottom nav.
 * Replaces Android default Snackbar and Toast throughout the app.
 */
object GlassSnackbar {

    enum class Variant { SUCCESS, ERROR, INFO }

    fun show(
        activity: Activity,
        message: String,
        variant: Variant = Variant.INFO,
        actionText: String? = null,
        onAction: (() -> Unit)? = null,
        durationMs: Long = 3000L
    ) {
        val context = activity
        val res = context.resources
        val density = res.displayMetrics.density
        val rootView = activity.findViewById<ViewGroup>(android.R.id.content)

        // Remove any existing snackbar
        rootView.findViewWithTag<View>("glass_snackbar")?.let {
            rootView.removeView(it)
        }

        val accentColor = when (variant) {
            Variant.SUCCESS -> ContextCompat.getColor(context, R.color.brand_success)
            Variant.ERROR -> ContextCompat.getColor(context, R.color.brand_destructive)
            Variant.INFO -> ContextCompat.getColor(context, R.color.brand_primary)
        }

        val iconRes = when (variant) {
            Variant.SUCCESS -> android.R.drawable.ic_dialog_info
            Variant.ERROR -> android.R.drawable.ic_dialog_alert
            Variant.INFO -> android.R.drawable.ic_dialog_info
        }

        // Build the snackbar view
        val container = LinearLayout(context).apply {
            tag = "glass_snackbar"
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            val hPad = (16 * density).toInt()
            val vPad = (12 * density).toInt()
            setPadding(hPad, vPad, hPad, vPad)

            // Glass background with accent left border
            val bg = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(ContextCompat.getColor(context, R.color.color_glass_fill))
                setStroke(
                    (1 * density).toInt(),
                    ContextCompat.getColor(context, R.color.color_glass_stroke)
                )
                cornerRadius = res.getDimension(R.dimen.radius_lg)
            }
            background = bg
            elevation = 8 * density
        }

        // Left accent bar
        val accentBar = View(context).apply {
            setBackgroundColor(accentColor)
            layoutParams = LinearLayout.LayoutParams(
                (3 * density).toInt(),
                (32 * density).toInt()
            ).apply {
                marginEnd = (12 * density).toInt()
            }
        }

        // Icon
        val icon = ImageView(context).apply {
            setImageResource(iconRes)
            setColorFilter(accentColor)
            layoutParams = LinearLayout.LayoutParams(
                (20 * density).toInt(),
                (20 * density).toInt()
            ).apply {
                marginEnd = (10 * density).toInt()
            }
        }

        // Message
        val text = TextView(context).apply {
            this.text = message
            setTextColor(ContextCompat.getColor(context, R.color.color_on_surface))
            textSize = 14f
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }

        container.addView(accentBar)
        container.addView(icon)
        container.addView(text)

        // Optional action button
        if (actionText != null) {
            val actionBtn = TextView(context).apply {
                this.text = actionText
                setTextColor(accentColor)
                textSize = 14f
                typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
                val pad = (8 * density).toInt()
                setPadding(pad, pad, pad, pad)
                isClickable = true
                isFocusable = true
                setOnClickListener {
                    onAction?.invoke()
                    rootView.removeView(container)
                }
            }
            container.addView(actionBtn)
        }

        // Position above bottom nav
        val lp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
            val hMargin = (24 * density).toInt()
            val bMargin = (80 * density).toInt()  // above bottom nav
            setMargins(hMargin, 0, hMargin, bMargin)
        }

        rootView.addView(container, lp)

        // Animate in
        container.alpha = 0f
        container.translationY = 16 * density
        container.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(200)
            .start()

        // Auto-dismiss
        container.postDelayed({
            container.animate()
                .alpha(0f)
                .translationY(16 * density)
                .setDuration(200)
                .withEndAction { rootView.removeView(container) }
                .start()
        }, durationMs)
    }
}
