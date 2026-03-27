package com.hospital.management.ui.folders

import com.hospital.management.R
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.data.api.ZipDownloadRequest
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
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.google.android.material.textfield.TextInputLayout
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class FolderViewActivity : BaseActivity() {

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
        loadFolders()
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
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
        findViewById<android.widget.TextView>(R.id.tvMrn)
        findViewById<android.widget.TextView>(R.id.tvPhone)

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
                        if (msg.contains("duplicate key error") || msg.contains("medicalRecordNumber")) {
                             showErrorDialog("Update Failed", "A patient with this Medical Record Number (MRN) already exists.\nPlease use a unique MRN.")
                        } else {
                             Toast.makeText(this@FolderViewActivity, msg, Toast.LENGTH_SHORT).show()
                        }
                    }
                    else -> progressBar.visibility = View.GONE
                }
            }
        }

        lifecycleScope.launch {
            patientViewModel.currentPatient.collect { patient ->
                if (patient != null && patient._id == patientId) {
                    // Update UI with patient details
                    findViewById<android.widget.TextView>(R.id.tvPatientName).text = patient.patientName
                    findViewById<android.widget.TextView>(R.id.tvMrn).text = "MRN: ${patient.medicalRecordNumber}"
                    findViewById<android.widget.TextView>(R.id.tvPhone).text = "Phone: ${patient.phone}"

                    // Update folder list with current pending counts
                    updateFolderList(patient)
                }
            }
        }
    }

    private fun updateFolderList(patient: com.hospital.management.data.models.Patient) {
        lifecycleScope.launch {
            // Get pending files count from local database
            val database = com.hospital.management.data.local.AppDatabase.getDatabase(this@FolderViewActivity)
            val pendingDocs = database.documentDao().getPendingForPatient(patientId)
            
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
                    Folder(
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
                    intent.putExtra("PATIENT_MRN", patient.medicalRecordNumber)
                    intent.putExtra("PATIENT_PHONE", patient.phone)
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

        // MRN field
        val tilMrn = TextInputLayout(this, null, com.google.android.material.R.attr.textInputStyle).apply {
            hint = "Medical Record Number"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            lp.bottomMargin = fieldSpacing
            layoutParams = lp
        }
        val etMrn = TextInputEditText(tilMrn.context).apply {
            setText(patient.medicalRecordNumber)
            inputType = InputType.TYPE_CLASS_TEXT
        }
        tilMrn.addView(etMrn)
        container.addView(tilMrn)

        // Phone field
        val tilPhone = TextInputLayout(this, null, com.google.android.material.R.attr.textInputStyle).apply {
            hint = "Phone Number"
            boxBackgroundMode = TextInputLayout.BOX_BACKGROUND_OUTLINE
            val lp = android.widget.LinearLayout.LayoutParams(
                android.widget.LinearLayout.LayoutParams.MATCH_PARENT,
                android.widget.LinearLayout.LayoutParams.WRAP_CONTENT
            )
            layoutParams = lp
        }
        val etPhone = TextInputEditText(tilPhone.context).apply {
            setText(patient.phone)
            inputType = InputType.TYPE_CLASS_PHONE
        }
        tilPhone.addView(etPhone)
        container.addView(tilPhone)

        MaterialAlertDialogBuilder(this, R.style.AlertDialogTheme)
            .setTitle("Edit Patient Details")
            .setView(container)
            .setPositiveButton("Update") { _, _ ->
                val name = etName.text.toString().trim()
                val mrn = etMrn.text.toString().trim()
                val phone = etPhone.text.toString().trim()

                if (name.isNotEmpty() && mrn.isNotEmpty()) {
                    val updateData = mapOf(
                        "patientName" to name,
                        "medicalRecordNumber" to mrn,
                        "phone" to phone
                    )
                    patientViewModel.updatePatient(patientId, updateData)
                } else {
                    Toast.makeText(this, "Name and MRN are required", Toast.LENGTH_SHORT).show()
                }
            }
            .setNegativeButton("Cancel", null)
            .show()
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
        val rootView = findViewById<View>(android.R.id.content)

        lifecycleScope.launch {
            try {
                Snackbar.make(rootView, "Preparing PDF download...", Snackbar.LENGTH_SHORT).show()
                val apiService = RetrofitClient.getApiService(this@FolderViewActivity)
                val response = withContext(Dispatchers.IO) {
                    apiService.downloadPatientPdf(patientId, mapOf("mode" to mode))
                }

                if (response.isSuccessful && response.body() != null) {
                    val ext = if (mode == "per-folder") "zip" else "pdf"
                    val mime = if (mode == "per-folder") "application/zip" else "application/pdf"
                    val safeName = patientName.replace(Regex("[^a-zA-Z0-9 ]"), "").trim().replace("\\s+".toRegex(), "_")
                    val fileName = "${safeName}_all_records.$ext"

                    withContext(Dispatchers.IO) {
                        saveToDownloads(response.body()!!, fileName, mime)
                    }
                    Snackbar.make(rootView, "Saved to ${getDownloadSubPath()}/$fileName", Snackbar.LENGTH_LONG).show()
                } else {
                    Snackbar.make(rootView, "Download failed. Please try again.", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(rootView, "Download failed: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                isDownloading = false
            }
        }
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
        if (!isDownloading) isDownloading = true
        val rootView = findViewById<View>(android.R.id.content)

        lifecycleScope.launch {
            try {
                Snackbar.make(rootView, "Downloading ZIP...", Snackbar.LENGTH_SHORT).show()
                val apiService = RetrofitClient.getApiService(this@FolderViewActivity)

                val response = withContext(Dispatchers.IO) {
                    if (selectedFolders != null) {
                        apiService.downloadPatientZip(patientId, ZipDownloadRequest(selectedFolders))
                    } else {
                        apiService.downloadPatientZipAll(patientId)
                    }
                }

                if (response.isSuccessful && response.body() != null) {
                    val safeName = patientName.replace(Regex("[^a-zA-Z0-9 ]"), "").trim().replace("\\s+".toRegex(), "_")
                    val fileName = "${safeName}_all_records.zip"
                    withContext(Dispatchers.IO) {
                        saveToDownloads(response.body()!!, fileName, "application/zip")
                    }
                    Snackbar.make(rootView, "Saved to ${getDownloadSubPath()}/$fileName", Snackbar.LENGTH_LONG).show()
                } else {
                    Snackbar.make(rootView, "Download failed. Please try again.", Snackbar.LENGTH_LONG).show()
                }
            } catch (e: Exception) {
                Snackbar.make(rootView, "Download failed: ${e.message}", Snackbar.LENGTH_LONG).show()
            } finally {
                isDownloading = false
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

    private fun saveToDownloads(body: okhttp3.ResponseBody, fileName: String, mimeType: String, subPath: String? = null) {
        val resolver = contentResolver
        val relativePath = subPath ?: getDownloadSubPath()
        val contentValues = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, fileName)
            put(MediaStore.Downloads.MIME_TYPE, mimeType)
            put(MediaStore.Downloads.RELATIVE_PATH, "${android.os.Environment.DIRECTORY_DOWNLOADS}/$relativePath")
            put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues) ?: return
        resolver.openOutputStream(uri)?.use { output ->
            body.byteStream().copyTo(output)
        }
        contentValues.clear()
        contentValues.put(MediaStore.Downloads.IS_PENDING, 0)
        resolver.update(uri, contentValues, null, null)
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
