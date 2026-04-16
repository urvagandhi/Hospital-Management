package com.hospital.management.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.ColorMatrix
import android.graphics.ColorMatrixColorFilter
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.graphics.pdf.PdfRenderer
import android.net.Uri
import android.util.Log
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import kotlin.math.roundToInt

object PdfUtils {

    private const val TAG = "PdfUtils"
    private const val A4_WIDTH = 1240
    private const val A4_HEIGHT = 1754
    private const val MAX_UPLOAD_BYTES = 20L * 1024L * 1024L
    private const val TARGET_HEADROOM_BYTES = 2L * 1024L * 1024L
    private const val MIN_TARGET_PDF_BYTES = 2L * 1024L * 1024L
    private const val TARGET_PER_PAGE_BYTES = 900L * 1024L

    private data class CompressionProfile(
        val pageWidth: Int,
        val pageHeight: Int,
        val maxSourceDimension: Int,
        val maxBitmapWidth: Int,
        val jpegQuality: Int,
        val grayscale: Boolean
    )

    private val compressionProfiles = listOf(
        // Preferred profile: readable medical docs around 150 DPI.
        CompressionProfile(
            pageWidth = A4_WIDTH,
            pageHeight = A4_HEIGHT,
            maxSourceDimension = 2200,
            maxBitmapWidth = 1240,
            jpegQuality = 88,
            grayscale = false
        ),
        // Fallback profile when source pages are still too large.
        CompressionProfile(
            pageWidth = A4_WIDTH,
            pageHeight = A4_HEIGHT,
            maxSourceDimension = 1900,
            maxBitmapWidth = 1160,
            jpegQuality = 82,
            grayscale = false
        ),
        // Last resort profile to keep uploads comfortably below backend limits.
        CompressionProfile(
            pageWidth = A4_WIDTH,
            pageHeight = A4_HEIGHT,
            maxSourceDimension = 1700,
            maxBitmapWidth = 1040,
            jpegQuality = 76,
            grayscale = false
        ),
        // Nuclear profile for extreme high-res scans.
        CompressionProfile(
            pageWidth = A4_WIDTH,
            pageHeight = A4_HEIGHT,
            maxSourceDimension = 1400,
            maxBitmapWidth = 900,
            jpegQuality = 70,
            grayscale = true
        )
    )
    private const val WHITE_THRESHOLD = 200

    /**
     * Convert multiple images to a single compressed PDF.
     */
    fun createPdfFromImages(
        context: Context,
        imageUris: List<Uri>,
        outputFileName: String = "document_${System.currentTimeMillis()}.pdf"
    ): File? {
        if (imageUris.isEmpty()) return null

        val safeFileName = ensurePdfExtension(outputFileName)
        val outputFile = File(context.filesDir, safeFileName)
        val targetPdfBytes = getTargetPdfBytes(pageCount = imageUris.size)

        for (profile in compressionProfiles) {
            outputFile.delete()
            val wrote = writeCompressedPdf(
                outputFile = outputFile,
                pageCount = imageUris.size,
                profile = profile
            ) { pageIndex, p ->
                val source = loadBitmap(
                    context,
                    imageUris[pageIndex],
                    p.maxSourceDimension,
                    p.maxBitmapWidth
                ) ?: return@writeCompressedPdf null
                var working: Bitmap? = source
                try {
                    working = trimWhiteBorders(working!!)
                    val normalized = normalizeForPdf(working, p)
                    if (normalized !== working) {
                        working?.recycle()
                    }
                    normalized
                } catch (_: Exception) {
                    null
                } finally {
                    if (working != null && working !== source && !source.isRecycled) {
                        source.recycle()
                    }
                }
            }

            if (!wrote || !outputFile.exists()) {
                Log.d(TAG, "${profile.pageWidth}px q${profile.jpegQuality}: write_failed")
                continue
            }

            Log.d(
                TAG,
                "${profile.pageWidth}px q${profile.jpegQuality}: ${outputFile.length() / 1024}KB target=${targetPdfBytes / 1024}KB"
            )
            if (outputFile.length() <= targetPdfBytes || profile == compressionProfiles.last()) {
                return outputFile
            }
        }

        if (outputFile.exists()) {
            return outputFile
        }
        return null
    }

