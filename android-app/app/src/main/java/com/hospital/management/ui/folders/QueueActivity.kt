package com.hospital.management.ui.folders

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.work.*
import com.hospital.management.R
import com.hospital.management.data.local.AppDatabase
import com.hospital.management.data.local.SyncStatus
import com.hospital.management.data.local.TokenManager
import com.hospital.management.data.models.FileItem
import com.hospital.management.databinding.ActivityQueueBinding
import com.hospital.management.ui.base.BaseActivity
import com.hospital.management.worker.SyncDocumentsWorker
import com.hospital.management.worker.UploadWorker
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import java.util.concurrent.TimeUnit

class QueueActivity : BaseActivity() {
    private lateinit var binding: ActivityQueueBinding
    private lateinit var tokenManager: TokenManager
    private lateinit var fileAdapter: FileAdapter
    private val database by lazy { AppDatabase.getDatabase(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityQueueBinding.inflate(layoutInflater)
        setContentView(binding.root)

        setSupportActionBar(binding.toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        binding.toolbar.setNavigationOnClickListener { finish() }

        tokenManager = TokenManager(this)
        setupRecyclerView()
        observeQueue()

        binding.btnSyncNow.setOnClickListener { startManualSync() }
        binding.swipeRefresh.setOnRefreshListener {
            binding.swipeRefresh.isRefreshing = false
        }
    }

    private fun setupRecyclerView() {
        binding.rvQueue.layoutManager = LinearLayoutManager(this)
    }

    private fun observeQueue() {
        lifecycleScope.launch {
            val hospitalId = tokenManager.getHospitalId() ?: ""
            database.documentDao().observeHospitalQueue(hospitalId).collect { docs ->
                // Phase 6: Sorting: UPLOADING -> PENDING -> FAILED
                val sortedDocs = docs.sortedWith(compareBy<com.hospital.management.data.local.OfflineDocument> {
                    when (it.status) {
                        SyncStatus.UPLOADING -> 0
                        SyncStatus.PENDING -> 1
                        SyncStatus.FAILED -> 2
                        else -> 3
                    }
                }.thenByDescending { it.timestamp })

                val fileItems = sortedDocs.map { doc ->
                    val localFile = File(Uri.parse(doc.fileUri).path ?: "")
                    val fileSize = if (localFile.exists()) localFile.length() else 0L
                    val fileName = localFile.name
                    val mimeType = if (fileName.endsWith(".pdf")) "application/pdf" else "image/jpeg"
                    
                    val statusPrefix = when (doc.status) {
                        SyncStatus.FAILED -> "[Failed] "
                        SyncStatus.UPLOADING -> "[Uploading] "
                        else -> "[Pending] "
                    }
                    
                    FileItem(
                        fileName = "$statusPrefix$fileName",
                        fileUrl = doc.fileUri,
                        size = fileSize,
                        mimeType = mimeType,
                        uploadedAt = SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.getDefault()).format(Date(doc.timestamp)),
                        syncStatus = doc.status.name,
                        errorMessage = doc.errorMessage,
                        idempotencyKey = doc.idempotencyKey
                    )
                }

                updateUI(fileItems)
            }
        }
    }

    private fun updateUI(files: List<FileItem>) {
        if (files.isEmpty()) {
            binding.rvQueue.visibility = View.GONE
            binding.layoutEmpty.visibility = View.VISIBLE
            binding.tvQueueSummary.text = "All documents have been synced"
            binding.btnSyncNow.isEnabled = false
        } else {
            binding.rvQueue.visibility = View.VISIBLE
            binding.layoutEmpty.visibility = View.GONE
            binding.tvQueueSummary.text = "${files.size} file(s) waiting to sync"
            binding.btnSyncNow.isEnabled = true
            
            fileAdapter = FileAdapter(files,
                onFileClick = { file -> openWithChooser(file) },
                onOptionClick = { view, file -> showFileOptions(view, file) },
                onRetryClick = { file -> retryUpload(file) }
            )
            binding.rvQueue.adapter = fileAdapter
        }
    }

    private fun openWithChooser(file: FileItem) {
        val fileUrl = file.displayUrl
        if (fileUrl.isEmpty()) return

        try {
            val localFile = if (fileUrl.startsWith("file://")) File(Uri.parse(fileUrl).path ?: "") else File(fileUrl)
            val uri = androidx.core.content.FileProvider.getUriForFile(this, "${packageName}.provider", localFile)
            val intent = Intent(Intent.ACTION_VIEW).apply {
                setDataAndType(uri, "application/pdf")
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            }
            startActivity(Intent.createChooser(intent, "Open with"))
        } catch (e: Exception) {
            Toast.makeText(this, "No app available to open this file", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showFileOptions(view: View, file: FileItem) {
        val popup = androidx.appcompat.widget.PopupMenu(this, view)
        
        // Phase 6.2: Status-aware actions
        popup.menu.add("Open")
        
        if (file.syncStatus == SyncStatus.FAILED.name || file.syncStatus == SyncStatus.PENDING.name) {
            popup.menu.add("Retry Now")
        }
        
        popup.menu.add("Delete from Queue")
        
        popup.setOnMenuItemClickListener { item ->
            when (item.title) {
                "Open" -> openWithChooser(file)
                "Retry Now" -> retryUpload(file)
                "Delete from Queue" -> confirmDelete(file)
            }
            true
        }
        popup.show()
    }

    private fun confirmDelete(file: FileItem) {
        androidx.appcompat.app.AlertDialog.Builder(this)
            .setTitle("Remove from queue?")
            .setMessage("This will permanently delete the scan from your device.")
            .setPositiveButton("Delete") { _, _ -> deleteDocument(file) }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun deleteDocument(file: FileItem) {
        val key = file.idempotencyKey ?: return
        lifecycleScope.launch(kotlinx.coroutines.Dispatchers.IO) {
            val doc = database.documentDao().getDocumentByIdempotencyKey(key)
            if (doc != null) {
                // Pair cleanup: DB and File
                database.documentDao().delete(doc)
                val localFile = File(Uri.parse(doc.fileUri).path ?: "")
                if (localFile.exists()) localFile.delete()
            }
        }
    }

    private fun retryUpload(file: FileItem) {
        val key = file.idempotencyKey ?: return
        lifecycleScope.launch {
            val doc = database.documentDao().getDocumentByIdempotencyKey(key)
            if (doc != null) {
                database.documentDao().update(doc.copy(status = SyncStatus.PENDING))
                enqueueUpload(doc)
            }
        }
    }

    private fun enqueueUpload(doc: com.hospital.management.data.local.OfflineDocument) {
        val inputData = Data.Builder()
            .putLong(UploadWorker.KEY_OFFLINE_DOC_ID, doc.id)
            .putString(UploadWorker.KEY_IDEMPOTENCY_KEY, doc.idempotencyKey)
            .putString(UploadWorker.KEY_OWNER_HOSPITAL_ID, doc.ownerHospitalId)
            .build()

        val request = OneTimeWorkRequestBuilder<UploadWorker>()
            .setInputData(inputData)
            .addTag(UploadWorker.TAG_UPLOAD)
            .build()

        WorkManager.getInstance(this).enqueueUniqueWork(
            "upload_${doc.idempotencyKey}",
            ExistingWorkPolicy.KEEP,
            request
        )
    }

    private fun startManualSync() {
        val request = OneTimeWorkRequestBuilder<SyncDocumentsWorker>().build()
        WorkManager.getInstance(this).enqueueUniqueWork(
            "auto_sync_documents",
            ExistingWorkPolicy.KEEP,
            request
        )
        Toast.makeText(this, "Sync started...", Toast.LENGTH_SHORT).show()
    }
}
