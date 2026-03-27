package com.hospital.management.ui.components

import android.content.Context
import android.graphics.drawable.GradientDrawable
import android.text.Editable
import android.text.InputFilter
import android.text.InputType
import android.text.TextWatcher
import android.util.AttributeSet
import android.view.Gravity
import android.view.KeyEvent
import android.view.inputmethod.InputMethodManager
import android.widget.EditText
import android.widget.LinearLayout
import androidx.core.content.ContextCompat
import com.hospital.management.R

/**
 * Custom OTP input: 6 individual glass-styled boxes, each holding one digit.
 * Primary-colored bottom border when focused. Matches glassmorphism design system.
 */
class OtpInputView @JvmOverloads constructor(
    context: Context,
    attrs: AttributeSet? = null,
    defStyleAttr: Int = 0
) : LinearLayout(context, attrs, defStyleAttr) {

    private val boxes = mutableListOf<EditText>()
    private val digitCount = 6
    var onOtpComplete: ((String) -> Unit)? = null

    init {
        orientation = HORIZONTAL
        gravity = Gravity.CENTER
        val density = resources.displayMetrics.density
        val boxWidth = (48 * density).toInt()
        val boxHeight = (56 * density).toInt()
        val gap = (8 * density).toInt()

        for (i in 0 until digitCount) {
            val editText = EditText(context).apply {
                layoutParams = LayoutParams(boxWidth, boxHeight).apply {
                    if (i < digitCount - 1) marginEnd = gap
                }
                gravity = Gravity.CENTER
                textSize = 24f  // text_display scale for single char
                setTextColor(ContextCompat.getColor(context, R.color.color_on_surface))
                inputType = InputType.TYPE_CLASS_NUMBER
                filters = arrayOf(InputFilter.LengthFilter(1))
                isCursorVisible = false
                background = createBoxBackground(false)
                typeface = android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.BOLD)

                setOnFocusChangeListener { _, hasFocus ->
                    this.background = createBoxBackground(hasFocus)
                }

                addTextChangedListener(object : TextWatcher {
                    override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
                    override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
                    override fun afterTextChanged(s: Editable?) {
                        if (s?.length == 1 && i < digitCount - 1) {
                            boxes[i + 1].requestFocus()
                        }
                        checkComplete()
                    }
                })

                setOnKeyListener { _, keyCode, event ->
                    if (keyCode == KeyEvent.KEYCODE_DEL && event.action == KeyEvent.ACTION_DOWN) {
                        if (text.isEmpty() && i > 0) {
                            boxes[i - 1].apply {
                                requestFocus()
                                setText("")
                            }
                            return@setOnKeyListener true
                        }
                    }
                    false
                }
            }
            boxes.add(editText)
            addView(editText)
        }
    }

    private fun createBoxBackground(focused: Boolean): GradientDrawable {
        val density = resources.displayMetrics.density
        return GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            setColor(ContextCompat.getColor(context, R.color.color_glass_fill))
            cornerRadius = resources.getDimension(R.dimen.radius_md)
            if (focused) {
                setStroke(
                    (1.5f * density).toInt(),
                    ContextCompat.getColor(context, R.color.brand_primary)
                )
            } else {
                setStroke(
                    (1 * density).toInt(),
                    ContextCompat.getColor(context, R.color.color_glass_stroke)
                )
            }
        }
    }

    private fun checkComplete() {
        val otp = getOtp()
        if (otp.length == digitCount) {
            onOtpComplete?.invoke(otp)
        }
    }

    fun getOtp(): String = boxes.joinToString("") { it.text.toString() }

    fun clear() {
        boxes.forEach { it.setText("") }
        boxes.firstOrNull()?.requestFocus()
    }

    fun showError() {
        val errorColor = ContextCompat.getColor(context, R.color.brand_destructive)
        val density = resources.displayMetrics.density
        boxes.forEach { box ->
            box.background = GradientDrawable().apply {
                shape = GradientDrawable.RECTANGLE
                setColor(ContextCompat.getColor(context, R.color.color_glass_fill))
                cornerRadius = resources.getDimension(R.dimen.radius_md)
                setStroke((1.5f * density).toInt(), errorColor)
            }
        }
    }

    fun focusFirstBox() {
        boxes.firstOrNull()?.apply {
            requestFocus()
            val imm = context.getSystemService(Context.INPUT_METHOD_SERVICE) as InputMethodManager
            imm.showSoftInput(this, InputMethodManager.SHOW_IMPLICIT)
        }
    }
}
