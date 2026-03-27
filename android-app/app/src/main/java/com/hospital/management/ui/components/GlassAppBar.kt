package com.hospital.management.ui.components

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.google.android.material.appbar.AppBarLayout
import com.hospital.management.R

/**
 * A glass-styled app bar — transparent background with optional blur that
 * intensifies on scroll. Contains title, optional subtitle, and back arrow.
 */
class GlassAppBar @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : FrameLayout(context, attrs, defStyleAttr) {

    val titleView: TextView
    val subtitleView: TextView
    val backButton: ImageButton
    private val glassDrawable: GradientDrawable

    var title: CharSequence
        get() = titleView.text
        set(value) { titleView.text = value }

    var subtitle: CharSequence
        get() = subtitleView.text
        set(value) {
            subtitleView.text = value
            subtitleView.visibility = if (value.isBlank()) GONE else VISIBLE
        }

    init {
        val res = context.resources
        val horizontalPadding = res.getDimensionPixelSize(R.dimen.space_base)
        val verticalPadding = res.getDimensionPixelSize(R.dimen.space_md)

        // Glass background drawable
        glassDrawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(ContextCompat.getColor(context, R.color.color_glass_fill))
            setStroke(
                res.getDimensionPixelSize(R.dimen.glass_stroke_width),
                ContextCompat.getColor(context, R.color.color_glass_stroke)
            )
        }
        background = glassDrawable

        // Back button
        backButton = ImageButton(context).apply {
            setImageResource(R.drawable.ic_arrow_back)
            imageTintList = ContextCompat.getColorStateList(context, R.color.color_on_surface)
            setBackgroundResource(android.R.color.transparent)
            val size = (44 * res.displayMetrics.density).toInt()
            val padding = (10 * res.displayMetrics.density).toInt()
            setPadding(padding, padding, padding, padding)
            layoutParams = LinearLayout.LayoutParams(size, size).apply {
                gravity = Gravity.CENTER_VERTICAL
            }
        }

        // Title
        titleView = TextView(context).apply {
            setTextColor(ContextCompat.getColor(context, R.color.color_on_surface))
            textSize = 20f  // text_title: 20sp
            typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)
            letterSpacing = -0.01f
            maxLines = 1
            ellipsize = android.text.TextUtils.TruncateAt.END
        }

        // Subtitle
        subtitleView = TextView(context).apply {
            setTextColor(ContextCompat.getColor(context, R.color.color_on_surface_muted))
            textSize = 12f  // text_caption: 12sp
            visibility = GONE
        }

        // Layout structure
        val titleContainer = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_VERTICAL
            val lp = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
            lp.marginStart = (8 * res.displayMetrics.density).toInt()
            addView(titleView, lp)
            addView(subtitleView, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                marginStart = (8 * res.displayMetrics.density).toInt()
            })
        }

        val row = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(horizontalPadding, verticalPadding, horizontalPadding, verticalPadding)
            addView(backButton)
            addView(titleContainer, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        }

        addView(row, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.WRAP_CONTENT))

        // Minimum toolbar height
        minimumHeight = (56 * res.displayMetrics.density).toInt()
    }

    /**
     * Call this from an AppBarLayout.OnOffsetChangedListener to increase
     * glass opacity as the user scrolls.
     */
    fun onScrollOffset(scrollFraction: Float) {
        // Increase alpha from base to fully opaque
        val baseAlpha = 0.7f
        val alpha = baseAlpha + (1f - baseAlpha) * scrollFraction.coerceIn(0f, 1f)
        glassDrawable.alpha = (alpha * 255).toInt()
    }
}
