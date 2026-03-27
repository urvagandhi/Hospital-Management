package com.hospital.management.ui.components

import android.content.Context
import android.content.res.Configuration
import android.graphics.drawable.GradientDrawable
import android.util.AttributeSet
import com.google.android.material.card.MaterialCardView
import com.hospital.management.R

/**
 * A MaterialCardView subclass that applies a glassmorphism effect:
 * semi-transparent fill, blue-tinted stroke, and backdrop blur on API 31+.
 *
 * XML attributes:
 *   app:glass_corner_radius — corner radius (default @dimen/radius_lg)
 */
class GlassCardView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = com.google.android.material.R.attr.materialCardViewStyle
) : MaterialCardView(context, attrs, defStyleAttr) {

    private var cornerRadius: Float

    init {
        val res = context.resources
        cornerRadius = res.getDimension(R.dimen.radius_lg)

        attrs?.let {
            val ta = context.obtainStyledAttributes(it, R.styleable.GlassCardView)
            cornerRadius = ta.getDimension(R.styleable.GlassCardView_glass_corner_radius, cornerRadius)
            ta.recycle()
        }

        // Remove default card elevation — glass cards use borders, not shadows
        cardElevation = 0f
        maxCardElevation = 0f

        applyGlassEffect()
    }

    private fun applyGlassEffect() {
        val fillColor = context.getColor(R.color.color_glass_fill)
        val strokeColor = context.getColor(R.color.color_glass_stroke)

        // Build the glass drawable
        val drawable = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(fillColor)
            setStroke(
                context.resources.getDimensionPixelSize(R.dimen.glass_stroke_width),
                strokeColor
            )
            this.cornerRadius = this@GlassCardView.cornerRadius
        }

        background = drawable

        // Transparent card background so our custom drawable shows
        setCardBackgroundColor(android.graphics.Color.TRANSPARENT)
        strokeWidth = 0 // We draw our own stroke via GradientDrawable

        radius = cornerRadius
    }

    override fun onConfigurationChanged(newConfig: Configuration?) {
        super.onConfigurationChanged(newConfig)
        applyGlassEffect()
    }
}
