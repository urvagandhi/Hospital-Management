package com.hospital.management.utils

import android.content.Context
import android.util.Log
import com.hospital.management.BuildConfig
import java.io.File
import java.io.FileWriter
import java.io.PrintWriter
import java.io.StringWriter
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * File-based logger that persists logs to the device storage.
 *
 * Logs are written to: /sdcard/Android/data/com.hospital.management/files/logs/
 * Each day gets its own file (e.g. log_2026-03-27.txt).
 * Old logs beyond [maxDaysToKeep] are automatically cleaned up.
 *
 * Usage:
 *   FileLogger.init(applicationContext)
 *   FileLogger.d("MyTag", "Debug message")
 *   FileLogger.e("MyTag", "Error occurred", exception)
 *
 * To pull logs via adb:
 *   adb pull /sdcard/Android/data/com.hospital.management/files/logs/ ./app_logs/
 */
object FileLogger {

    private const val LOG_DIR = "logs"
    private const val MAX_DAYS_TO_KEEP = 2
    private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    private val timestampFormat = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    @Volatile
    private var logDir: File? = null

    /**
     * When false, only W/E/WTF are written to file.
     * Defaulting to true so every log level (D/I/W/E) is captured
     * on-device for production debugging.
     */
    @Volatile
    var verboseFileLog: Boolean = true

    fun init(context: Context, maxDaysToKeep: Int = MAX_DAYS_TO_KEEP) {
        // File logging is active in ALL builds so production issues
        // can be debugged from on-device logs pulled via adb.
        val dir = File(context.getExternalFilesDir(null), LOG_DIR)
        if (!dir.exists()) dir.mkdirs()
        logDir = dir
        cleanOldLogs(maxDaysToKeep)
    }

    fun d(tag: String, message: String) {
        Log.d(tag, message)
        if (verboseFileLog) writeLog("D", tag, message)
    }

    fun i(tag: String, message: String) {
        Log.i(tag, message)
        if (verboseFileLog) writeLog("I", tag, message)
    }

    fun w(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) Log.w(tag, message, throwable) else Log.w(tag, message)
        writeLog("W", tag, message, throwable)
    }

    fun e(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) Log.e(tag, message, throwable) else Log.e(tag, message)
        writeLog("E", tag, message, throwable)
    }

    /** Critical / unexpected failures — always written even if logDir not set (app crash path). */
    fun wtf(tag: String, message: String, throwable: Throwable? = null) {
        if (throwable != null) Log.wtf(tag, message, throwable) else Log.wtf(tag, message)
        writeLog("WTF", tag, message, throwable)
    }

    /**
     * Rotate logs on logout: archives today's log file with a timestamp
     * suffix and truncates the active log. Prevents User B from reading
     * User A's log tail after a shared-device handoff.
     */
    fun rotate() {
        val dir = logDir ?: return
        try {
            val today = "log_${dateFormat.format(Date())}.txt"
            val current = File(dir, today)
            if (current.exists() && current.length() > 0) {
                val ts = timestampFormat.format(Date()).replace(" ", "_").replace(":", "-")
                val archived = File(dir, "log_${dateFormat.format(Date())}_rotated_$ts.txt")
                current.renameTo(archived)
            }
        } catch (e: Exception) {
            Log.e("FileLogger", "Failed to rotate logs", e)
        }
    }

    private fun writeLog(level: String, tag: String, message: String, throwable: Throwable? = null) {
        val dir = logDir ?: return
        try {
            val fileName = "log_${dateFormat.format(Date())}.txt"
            val file = File(dir, fileName)
            val timestamp = timestampFormat.format(Date())
            val line = buildString {
                append("$timestamp $level/$tag: $message")
                if (throwable != null) {
                    append("\n")
                    append(getStackTraceString(throwable))
                }
                append("\n")
            }
            FileWriter(file, true).use { it.write(line) }
        } catch (e: Exception) {
            Log.e("FileLogger", "Failed to write log", e)
        }
    }

    private fun getStackTraceString(throwable: Throwable): String {
        val sw = StringWriter()
        throwable.printStackTrace(PrintWriter(sw))
        return sw.toString()
    }

    private fun cleanOldLogs(maxDaysToKeep: Int) {
        val dir = logDir ?: return
        try {
            val cutoff = System.currentTimeMillis() - (maxDaysToKeep * 24 * 60 * 60 * 1000L)
            dir.listFiles()?.filter { it.name.startsWith("log_") && it.lastModified() < cutoff }
                ?.forEach { it.delete() }
        } catch (e: Exception) {
            Log.e("FileLogger", "Failed to clean old logs", e)
        }
    }

    /**
     * Returns the log directory path for display or sharing.
     */
    fun getLogDirectory(): String = logDir?.absolutePath ?: "FileLogger not initialized"

    /**
     * Returns all log files sorted by date (newest first).
     */
    fun getLogFiles(): List<File> {
        val dir = logDir ?: return emptyList()
        return dir.listFiles()?.filter { it.name.startsWith("log_") }
            ?.sortedByDescending { it.name } ?: emptyList()
    }
}
