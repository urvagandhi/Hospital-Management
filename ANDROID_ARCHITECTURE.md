# Hospital Management Android App - Complete Architecture Guide

## 🏗️ Architecture Overview

### MVVM + Clean Architecture

```
┌─────────────────────────────────────────┐
│         Presentation Layer              │
│  (Compose UI + ViewModels + States)     │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│          Domain Layer                   │
│      (UseCases + Models)                │
└─────────────────┬───────────────────────┘
                  │
┌─────────────────▼───────────────────────┐
│           Data Layer                    │
│  (Repository + API + Local Storage)     │
└─────────────────────────────────────────┘
```

## 📁 Project Structure

```
app/src/main/java/com/hospital/management/
├── data/
│   ├── api/
│   │   ├── ApiService.kt              ✅ CREATED
│   │   └── RetrofitClient.kt          ✅ EXISTS
│   ├── local/
│   │   └── TokenManager.kt            ✅ CREATED (DataStore)
│   ├── models/
│   │   ├── PatientRequest.kt          ✅ CREATED
│   │   └── Patient.kt                 ✅ CREATED
│   └── repository/
│       ├── AuthRepository.kt          ✅ CREATED
│       └── PatientRepository.kt       ✅ CREATED
│
├── domain/
│   └── usecase/
│       ├── AuthUseCases.kt            ✅ CREATED
│       └── PatientUseCases.kt         ✅ CREATED
│
├── presentation/
│   ├── viewmodel/
│   │   ├── AuthViewModel.kt           ✅ CREATED
│   │   ├── PatientViewModel.kt        ⏳ TODO
│   │   └── ScanViewModel.kt           ⏳ TODO
│   ├── compose/
│   │   ├── screens/
│   │   │   ├── LoginScreen.kt         ⏳ TODO
│   │   │   ├── OtpScreen.kt           ⏳ TODO
│   │   │   ├── LandingScreen.kt       ⏳ TODO
│   │   │   ├── PatientListScreen.kt   ⏳ TODO
│   │   │   ├── NewAdmissionScreen.kt  ⏳ TODO
│   │   │   ├── ScanDocumentScreen.kt  ⏳ TODO
│   │   │   └── FolderViewScreen.kt    ⏳ TODO
│   │   ├── components/
│   │   │   ├── FolderCard.kt          ⏳ TODO
│   │   │   ├── PatientCard.kt         ⏳ TODO
│   │   │   └── DocumentPreview.kt     ⏳ TODO
│   │   └── navigation/
│   │       └── AppNavigation.kt       ⏳ TODO
│   └── ui/
│       └── theme/
│           ├── Color.kt               ⏳ TODO
│           ├── Theme.kt               ⏳ TODO
│           └── Type.kt                ⏳ TODO
│
├── utils/
│   ├── DocumentScanner.kt             ⏳ TODO (ML Kit)
│   ├── FileCompressor.kt              ⏳ TODO
│   └── Constants.kt                   ⏳ TODO
│
└── workers/
    └── UploadWorker.kt                ⏳ TODO (WorkManager)
```

## 🎯 Key Features Implementation

### 1. Authentication Flow

- ✅ Login with email/password → Get tempToken
- ✅ Verify OTP with tempToken → Get access token (cookie)
- ✅ Store tokens in DataStore
- ✅ Auto-refresh tokens
- ⏳ Single device login restriction
- ⏳ 30-day session management

### 2. Patient Management

- ✅ Create patient with auto-folders
- ✅ List patients (pagination)
- ✅ View patient details
- ⏳ Search/filter patients

### 3. Document Management

- ⏳ ML Kit Document Scanner integration
- ✅ Upload to backend → R2
- ✅ Download PDF (folder/all)
- ✅ Download ZIP (folder/all)
- ⏳ Compress PDF ≤10MB
- ⏳ Share functionality

### 4. Folders (Auto-created)

```kotlin
val DEFAULT_FOLDERS = listOf(
    "id",
    "claim-paper",
    "hospital-bills",
    "discharge-summary",
    "hospital-documents",
    "reports",
    "medical-prescription-bills",
    "consent"
)
```

### 5. Background Upload

- ⏳ WorkManager for pending uploads
- ⏳ Retry logic
- ⏳ Upload progress tracking

## 🔧 Dependencies Added

