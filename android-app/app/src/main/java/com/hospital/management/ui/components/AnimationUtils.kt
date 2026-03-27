package com.hospital.management.ui.components

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.view.MotionEvent
import android.view.View
import android.view.animation.DecelerateInterpolator
import androidx.recyclerview.widget.RecyclerView

/**
 * Design system animation utilities — fast, physical, intentional.
 */
object DesignAnimations {

    /**
     * Attach press-scale animation to any view.
     * Scales to 0.96 on press, springs back on release.
     */
    fun attachPressScale(view: View) {
        view.setOnTouchListener { v, event ->
            when (event.action) {
                MotionEvent.ACTION_DOWN -> {
                    v.animate()
                        .scaleX(0.96f)
                        .scaleY(0.96f)
                        .setDuration(80)
                        .setInterpolator(DecelerateInterpolator())
                        .start()
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    v.animate()
                        .scaleX(1f)
                        .scaleY(1f)
                        .setDuration(120)
                        .setInterpolator(DecelerateInterpolator())
                        .start()
                }
            }
            false // Don't consume — let click listeners still work
        }
    }

    /**
     * Animate a view appearing: alpha 0→1, translationY 16dp→0.
     * Use staggerDelay for list items (30ms between each).
     */
    fun animateCardAppear(view: View, staggerIndex: Int = 0) {
        val density = view.resources.displayMetrics.density
        view.alpha = 0f
        view.translationY = 16f * density

        view.animate()
            .alpha(1f)
            .translationY(0f)
            .setDuration(200)
            .setStartDelay(staggerIndex * 30L)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    /**
     * Animate a group of views with stagger.
     */
    fun animateStagger(vararg views: View) {
        views.forEachIndexed { index, view ->
            animateCardAppear(view, index)
        }
    }

    /**
     * Fade-in for fragment/view transitions.
     */
    fun fadeIn(view: View, duration: Long = 200) {
        view.alpha = 0f
        view.animate()
            .alpha(1f)
            .setDuration(duration)
            .setInterpolator(DecelerateInterpolator())
            .start()
    }

    /**
     * RecyclerView item animator that applies card-appear animation.
     * Call from adapter's onBindViewHolder.
     */
    fun animateListItem(holder: RecyclerView.ViewHolder) {
        animateCardAppear(holder.itemView, holder.bindingAdapterPosition)
    }
}
