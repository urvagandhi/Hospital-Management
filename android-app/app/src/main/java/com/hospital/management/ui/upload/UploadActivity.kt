package com.hospital.management.ui.upload

import android.net.Uri
import android.os.Bundle
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.hospital.management.data.api.RetrofitClient
import com.hospital.management.databinding.ActivityUploadBinding
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import androidx.lifecycle.ViewModelProvider
import androidx.lifecycle.lifecycleScope
import com.hospital.management.data.repository.PatientRepository
import com.hospital.management.data.local.TokenManager
import com.hospital.management.presentation.viewmodel.PatientState
import com.hospital.management.presentation.viewmodel.PatientViewModel
import com.hospital.management.presentation.viewmodel.ViewModelFactory
import android.view.View

class UploadActivity : AppCompatActivity() {
    private lateinit var binding: ActivityUploadBinding
    private lateinit var patientViewModel: PatientViewModel
    private lateinit var tokenManager: TokenManager
    private var imageUri: Uri? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityUploadBinding.inflate(layoutInflater)
        setContentView(binding.root)

        tokenManager = TokenManager(this)
        setupViewModel()
        setupObservers()

        val uriString = intent.getStringExtra("imageUri")
        if (uriString != null) {
            imageUri = Uri.parse(uriString)
            binding.ivPreview.setImageURI(imageUri)
        }

        binding.btnUpload.setOnClickListener {
            uploadFile()
        }
    }

    private fun setupViewModel() {
        val apiService = RetrofitClient.getApiService(this)
        val patientRepository = PatientRepository(apiService, tokenManager)
        val factory = ViewModelFactory(patientRepository = patientRepository)
        patientViewModel = ViewModelProvider(this, factory)[PatientViewModel::class.java]
    }

    private fun setupObservers() {
        lifecycleScope.launch {
            patientViewModel.patientState.collect { state ->
                when(state) {
                    is PatientState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.btnUpload.isEnabled = false
                    }
                    is PatientState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        if (state.message == "File uploaded successfully") {
                            Toast.makeText(this@UploadActivity, state.message, Toast.LENGTH_SHORT).show()
                            finish()
                        }
                    }
                    is PatientState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                        Toast.makeText(this@UploadActivity, state.message, Toast.LENGTH_SHORT).show()
                    }
                    else -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnUpload.isEnabled = true
                    }
                }
            }
        }
    }

    private fun uploadFile() {
        val patientId = binding.etPatientId.text.toString()
        val folderName = binding.etFolderName.text.toString()

        if (patientId.isEmpty() || folderName.isEmpty() || imageUri == null) {
            Toast.makeText(this, "Please fill all fields and capture image", Toast.LENGTH_SHORT).show()
            return
        }

        try {
            // Need to fix "path" issue for modern Android URIs using ContentResolver if needed,
            // but assuming imageUri.path works for file capture or using content resolver stream copy.
            // For robustness let's try to get file from URI or use a helper.
            // In ScannerActivity it was saved to a file, so path might work if it's file://
            // If it's content:// we need stream copy.
            // ScannerActivity saves to "outputDirectory" which is file system, so path should correspond to a file.

            // However, Uri.parse(string) from file path usually needs 'file://' scheme or just absolute path.
            // ScannerActivity passes `savedUri.toString()` which is file URI.

            val file = File(imageUri!!.path!!) // Basic file instance
            val mediaType = "image/jpeg".toMediaTypeOrNull()
            val requestFile = file.asRequestBody(mediaType)
            val body = MultipartBody.Part.createFormData("file", file.name, requestFile)

            patientViewModel.uploadFile(patientId, folderName, body)

        } catch (e: Exception) {
            Toast.makeText(this, "Error preparing file: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}