```gradle
// Jetpack Compose ✅
implementation "androidx.compose.ui:ui:1.5.4"
implementation "androidx.compose.material3:material3:1.1.2"
implementation "androidx.navigation:navigation-compose:2.7.5"

// ML Kit Document Scanner ✅
implementation 'com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1'

// DataStore ✅
implementation "androidx.datastore:datastore-preferences:1.0.0"

// WorkManager ✅
implementation "androidx.work:work-runtime-ktx:2.9.0"

// PDF Generation ✅
implementation 'com.itextpdf:itext7-core:7.2.5'

// Image Loading ✅
implementation "io.coil-kt:coil-compose:2.5.0"
```

## 📱 Screens to Implement

### 1. LoginScreen (Compose)

```kotlin
@Composable
fun LoginScreen(
    viewModel: AuthViewModel,
    onNavigateToOtp: (String) -> Unit
)
```

### 2. OtpScreen (Compose)

```kotlin
@Composable
fun OtpScreen(
    tempToken: String,
    viewModel: AuthViewModel,
    onNavigateToLanding: () -> Unit
)
```

### 3. LandingScreen (Compose)

- Hospital logo
- New Admission button
- Show Patients button
- Logout

### 4. NewAdmissionScreen (Compose)

- Form fields
- Auto-create 8 default folders
- Navigate to patient details

### 5. ScanDocumentScreen (Compose)

- ML Kit Document Scanner
- Preview scanned pages
- Select folder for upload
- Upload to backend

### 6. PatientListScreen (Compose)

- Search bar
- Patient cards
- Pagination
- Pull to refresh

### 7. FolderViewScreen (Compose)

- Folder grid/list
- File count badges
- Download options (PDF/ZIP)
- Upload button

## 🔐 Authentication Cookie Handling

The app uses **cookie-based auth** (not manual token headers).

```kotlin
// RetrofitClient already has CookieJar
val cookieJar = object : CookieJar {
    private val cookieStore = HashMap<String, List<Cookie>>()

    override fun saveFromResponse(url: HttpUrl, cookies: List<Cookie>) {
        cookieStore[url.host] = cookies
    }

    override fun loadForRequest(url: HttpUrl): List<Cookie> {
        return cookieStore[url.host] ?: ArrayList()
    }
}
```

✅ Cookies automatically stored and sent with every request!

## 📷 ML Kit Document Scanner Usage

```kotlin
val scanner = GmsDocumentScanning.getClient(
    GmsDocumentScannerOptions.Builder()
        .setGalleryImportAllowed(true)
        .setPageLimit(30)
        .setResultFormats(RESULT_FORMAT_JPEG, RESULT_FORMAT_PDF)
        .setScannerMode(SCANNER_MODE_FULL)
        .build()
)

val scannerLauncher = rememberLauncherForActivityResult(
    contract = ActivityResultContracts.StartIntentSenderForResult()
) { result ->
    if (result.resultCode == Activity.RESULT_OK) {
        val scanResult = GmsDocumentScanningResult.fromActivityResultIntent(result.data)
        scanResult?.pages?.forEach { page ->
            // Upload page.imageUri
        }
    }
}
```

## 📦 WorkManager for Background Upload

```kotlin
class UploadWorker(
    context: Context,
    params: WorkerParameters
) : CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val patientId = inputData.getString("patientId") ?: return Result.failure()
        val folderName = inputData.getString("folderName") ?: return Result.failure()
        val fileUri = inputData.getString("fileUri") ?: return Result.failure()

        return try {
            // Upload logic
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }
}
```

## 🎨 Next Steps

### Phase 1: Complete Core Architecture ✅

- ✅ Add dependencies
- ✅ Create data layer
- ✅ Create domain layer
- ✅ Create base ViewModels

### Phase 2: Implement Compose UI ⏳

- Create theme files
- Build navigation
- Implement all 7 screens
- Add animations

### Phase 3: ML Kit Integration ⏳

- Document scanner
- Image processing
- Upload flow

### Phase 4: Advanced Features ⏳

- PDF compression
- WorkManager
- Share functionality
- Session management

### Phase 5: Testing & Polish ⏳

- Unit tests
- UI tests
- Performance optimization
- Error handling

## 📝 Notes

1. **Current app is XML-based** - Gradual migration to Compose
2. **Cookies handle auth** - No manual token management needed
3. **Backend handles R2** - No R2 keys in app
4. **ML Kit is Google Play Services** - Requires Play Services on device
5. **PDF compression** - Use iText7 library

## 🚀 To Continue Development

Run:

```bash
.\gradlew build
```

This will sync all new dependencies and prepare for Compose development.

Would you like me to:

1. Generate all Compose screens?
2. Implement ML Kit scanner?
3. Create WorkManager upload system?
4. Build complete navigation?
