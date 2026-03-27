package com.hospital.management.ui.components

import android.content.Context
import android.content.res.Configuration
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.Shader
import android.util.AttributeSet
import android.view.View
import androidx.core.content.ContextCompat
import com.hospital.management.R

/**
 * Draws two soft radial gradient blobs that give the glassmorphism
 * cards something to "blur through". Add as the first child of every
 * screen's root ConstraintLayout with match_parent dimensions.
 *
 * Light: primary @ 8% top-right, accent @ 6% bottom-left
 * Dark:  primary @ 15% top-right, accent @ 10% bottom-left
 */
class GradientBlobBackground @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : View(context, attrs, defStyleAttr) {

    private val paintBlob1 = Paint(Paint.ANTI_ALIAS_FLAG)
    private val paintBlob2 = Paint(Paint.ANTI_ALIAS_FLAG)

    override fun onSizeChanged(w: Int, h: Int, oldw: Int, oldh: Int) {
        super.onSizeChanged(w, h, oldw, oldh)
        if (w == 0 || h == 0) return
        setupGradients(w, h)
    }

    private fun setupGradients(w: Int, h: Int) {
        val blobPrimary = ContextCompat.getColor(context, R.color.color_blob_primary)
        val blobAccent = ContextCompat.getColor(context, R.color.color_blob_accent)

        val density = resources.displayMetrics.density
        val radius1 = 300f * density
        val radius2 = 250f * density

        // Blob 1: top-right
        paintBlob1.shader = RadialGradient(
            w * 0.85f, h * 0.1f, radius1,
            blobPrimary, 0x00000000,
            Shader.TileMode.CLAMP
        )

        // Blob 2: bottom-left
        paintBlob2.shader = RadialGradient(
            w * 0.15f, h * 0.85f, radius2,
            blobAccent, 0x00000000,
            Shader.TileMode.CLAMP
        )
    }

    override fun onDraw(canvas: Canvas) {
        super.onDraw(canvas)
        val w = width.toFloat()
        val h = height.toFloat()
        if (w == 0f || h == 0f) return

        canvas.drawRect(0f, 0f, w, h, paintBlob1)
        canvas.drawRect(0f, 0f, w, h, paintBlob2)
    }

    override fun onConfigurationChanged(newConfig: Configuration?) {
        super.onConfigurationChanged(newConfig)
        if (width > 0 && height > 0) {
            setupGradients(width, height)
            invalidate()
        }
    }
}
