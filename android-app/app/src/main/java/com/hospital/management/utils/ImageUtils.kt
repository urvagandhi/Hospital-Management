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

    fun compressImage(context: Context, imageUri: Uri): File? {
        try {
            val inputStream = context.contentResolver.openInputStream(imageUri)
            val originalBitmap = BitmapFactory.decodeStream(inputStream)
            inputStream?.close()

            if (originalBitmap == null) return null

            var quality = 100
            var stream = ByteArrayOutputStream()
            originalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)

            while (stream.toByteArray().size > MAX_FILE_SIZE && quality > 10) {
                stream.reset()
                quality -= 5
                originalBitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
            }

            // Create a temp file
            val fileName = "compressed_${System.currentTimeMillis()}.jpg"
            val file = File(context.cacheDir, fileName)
            val fileOutputStream = FileOutputStream(file)
            fileOutputStream.write(stream.toByteArray())
            fileOutputStream.flush()
            fileOutputStream.close()
            
            return file
        } catch (e: Exception) {
            e.printStackTrace()
            return null
        }
    }
}
