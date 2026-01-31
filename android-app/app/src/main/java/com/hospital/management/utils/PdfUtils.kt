package com.hospital.management.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.net.Uri
import java.io.File
import java.io.FileOutputStream

object PdfUtils {

    // A4 page dimensions at 72 DPI (standard PDF)
    private const val A4_WIDTH = 595
    private const val A4_HEIGHT = 842

    /**
     * Convert multiple images to a single compressed PDF
     * @param context Application context
     * @param imageUris List of image URIs to convert
     * @param outputFileName Name for the output PDF file
     * @return File object pointing to the created PDF, or null on failure
     */
    fun createPdfFromImages(
        context: Context,
        imageUris: List<Uri>,
        outputFileName: String = "document_${System.currentTimeMillis()}.pdf"
    ): File? {
        if (imageUris.isEmpty()) return null

        val pdfDocument = PdfDocument()
        
        try {
            for ((index, uri) in imageUris.withIndex()) {
                // Load and compress the bitmap
                val bitmap = loadAndCompressBitmap(context, uri) ?: continue
                
                // Calculate page dimensions to maintain aspect ratio
                val pageInfo = calculatePageDimensions(bitmap, index + 1)
                val page = pdfDocument.startPage(pageInfo)
                
                // Draw the bitmap on the page
                val canvas: Canvas = page.canvas
                canvas.drawColor(Color.WHITE) // White background
                
                // Calculate scaled dimensions to fit the page
                val scaledBitmap = scaleBitmapToFitPage(bitmap, pageInfo.pageWidth, pageInfo.pageHeight)
                
                // Center the image on the page
                val left = (pageInfo.pageWidth - scaledBitmap.width) / 2f
                val top = (pageInfo.pageHeight - scaledBitmap.height) / 2f
                
                canvas.drawBitmap(scaledBitmap, left, top, Paint(Paint.ANTI_ALIAS_FLAG))
                
                pdfDocument.finishPage(page)
                
                // Recycle bitmaps to free memory
                if (scaledBitmap != bitmap) {
                    scaledBitmap.recycle()
                }
                bitmap.recycle()
            }
            
            // Save PDF to file
            val outputFile = File(context.filesDir, outputFileName)
            FileOutputStream(outputFile).use { outputStream ->
                pdfDocument.writeTo(outputStream)
            }
            
            pdfDocument.close()
            return outputFile
            
        } catch (e: Exception) {
            e.printStackTrace()
            pdfDocument.close()
            return null
        }
    }

    /**
     * Load a bitmap from URI and compress it for optimal PDF size
     */
    private fun loadAndCompressBitmap(context: Context, uri: Uri): Bitmap? {
        try {
            // First, get image dimensions without loading full bitmap
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }

            // Calculate sample size to reduce memory usage
            val maxDimension = 2000 // Max dimension for PDF quality
            var sampleSize = 1
            while (options.outWidth / sampleSize > maxDimension || 
                   options.outHeight / sampleSize > maxDimension) {
                sampleSize *= 2
            }

            // Load the bitmap with sample size
            val loadOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
                inPreferredConfig = Bitmap.Config.RGB_565 // Use less memory
            }
            
            val inputStream = context.contentResolver.openInputStream(uri)
            val bitmap = BitmapFactory.decodeStream(inputStream, null, loadOptions)
            inputStream?.close()
            
            return bitmap
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }

    /**
     * Calculate page dimensions based on image aspect ratio
     */
    private fun calculatePageDimensions(bitmap: Bitmap, pageNumber: Int): PdfDocument.PageInfo {
        val imageAspectRatio = bitmap.width.toFloat() / bitmap.height.toFloat()
        val a4AspectRatio = A4_WIDTH.toFloat() / A4_HEIGHT.toFloat()
        
        val pageWidth: Int
        val pageHeight: Int
        
        if (imageAspectRatio > a4AspectRatio) {
            // Image is wider than A4 - use landscape orientation
            pageWidth = A4_HEIGHT
            pageHeight = A4_WIDTH
        } else {
            // Image is taller or similar to A4 - use portrait orientation
            pageWidth = A4_WIDTH
            pageHeight = A4_HEIGHT
        }
        
        return PdfDocument.PageInfo.Builder(pageWidth, pageHeight, pageNumber).create()
    }

    /**
     * Scale bitmap to fit within page dimensions while maintaining aspect ratio
     */
    private fun scaleBitmapToFitPage(bitmap: Bitmap, pageWidth: Int, pageHeight: Int): Bitmap {
        val margin = 20 // Small margin around the image
        val maxWidth = pageWidth - (margin * 2)
        val maxHeight = pageHeight - (margin * 2)
        
        val widthRatio = maxWidth.toFloat() / bitmap.width
        val heightRatio = maxHeight.toFloat() / bitmap.height
        val scaleFactor = minOf(widthRatio, heightRatio)
        
        if (scaleFactor >= 1f) {
            // Image is smaller than page, no need to scale
            return bitmap
        }
        
        val newWidth = (bitmap.width * scaleFactor).toInt()
        val newHeight = (bitmap.height * scaleFactor).toInt()
        
        return Bitmap.createScaledBitmap(bitmap, newWidth, newHeight, true)
    }
}