    /**
     * Rebuild scanner-provided PDFs into a compressed PDF when only a PDF URI is available.
     */
    fun recompressPdfFromUri(
        context: Context,
        pdfUri: Uri,
        outputFileName: String = "document_${System.currentTimeMillis()}.pdf"
    ): File? {
        val safeFileName = ensurePdfExtension(outputFileName)
        val outputFile = File(context.filesDir, safeFileName)

        val descriptor = context.contentResolver.openFileDescriptor(pdfUri, "r") ?: return null
        descriptor.use {
            val renderer = PdfRenderer(it)
            renderer.use { pdfRenderer ->
                if (pdfRenderer.pageCount <= 0) return null
                val targetPdfBytes = getTargetPdfBytes(pageCount = pdfRenderer.pageCount)

                for (profile in compressionProfiles) {
                    outputFile.delete()
                    val wrote = writeCompressedPdf(
                        outputFile = outputFile,
                        pageCount = pdfRenderer.pageCount,
                        profile = profile
                    ) { pageIndex, p ->
                        pdfRenderer.openPage(pageIndex).use { page ->
                            val rendered = renderPdfPage(page, p)
                            normalizeForPdf(rendered, p)
                        }
                    }

                    if (!wrote || !outputFile.exists()) {
                        Log.d(TAG, "${profile.pageWidth}px q${profile.jpegQuality}: write_failed")
                        continue
                    }

                    Log.d(
                        TAG,
                        "${profile.pageWidth}px q${profile.jpegQuality}: ${outputFile.length() / 1024}KB target=${targetPdfBytes / 1024}KB"
                    )
                    if (outputFile.length() <= targetPdfBytes || profile == compressionProfiles.last()) {
                        return outputFile
                    }
                }
            }
        }

        if (outputFile.exists()) {
            return outputFile
        }
        return null
    }

    private inline fun writeCompressedPdf(
        outputFile: File,
        pageCount: Int,
        profile: CompressionProfile,
        pageBitmapProvider: (Int, CompressionProfile) -> Bitmap?
    ): Boolean {
        val pdfDocument = PdfDocument()
        try {
            for (index in 0 until pageCount) {
                val bitmap = pageBitmapProvider(index, profile)
                if (bitmap == null) {
                    outputFile.delete()
                    return false
                }
                try {
                    val pageInfo = PdfDocument.PageInfo.Builder(
                        profile.pageWidth,
                        profile.pageHeight,
                        index + 1
                    ).create()
                    val page = pdfDocument.startPage(pageInfo)
                    val canvas: Canvas = page.canvas
                    canvas.drawColor(Color.WHITE)

                    val scaledBitmap = Bitmap.createScaledBitmap(
                        bitmap,
                        pageInfo.pageWidth,
                        pageInfo.pageHeight,
                        true
                    )
                    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
                    canvas.drawBitmap(scaledBitmap, 0f, 0f, paint)
                    pdfDocument.finishPage(page)

                    if (scaledBitmap !== bitmap && !scaledBitmap.isRecycled) {
                        scaledBitmap.recycle()
                    }
                } finally {
                    if (!bitmap.isRecycled) {
                        bitmap.recycle()
                    }
                }
            }

            FileOutputStream(outputFile).use { outputStream ->
                pdfDocument.writeTo(outputStream)
            }
            return true
        } catch (_: Exception) {
            outputFile.delete()
            return false
        } finally {
            pdfDocument.close()
        }
    }

