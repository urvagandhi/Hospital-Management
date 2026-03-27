package com.hospital.management.utils

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import java.io.File
import java.io.FileOutputStream
import java.io.ByteArrayOutputStream

object ImageUtils {

    private const val MAX_FILE_SIZE = 10 * 1024 * 1024 // 10 MB
    private const val MAX_DIMENSION = 2048

    fun compressImage(context: Context, imageUri: Uri): File? {
        try {
            // First pass: get dimensions without loading bitmap
            val options = BitmapFactory.Options().apply {
                inJustDecodeBounds = true
            }
            context.contentResolver.openInputStream(imageUri)?.use {
                BitmapFactory.decodeStream(it, null, options)
            }

            if (options.outWidth <= 0 || options.outHeight <= 0) return null

            // Calculate sample size to reduce memory usage
            var sampleSize = 1
            while (options.outWidth / sampleSize > MAX_DIMENSION ||
                   options.outHeight / sampleSize > MAX_DIMENSION) {
                sampleSize *= 2
            }

            // Second pass: decode with sample size
            val loadOptions = BitmapFactory.Options().apply {
                inSampleSize = sampleSize
            }
            val inputStream = context.contentResolver.openInputStream(imageUri)
            val originalBitmap = BitmapFactory.decodeStream(inputStream, null, loadOptions)
            inputStream?.close()

            if (originalBitmap == null) return null

            var quality = 90
            var stream = ByteArrayOutputStream()
            originalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)

            while (stream.toByteArray().size > MAX_FILE_SIZE && quality > 10) {
                stream.reset()
                quality -= 5
                originalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            }

            val fileName = "compressed_${System.currentTimeMillis()}.jpg"
            val file = File(context.cacheDir, fileName)
            val fileOutputStream = FileOutputStream(file)
            fileOutputStream.write(stream.toByteArray())
            fileOutputStream.flush()
            fileOutputStream.close()

            originalBitmap.recycle()
            return file
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }
}
