package com.hospital.management.ui.folders

import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import android.content.Intent
import android.os.Bundle
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.ui.base.BaseActivity
import androidx.lifecycle.lifecycleScope
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import androidx.lifecycle.ViewModelProvider
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import com.hospital.management.data.models.Folder
import android.content.ContentValues
import android.provider.MediaStore
import android.text.InputType
import android.view.Gravity
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import com.hospital.management.worker.DownloadWorker
import com.hospital.management.utils.DownloadErrorMapper
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class FolderViewActivity : BaseActivity() {

    override fun isShowingCachedData(): Boolean =
        ::patientViewModel.isInitialized && patientViewModel.currentPatient.value != null

    private lateinit var patientViewModel: PatientViewModel
    private lateinit var rvFolders: RecyclerView
    private lateinit var folderAdapter: FolderAdapter
    private lateinit var progressBar: View
    private lateinit var tvEmpty: View
    private lateinit var tokenManager: TokenManager

    private var patientId: String = ""
    private var patientName: String = ""
    private var hospitalName: String = ""
    private var isDownloading = false
    private val completedUploadWorkIds = mutableSetOf<java.util.UUID>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_folder_view)

        tokenManager = TokenManager(this)
        setupViewModel()

        // Get patient info from intent
        patientId = intent.getStringExtra("PATIENT_ID") ?: ""
        patientName = intent.getStringExtra("PATIENT_NAME") ?: "Patient"

        // Fetch hospital name for download folder hierarchy
        lifecycleScope.launch {
            hospitalName = tokenManager.getHospitalName() ?: "Hospital"
        }

        setupViews()
        setupObservers()
        setupUploadObserver()
        loadFolders()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(
            apiService, tokenManager,
            com.hospital.management.data.local.AppDatabase.getDatabase(this).patientCacheDao()
        )
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupViews() {
        findViewById<View>(R.id.btnBack).setOnClickListener { finish() }

        // Initialize views
        rvFolders = findViewById(R.id.rvFolders)
        progressBar = findViewById(R.id.progressBar)
        tvEmpty = findViewById(R.id.tvEmpty)
        val tvPatientName = findViewById<android.widget.TextView>(R.id.tvPatientName)

        // Set initial data (might be empty initially)
        tvPatientName.text = patientName

        // Set initials (first letter of first name + first letter of last name)
        val parts = patientName.trim().split("\\s+".toRegex())
        val initials = when {
            parts.size >= 2 -> "${parts.first().first()}${parts.last().first()}".uppercase()
            parts.isNotEmpty() && parts[0].isNotEmpty() -> parts[0].first().toString().uppercase()
            else -> "?"
        }
        findViewById<android.widget.TextView>(R.id.tvPatientInitials).text = initials

        rvFolders.layoutManager = GridLayoutManager(this, 2)

        // Edit Button Logic
        findViewById<View>(R.id.btnEditPatient).setOnClickListener {
            val currentPatient = patientViewModel.currentPatient.value
            if (currentPatient != null && currentPatient._id == patientId) {
                showEditPatientDialog(currentPatient)
            } else {
                Toast.makeText(this, "Patient data not fully loaded yet", Toast.LENGTH_SHORT).show()
            }
        }

        // FAB for download all
        findViewById<View>(R.id.fabDownloadAll).setOnClickListener {
            showDownloadOptionsDialog()
        }

        // FAB for create folder
        findViewById<View>(R.id.fabCreateFolder)?.setOnClickListener {
            showCreateFolderDialog()
        }

        findViewById<com.hospital.management.ui.components.WorkProgressBanner>(R.id.workProgressBanner)
            ?.observe(this)
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> progressBar.visibility = View.VISIBLE
                    is PatientState.Success -> {
                        progressBar.visibility = View.GONE
                        if (state.message?.isNotEmpty() == true && state.message != "Patient loaded" && state.message != "Files loaded") {
                             Toast.makeText(this@FolderViewActivity, state.message, Toast.LENGTH_SHORT).show()
                        }
                    }
                    is PatientState.Error -> {
                        progressBar.visibility = View.GONE
                        val msg = state.message
                        if (msg.contains("duplicate key error")) {
                            showErrorDialog("Update Failed", "An error occurred while updating the patient.")
                        } else if (isNetworkAvailable()) {
                            Toast.makeText(this@FolderViewActivity, msg, Toast.LENGTH_SHORT).show()
                        }
                        // Offline with no cache: folders list stays empty/hidden silently
                    }
                    else -> progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            val db = com.hospital.management.data.local.AppDatabase.getDatabase(this@FolderViewActivity)
            val hospitalId = tokenManager.getHospitalId() ?: ""
            kotlinx.coroutines.flow.combine(
                patientViewModel.currentPatient,
                db.documentDao().observePatientQueue(patientId, hospitalId)
            ) { patient, pendingDocs ->
                Pair(patient, pendingDocs)
            }.collect { (patient, pendingDocs) ->
                if (patient != null && patient._id == patientId) {
                    // Update UI with patient details
                    findViewById<android.widget.TextView>(R.id.tvPatientName).text = patient.patientName
                    findViewById<android.widget.TextView>(R.id.tvPatientId)?.text = patient.patientId

                    // Remarks row — show only when non-empty, matching web behaviour
                    val remarksText = patient.remarks?.trim().orEmpty()
                    val layoutRemarks = findViewById<View>(R.id.layoutRemarks)
                    val tvRemarks = findViewById<android.widget.TextView>(R.id.tvPatientRemarks)
                    if (remarksText.isNotEmpty()) {
                        tvRemarks.text = remarksText
                        layoutRemarks.visibility = View.VISIBLE
                    } else {
                        layoutRemarks.visibility = View.GONE
                    }

                    // Create a map of folder name -> pending count
                    val pendingCounts = mutableMapOf<String, Int>()
                    for (doc in pendingDocs) {
                        pendingCounts[doc.folderName] = (pendingCounts[doc.folderName] ?: 0) + 1
                    }

                    val folders = patient.folders
                    if (folders.isNotEmpty() || pendingCounts.isNotEmpty()) {
                        // Create folder list with updated counts
                        val updatedFolders = folders.map { folder ->
                            val pendingCount = pendingCounts[folder.name] ?: 0
                            com.hospital.management.data.models.Folder(
                                name = folder.name,
                                files = folder.files,
                                _fileCount = folder.fileCount + pendingCount
                            )
                        }

                        folderAdapter = FolderAdapter(updatedFolders) { folder ->
                            // Navigate to folder details
                            val intent = Intent(this@FolderViewActivity, FolderDetailsActivity::class.java)
                            intent.putExtra("PATIENT_ID", patientId)
                            intent.putExtra("FOLDER_NAME", folder.name)
                            intent.putExtra("FILE_COUNT", folder.fileCount)
                            intent.putExtra("PATIENT_NAME", patient.patientName)
                            intent.putExtra("PATIENT_DISPLAY_ID", patient.patientId)
                            startActivity(intent)
                        }
                        rvFolders.adapter = folderAdapter
                        rvFolders.visibility = View.VISIBLE
                        tvEmpty.visibility = View.GONE
                    } else {
                        rvFolders.visibility = View.GONE
                        tvEmpty.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private fun setupUploadObserver() {
        WorkManager.getInstance(this)
            .getWorkInfosByTagLiveData(com.hospital.management.worker.UploadWorker.TAG_UPLOAD)
            .observe(this) { workInfos ->
                var shouldRefresh = false
                workInfos?.forEach { workInfo ->
                    if (workInfo.state == WorkInfo.State.SUCCEEDED) {
                        if (completedUploadWorkIds.add(workInfo.id)) {
                            shouldRefresh = true
                        }
                    }
                }
                if (shouldRefresh) {
                    loadFolders()
                }
            }
    }

    private fun showEditPatientDialog(patient: com.hospital.management.data.models.Patient) {
        val dp = resources.displayMetrics.density
        val pad = (24 * dp).toInt()
        val fieldSpacing = (16 * dp).toInt()

        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(pad, (20 * dp).toInt(), pad, (8 * dp).toInt())
        }

        // Avatar header
        val headerLayout = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, 0, 0, fieldSpacing)
        }
        val avatarFrame = FrameLayout(this).apply {
            val size = (48 * dp).toInt()
            layoutParams = android.widget.LinearLayout.LayoutParams(size, size)
        }
        val avatarBg = View(this).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
            setBackgroundResource(R.drawable.bg_stat_card_icon)
        }
        val avatarIcon = ImageView(this).apply {
            val iconSize = (24 * dp).toInt()
            layoutParams = FrameLayout.LayoutParams(iconSize, iconSize, Gravity.CENTER)
            setImageResource(R.drawable.ic_people)
            setColorFilter(resources.getColor(R.color.brand_primary, theme))
        }
        avatarFrame.addView(avatarBg)
        avatarFrame.addView(avatarIcon)
        headerLayout.addView(avatarFrame)

        val headerText = android.widget.TextView(this).apply {
            text = patient.patientName
            textSize = 18f
            setTextColor(resources.getColor(R.color.color_on_surface, theme))
            typeface = resources.getFont(R.font.inter_semibold)
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.marginStart = (12 * dp).toInt()
            layoutParams = lp
        }
        headerLayout.addView(headerText)
        container.addView(headerLayout)

        // Name field
        val tilName = TextInputLayout(this, null, com.google.android.material.R.attr.textInputStyle).apply {
            hint = "Patient Name"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = fieldSpacing
            layoutParams = lp
        }
        val etName = TextInputEditText(tilName.context).apply {
            setText(patient.patientName)
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        }
        tilName.addView(etName)
        container.addView(tilName)

        // Remarks field
        val tilRemarks = TextInputLayout(this, null, com.google.android.material.R.attr.textInputStyle).apply {
            hint = "Remarks"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            isCounterEnabled = true
            counterMaxLength = 500
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            layoutParams = lp
        }
        val etRemarks = TextInputEditText(tilRemarks.context).apply {
            setText(patient.remarks ?: "")
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE
            minLines = 2
            gravity = Gravity.TOP
        }
        tilRemarks.addView(etRemarks)
        container.addView(tilRemarks)

        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle("Edit Patient Details")
            .setView(container)
            .setPositiveButton("Update") { _, _ ->
                val name = etName.text.toString().trim()
                val remarks = etRemarks.text.toString().trim()

                if (name.isNotEmpty()) {
                    val updateData = mapOf(
                        "patientName" to name,
                        "remarks" to remarks
                    )
                    patientViewModel.updatePatient(patientId, updateData)
                } else {
                    Toast.makeText(this, "Patient name is required", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun isNetworkAvailable(): Boolean {
        val cm = getSystemService(android.content.Context.CONNECTIVITY_SERVICE) as android.net.ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(android.net.NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun showErrorDialog(title: String, message: String) {
        AlertDialog.Builder(this)
            .setTitle(title)
            .setMessage(message)
            .setPositiveButton("OK", null)
            .show()
    }

    private fun loadFolders() {
        patientViewModel.getPatientById(patientId)
    }

    private fun showCreateFolderDialog() {
        val dp = resources.displayMetrics.density
        val pad = (24 * dp).toInt()

        val container = android.widget.LinearLayout(this).apply {
            orientation = android.widget.LinearLayout.VERTICAL
            setPadding(pad, (16 * dp).toInt(), pad, (8 * dp).toInt())
        }

        val til = TextInputLayout(this, null, com.google.android.material.R.attr.textInputStyle).apply {
            hint = "Folder name"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
        }
        val input = TextInputEditText(til.context).apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS
        }
        til.addView(input)
        container.addView(til)

        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle("Create New Folder")
            .setView(container)
            .setPositiveButton("Create") { _, _ ->
                val folderName = input.text.toString().trim()
                if (folderName.isNotEmpty()) {
                    createFolder(folderName)
                } else {
                    Toast.makeText(this, "Folder name cannot be empty", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun createFolder(folderName: String) {
        patientViewModel.createFolder(patientId, folderName)
    }



    private fun showDownloadOptionsDialog() {
        // Check if there are any files across all folders
        val patient = patientViewModel.currentPatient.value
        val totalFiles = patient?.folders?.sumOf { it.fileCount } ?: 0
        if (totalFiles == 0) {
            Toast.makeText(this, "No files to download", Toast.LENGTH_SHORT).show()
            return
        }

        val options = arrayOf("Download as PDF", "Download as ZIP")
        AlertDialog.Builder(this)
            .setTitle("Download All Files")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> showPdfModeDialog()
                    1 -> handleZipDownload()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    // ─── PDF Download ───────────────────────────────────────────

    private fun showPdfModeDialog() {
        val modes = arrayOf(
            "One merged PDF\nAll folders combined into a single file",
            "One PDF per folder\nEach folder as separate PDF, downloaded as ZIP"
        )
        var selectedMode = 0

        AlertDialog.Builder(this)
            .setTitle("Download as PDF")
            .setSingleChoiceItems(modes, 0) { _, which -> selectedMode = which }
            .setPositiveButton("Download") { _, _ ->
                val mode = if (selectedMode == 0) "merged" else "per-folder"
                downloadPdf(mode)
            }
            .setNegativeButton("Cancel", null)
            .show()
    }

    private fun downloadPdf(mode: String) {
        if (isDownloading) return
        isDownloading = true
        // Filename + mime depend on mode: per-folder bundles each folder as a
        // separate PDF inside a ZIP, merged returns one PDF.
        val ext = if (mode == "per-folder") "zip" else "pdf"
        val mime = if (mode == "per-folder") "application/zip" else "application/pdf"
        val safeName = patientName
            .replace(Regex("[^a-zA-Z0-9]"), "_")
            .trim('_')
            .ifEmpty { "patient" }
        val fileName = "${safeName}_records.$ext"

        // Body is a typed JSON object — Gson + R8 fragility doesn't apply
        // here because we hand-build the string ourselves.
        val bodyJson = JSONObject().put("mode", mode).toString()

        enqueueBulkDownloadWorker(
            relativePath = "/api/patients/$patientId/download/pdf",
            fileName = fileName,
            mimeType = mime,
            method = "POST",
            requestBodyJson = bodyJson,
            uniqueWorkName = "patient_pdf_${patientId}_$mode",
            targetSizeMb = 10
        )
        Snackbar.make(findViewById<View>(android.R.id.content),
            "Preparing PDF download...", Snackbar.LENGTH_SHORT).show()
        // Worker handles re-entrancy via unique work; release the click guard
        // immediately so the user can pick a different mode while bytes flow.
        isDownloading = false
    }

    // ─── ZIP Download ───────────────────────────────────────────

    private fun handleZipDownload() {
        if (isDownloading) return
        isDownloading = true
        val rootView = findViewById<View>(android.R.id.content)

        lifecycleScope.launch {
            try {
                Snackbar.make(rootView, "Checking file sizes...", Snackbar.LENGTH_SHORT).show()
                val apiService = RetrofitClient.getApiService(this@FolderViewActivity)
                val checkResponse = withContext(Dispatchers.IO) {
                    apiService.checkZipSize(patientId)
                }

                if (!checkResponse.isSuccessful || checkResponse.body() == null) {
                    // Size check failed — download anyway
                    triggerZipDownload(null)
                    return@launch
                }

                val body = checkResponse.body()!!
                val overLimit = body["overLimit"] as? Boolean ?: false

                if (!overLimit) {
                    triggerZipDownload(null)
                } else {
                    isDownloading = false
                    val totalSize = (body["totalSize"] as? Number)?.toLong() ?: 0
                    val foldersRaw = body["folders"] as? List<*>
                    showZipFolderPickerDialog(totalSize, foldersRaw)
                }
            } catch (e: Exception) {
                isDownloading = false
                Snackbar.make(rootView, "Download failed: ${e.message}", Snackbar.LENGTH_LONG).show()
            }
        }
    }

    private fun showZipFolderPickerDialog(totalSize: Long, foldersRaw: List<*>?) {
        data class FolderInfo(val name: String, val size: Long, val fileCount: Int, var checked: Boolean = true)

        val folders = foldersRaw?.mapNotNull { item ->
            val map = item as? Map<*, *> ?: return@mapNotNull null
            FolderInfo(
                name = map["name"] as? String ?: return@mapNotNull null,
                size = (map["size"] as? Number)?.toLong() ?: 0,
                fileCount = (map["fileCount"] as? Number)?.toInt() ?: 0
            )
        } ?: return

        fun formatMB(bytes: Long): String = "%.1f MB".format(bytes / (1024.0 * 1024.0))

        val layout = android.widget.LinearLayout(this)
        layout.orientation = android.widget.LinearLayout.VERTICAL
        layout.setPadding(50, 30, 50, 10)

        val tvInfo = android.widget.TextView(this)
        tvInfo.text = "Total: ${formatMB(totalSize)} — select folders to include"
        tvInfo.setTextColor(android.graphics.Color.parseColor("#DC2626"))
        tvInfo.textSize = 13f
        tvInfo.setPadding(0, 0, 0, 20)
        layout.addView(tvInfo)

        val tvSelected = android.widget.TextView(this)
        tvSelected.textSize = 14f
        tvSelected.setPadding(0, 20, 0, 0)

        val checkBoxes = mutableListOf<android.widget.CheckBox>()

        fun updateSelectedSize() {
            val sel = folders.filter { it.checked }.sumOf { it.size }
            val isOver = sel > 10 * 1024 * 1024
            tvSelected.text = "Selected: ${formatMB(sel)}" + if (isOver) " — still over 10 MB" else ""
            tvSelected.setTextColor(
                if (isOver) android.graphics.Color.parseColor("#DC2626")
                else android.graphics.Color.parseColor("#374151")
            )
        }

        for (f in folders) {
            val row = android.widget.LinearLayout(this)
            row.orientation = android.widget.LinearLayout.HORIZONTAL
            row.setPadding(0, 8, 0, 8)

            val cb = android.widget.CheckBox(this)
            cb.isChecked = true
            cb.text = "${f.name}  (${formatMB(f.size)}, ${f.fileCount} files)"
            cb.textSize = 13f
            cb.setOnCheckedChangeListener { _, isChecked ->
                f.checked = isChecked
                updateSelectedSize()
            }
            checkBoxes.add(cb)
            row.addView(cb)
            layout.addView(row)
        }

        layout.addView(tvSelected)
        updateSelectedSize()

        AlertDialog.Builder(this)
            .setTitle("Download too large (${formatMB(totalSize)})")
            .setView(layout)
            .setPositiveButton("Download Selected") { _, _ ->
                val selected = folders.filter { it.checked }.map { it.name }
                if (selected.isEmpty()) {
                    Toast.makeText(this, "Select at least one folder", Toast.LENGTH_SHORT).show()
                } else {
                    triggerZipDownload(selected)
                }
            }
            .setNegativeButton("Cancel") { _, _ -> isDownloading = false }
            .setOnCancelListener { isDownloading = false }
            .show()
    }

    private fun triggerZipDownload(selectedFolders: List<String>?) {
        val safeName = patientName
            .replace(Regex("[^a-zA-Z0-9]"), "_")
            .trim('_')
            .ifEmpty { "patient" }
        val fileName = "${safeName}_records.zip"

        // selectedFolders == null → "download every folder", server expects an
        // empty body. Otherwise pass {"folders": [...]} which mirrors the
        // ZipDownloadRequest shape on the inline path.
        val bodyJson = if (selectedFolders != null) {
            JSONObject().put("folders", JSONArray(selectedFolders)).toString()
        } else null

        // Differentiate by selection so two zip downloads with different
        // selections don't collide on the unique-work key.
        val selectionKey = selectedFolders?.joinToString(",")?.hashCode()?.toString() ?: "all"
        enqueueBulkDownloadWorker(
            relativePath = "/api/patients/$patientId/download/zip",
            fileName = fileName,
            mimeType = "application/zip",
            method = "POST",
            requestBodyJson = bodyJson,
            uniqueWorkName = "patient_zip_${patientId}_$selectionKey"
        )
        Snackbar.make(findViewById<View>(android.R.id.content),
            "Downloading ZIP...", Snackbar.LENGTH_SHORT).show()
        // Reset the click guard — the worker drives the rest.
        isDownloading = false
    }

    // ─── DownloadWorker bridge ──────────────────────────────────

    /**
     * Routes patient-wide bulk downloads through DownloadWorker. Mirrors
     * `FolderDetailsActivity.enqueueBulkDownloadWorker` — see its docstring.
     * Kept inline here (vs. extracted to a util) because FolderViewActivity
     * has no [TokenManager] field on the same class root used by Folder
     * Details and we want each Activity to own its lifecycle observer.
     */
    private fun enqueueBulkDownloadWorker(
        relativePath: String,
        fileName: String,
        mimeType: String,
        method: String,
        requestBodyJson: String?,
        uniqueWorkName: String,
        targetSizeMb: Int = 10
    ) {
        val rootView = findViewById<View>(android.R.id.content)
        lifecycleScope.launch {
            val accessToken = tokenManager.getAccessToken()
            val authHost = try { java.net.URL(RetrofitClient.BASE_URL).host } catch (_: Exception) { null }
            val downloadUrl = "${RetrofitClient.BASE_URL}$relativePath"

            val builder = Data.Builder()
                .putString(DownloadWorker.KEY_DOWNLOAD_URL, downloadUrl)
                .putString(DownloadWorker.KEY_FILE_NAME, fileName)
                .putString(DownloadWorker.KEY_MIME_TYPE, mimeType)
                .putString(DownloadWorker.KEY_PATIENT_NAME, patientName)
                .putString(DownloadWorker.KEY_HOSPITAL_NAME, hospitalName)
                .putString(DownloadWorker.KEY_DOWNLOAD_SUB_PATH, getDownloadSubPath())
                .putString(DownloadWorker.KEY_AUTH_TOKEN, accessToken)
                .putString(DownloadWorker.KEY_AUTH_HOST, authHost)
                .putString(DownloadWorker.KEY_HTTP_METHOD, method)
                .putInt(DownloadWorker.KEY_TARGET_SIZE_MB, targetSizeMb)
            if (!requestBodyJson.isNullOrEmpty()) {
                builder.putString(DownloadWorker.KEY_REQUEST_BODY_JSON, requestBodyJson)
            }

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val request = OneTimeWorkRequestBuilder<DownloadWorker>()
                .setInputData(builder.build())
                .setConstraints(constraints)
                .addTag(DownloadWorker.TAG_DOWNLOAD)
                .build()

            val workManager = WorkManager.getInstance(this@FolderViewActivity)
            workManager.enqueueUniqueWork(uniqueWorkName, ExistingWorkPolicy.KEEP, request)

            Snackbar.make(rootView,
                getString(R.string.download_snackbar_started, fileName),
                Snackbar.LENGTH_LONG)
                .setAction(R.string.cancel) { workManager.cancelWorkById(request.id) }
                .show()

            workManager.getWorkInfoByIdLiveData(request.id).observe(this@FolderViewActivity) { workInfo ->
                if (workInfo == null) return@observe
                when (workInfo.state) {
                    WorkInfo.State.RUNNING -> { /* progress bar surfaces via the foreground notification */ }
                    WorkInfo.State.SUCCEEDED -> {
                        Toast.makeText(
                            this@FolderViewActivity,
                            getString(R.string.download_toast_done, fileName),
                            Toast.LENGTH_LONG
                        ).show()
                    }
                    WorkInfo.State.FAILED -> {
                        val reason = workInfo.outputData.getString(DownloadWorker.KEY_ERROR_REASON) ?: ""
                        val detail = workInfo.outputData.getString(DownloadWorker.KEY_STATUS) ?: ""
                        val msg = DownloadErrorMapper.resolveWorkerFailureMessage(reason, detail)
                        Toast.makeText(this@FolderViewActivity, msg, Toast.LENGTH_LONG).show()
                    }
                    WorkInfo.State.CANCELLED -> {
                        Toast.makeText(
                            this@FolderViewActivity,
                            R.string.download_toast_cancelled,
                            Toast.LENGTH_SHORT
                        ).show()
                    }
                    else -> { /* ENQUEUED / BLOCKED */ }
                }
            }
        }
    }

    // ─── File Save Helper ───────────────────────────────────────

    private fun getDownloadSubPath(vararg extra: String): String {
        val safeHospital = hospitalName.replace(Regex("[^a-zA-Z0-9 _-]"), "").trim().ifEmpty { "Hospital" }
        val safePatient = patientName.replace(Regex("[^a-zA-Z0-9 _-]"), "").trim().ifEmpty { "Patient" }
        val parts = mutableListOf("HospitalRecords", safeHospital, safePatient)
        parts.addAll(extra)
        return parts.joinToString("/")
    }

    override fun onResume() {
        super.onResume()
        loadFolders() // Refresh folder list when returning from scanner
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus && patientId.isNotEmpty()) {
            // Silent refresh when app regains focus (catches mobile uploads from other apps)
            patientViewModel.getPatientById(patientId)
        }
    }
}