    private fun renderPdfPage(page: PdfRenderer.Page, profile: CompressionProfile): Bitmap {
        val targetWidth = profile.maxBitmapWidth
        val targetHeight = maxOf(1, ((targetWidth.toFloat() / page.width) * page.height).roundToInt())
        val bitmap = Bitmap.createBitmap(targetWidth, targetHeight, Bitmap.Config.ARGB_8888)
        bitmap.eraseColor(Color.WHITE)
        page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_PRINT)
        return bitmap
    }

    /**
     * Load bitmap from URI with controlled downsampling to avoid memory spikes.
     */
    private fun loadBitmap(
        context: Context,
        uri: Uri,
        maxSourceDimension: Int,
        maxBitmapWidth: Int
    ): Bitmap? {
        try {
            val boundsOptions = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, boundsOptions)
            }

            var sampleSize = 1
            while (
                boundsOptions.outWidth / sampleSize > maxSourceDimension ||
                boundsOptions.outHeight / sampleSize > maxSourceDimension
            ) {
                sampleSize *= 2
            }

            val loadOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.ARGB_8888
                inDither = true
            }

            context.contentResolver.openInputStream(uri)?.use { input ->
                val decoded = BitmapFactory.decodeStream(input, null, loadOptions) ?: return null
                val hardCapWidth = maxOf(1, maxBitmapWidth)

                // Hard cap after decode so sampling artifacts don't leak oversized bitmaps.
                return if (decoded.width > hardCapWidth) {
                    val ratio = hardCapWidth.toFloat() / decoded.width
                    val scaledHeight = maxOf(1, (decoded.height * ratio).roundToInt())
                    Bitmap.createScaledBitmap(decoded, hardCapWidth, scaledHeight, true)
                        .also { if (it !== decoded) decoded.recycle() }
                } else {
                    decoded
                }
            }
            return null
        } catch (_: IOException) {
            return null
        } catch (_: SecurityException) {
            return null
        }
    }

    private fun normalizeForPdf(bitmap: Bitmap, profile: CompressionProfile): Bitmap {
        var working = scaleBitmapToWidth(bitmap, profile.maxBitmapWidth)

        if (profile.grayscale) {
            val gray = toGrayscale(working)
            if (gray !== working && working !== bitmap && !working.isRecycled) {
                working.recycle()
            }
            working = gray
        }

        val jpegBaked = reencodeJpeg(working, profile.jpegQuality)
        if (jpegBaked !== working && working !== bitmap && !working.isRecycled) {
            working.recycle()
        }

        return jpegBaked
    }

    private fun reencodeJpeg(bitmap: Bitmap, quality: Int): Bitmap {
        val stream = java.io.ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        val bytes = stream.toByteArray()
        stream.close()
        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.RGB_565
            inDither = true
        }
        return BitmapFactory.decodeByteArray(bytes, 0, bytes.size, options) ?: bitmap
    }

    private fun toGrayscale(bitmap: Bitmap): Bitmap {
        val output = Bitmap.createBitmap(bitmap.width, bitmap.height, Bitmap.Config.RGB_565)
        val canvas = Canvas(output)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG)
        val colorMatrix = ColorMatrix().apply { setSaturation(0f) }
        paint.colorFilter = ColorMatrixColorFilter(colorMatrix)
        canvas.drawBitmap(bitmap, 0f, 0f, paint)
        return output
    }

    private fun trimWhiteBorders(bitmap: Bitmap): Bitmap {
        val width = bitmap.width
        val height = bitmap.height
        if (width < 3 || height < 3) return bitmap

        var left = 0
        var right = width - 1
        var top = 0
        var bottom = height - 1

        while (left < width && isWhiteColumn(bitmap, left)) left++
        while (right >= 0 && isWhiteColumn(bitmap, right)) right--
        while (top < height && isWhiteRow(bitmap, top)) top++
        while (bottom >= 0 && isWhiteRow(bitmap, bottom)) bottom--

        if (left >= right || top >= bottom) return bitmap

        val pad = 4
        val cropLeft = maxOf(0, left - pad)
        val cropTop = maxOf(0, top - pad)
        val cropRight = minOf(width - 1, right + pad)
        val cropBottom = minOf(height - 1, bottom + pad)

        if (cropLeft == 0 && cropTop == 0 && cropRight == width - 1 && cropBottom == height - 1) {
            return bitmap
        }

        return Bitmap.createBitmap(
            bitmap,
            cropLeft,
            cropTop,
            cropRight - cropLeft + 1,
            cropBottom - cropTop + 1,
        )
    }

    private fun isWhiteColumn(bitmap: Bitmap, x: Int): Boolean {
        val step = maxOf(1, bitmap.height / 100)
        var y = 0
        while (y < bitmap.height) {
            if (!isNearWhite(bitmap.getPixel(x, y))) return false
            y += step
        }
        return true
    }

    private fun isWhiteRow(bitmap: Bitmap, y: Int): Boolean {
        val step = maxOf(1, bitmap.width / 100)
        var x = 0
        while (x < bitmap.width) {
            if (!isNearWhite(bitmap.getPixel(x, y))) return false
            x += step
        }
        return true
    }

    private fun isNearWhite(pixel: Int): Boolean {
        return Color.red(pixel) >= WHITE_THRESHOLD &&
            Color.green(pixel) >= WHITE_THRESHOLD &&
            Color.blue(pixel) >= WHITE_THRESHOLD
    }

    private fun getTargetPdfBytes(pageCount: Int): Long {
        val clampedPages = pageCount.coerceAtLeast(1).toLong()
        val maxTargetBytes = (MAX_UPLOAD_BYTES - TARGET_HEADROOM_BYTES)
            .coerceAtLeast(MIN_TARGET_PDF_BYTES)
        val calculatedTarget = clampedPages * TARGET_PER_PAGE_BYTES
        return calculatedTarget.coerceIn(MIN_TARGET_PDF_BYTES, maxTargetBytes)
    }

    private fun scaleBitmapToWidth(bitmap: Bitmap, targetWidth: Int): Bitmap {
        if (bitmap.width == targetWidth) return bitmap
        val ratio = targetWidth.toFloat() / bitmap.width
        val newHeight = maxOf(1, (bitmap.height * ratio).roundToInt())
        return Bitmap.createScaledBitmap(bitmap, targetWidth, newHeight, true)
    }

    private fun ensurePdfExtension(outputFileName: String): String {
        return if (outputFileName.lowercase().endsWith(".pdf")) outputFileName else "$outputFileName.pdf"
    }
}
