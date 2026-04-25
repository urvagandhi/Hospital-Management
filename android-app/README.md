# Android App - Hospital Management

Native Kotlin Android application built with Clean Architecture (MVVM), Retrofit, Room, and enterprise-grade security including certificate pinning, encrypted storage, and TOTP 2FA.

> **Before publishing to Google Play:** see [`KEYSTORE_SETUP.md`](KEYSTORE_SETUP.md) for the upload-keystore generation runbook (TD-A01). The release build will fail unless `HMS_UPLOAD_KEYSTORE_PATH` / `HMS_UPLOAD_KEYSTORE_PWD` / `HMS_UPLOAD_KEY_PWD` are set.

## Architecture

```mermaid
graph TB
    subgraph UI["UI Layer (Activities)"]
        SPLASH[SplashActivity]
        LOGIN[LoginActivity]
        OTP[OtpActivity]
        TOTP_SETUP[TotpSetupActivity]
        TOTP_VERIFY[TotpVerificationActivity]
        CHPW[ChangePasswordActivity]
        DASH[DashboardActivity]
        ADMISSION[AdmissionActivity]
        PAT_LIST[PatientListActivity]
        PAT_DETAIL[PatientDetailsActivity]
        FOLDER_VIEW[FolderViewActivity]
        FOLDER_DETAIL[FolderDetailsActivity]
        UPLOAD[UploadActivity]
        SCANNER[ScannerActivity]
    end

    subgraph Presentation["Presentation Layer"]
        AUTH_VM[AuthViewModel<br/>AuthState sealed class]
        PAT_VM[PatientViewModel<br/>PatientState sealed class]
        VMF[ViewModelFactory]
    end

    subgraph Domain["Domain Layer (Use Cases)"]
        AUTH_UC[LoginUseCase<br/>VerifyOtpUseCase<br/>SetupTotpUseCase<br/>VerifyTotpLoginUseCase<br/>RecoveryLoginUseCase<br/>LogoutUseCase<br/>...]
        PAT_UC[GetPatientsUseCase<br/>CreatePatientUseCase<br/>UploadFileUseCase<br/>DownloadPdfUseCase<br/>DownloadZipUseCase<br/>...]
    end

    subgraph Data["Data Layer"]
        AUTH_REPO[AuthRepository]
        PAT_REPO[PatientRepository]
        DOC_REPO[DocumentRepository]
        API[ApiService<br/>Retrofit Interface]
        CLIENT[RetrofitClient<br/>OkHttp + Cert Pinning]
        ROOM[(Room DB<br/>OfflineDocument)]
        TOKEN[TokenManager<br/>EncryptedSharedPrefs]
    end

    subgraph Infra["Infrastructure"]
        NET[NetworkMonitor<br/>Connectivity + Health]
        SESS[SessionManager<br/>Timeout: 15min]
        BIO[BiometricHelper]
        SEC[SecurityUtils<br/>Root Detection]
        SYNC[SyncDocumentsWorker<br/>WorkManager]
    end

    UI --> Presentation
    Presentation --> Domain
    Domain --> Data
    Data --> API
    API --> CLIENT
    CLIENT -->|HTTPS + Pinning| BACKEND[Backend API]
    DOC_REPO --> ROOM
    SYNC --> ROOM
    SYNC --> API
    NET --> BACKEND

    style UI fill:#bfdbfe
    style Presentation fill:#c4b5fd
    style Domain fill:#fbcfe8
    style Data fill:#fde68a
    style Infra fill:#d1fae5
```

## Screen Flow

```mermaid
flowchart TD
    SPLASH[Splash Screen] -->|Valid token + session| DASH[Dashboard]
    SPLASH -->|No token / expired| LOGIN[Login]

    LOGIN -->|requirePasswordChange| CHPW[Change Password]
    LOGIN -->|requireTotp| TOTP_V[TOTP Verification]
    LOGIN -->|requireTotpSetup| TOTP_S[TOTP Setup]
    LOGIN -->|Success| DASH

    CHPW --> TOTP_S
    TOTP_V -->|Valid code| DASH
    TOTP_V -->|Backup code| DASH
    TOTP_S -->|QR + verify| DASH

    DASH --> PAT_LIST[Patient List]
    DASH --> ADMISSION[New Admission]
    DASH --> FOLDER[Folder View]
    DASH --> UPLOAD_F[Upload Documents]

    PAT_LIST --> PAT_DETAIL[Patient Details]
    PAT_DETAIL --> FOLDER
    FOLDER --> FOLDER_D[Folder Details]
    FOLDER_D --> UPLOAD_F

    ADMISSION -->|Patient created| PAT_LIST

    UPLOAD_F --> SCANNER[Document Scanner<br/>ML Kit]
    SCANNER -->|Pages captured| UPLOAD_F
    UPLOAD_F -->|Online| BACKEND[Upload to Server]
    UPLOAD_F -->|Offline| QUEUE[Save to Room DB]
    QUEUE -->|Network restored| SYNC[WorkManager Sync]
    SYNC --> BACKEND

    style DASH fill:#86efac
    style LOGIN fill:#93c5fd
    style QUEUE fill:#fca5a5
```

## Offline Sync

```mermaid
sequenceDiagram
    participant U as User
    participant A as UploadActivity
    participant N as NetworkMonitor
    participant R as Room DB
    participant W as SyncDocumentsWorker
    participant S as Backend API

    U->>A: Capture document
    A->>N: Check connectivity

    alt Online
        A->>S: Upload file directly
        S-->>A: Success
    else Offline
        A->>R: Save OfflineDocument (PENDING)
        A-->>U: Saved for later sync
    end

    Note over N: Network restored
    N->>W: Trigger SyncDocumentsWorker
    W->>R: Query PENDING documents
    loop Each document
        W->>R: Update status → UPLOADING
        W->>S: Upload file
        alt Success
            W->>R: Update status → COMPLETED
            W->>W: Delete local file
        else Failure
            W->>R: Update status → FAILED + error
        end
    end
```

## Session & Security

```mermaid
flowchart TD
    subgraph Startup
        APP[HospitalApplication.onCreate]
        APP --> ROOT{Root detected?}
        ROOT -->|Yes| WARN[Show warning toast]
        ROOT -->|No| INIT[Initialize app]
        INIT --> NET_INIT[Start NetworkMonitor]
        INIT --> SESS_INIT[Start SessionManager]
    end

    subgraph Runtime["Activity Lifecycle"]
        RESUME[onResume] --> TIMEOUT{Session valid?<br/>&#40;15 min timeout&#41;}
        TIMEOUT -->|Expired| LOGOUT[Force logout<br/>→ LoginActivity]
        TIMEOUT -->|Valid| CONTINUE[Continue]
        PAUSE[onPause] --> UPDATE[Update last interaction time]
    end

    subgraph Conflict["Multi-Device Detection"]
        REQ[API Request] --> INTERCEPT[AuthInterceptor]
        INTERCEPT -->|401 SESSION_CONFLICT| BROADCAST[Broadcast<br/>ACTION_SESSION_REVOKED]
        BROADCAST --> REVOKE[DashboardActivity receives]
        REVOKE --> LOGOUT2[Force logout + toast]
    end

    style LOGOUT fill:#fca5a5
    style LOGOUT2 fill:#fca5a5
    style WARN fill:#fef08a
```

## Directory Structure

```
android-app/app/src/main/
├── java/com/hospital/management/
│   ├── HospitalApplication.kt          # App lifecycle, network callback, sync
│   │
│   ├── data/
│   │   ├── api/
│   │   │   ├── ApiService.kt           # Retrofit endpoints (30+)
│   │   │   ├── AuthInterceptor.kt      # Token injection + session conflict
│   │   │   └── RetrofitClient.kt       # Singleton, cert pinning, cookies
│   │   ├── local/
│   │   │   ├── AppDatabase.kt          # Room DB (offline_documents table)
│   │   │   ├── DocumentDao.kt          # CRUD for offline queue
│   │   │   └── OfflineDocument.kt      # Entity + SyncStatus enum
│   │   ├── model/
│   │   │   ├── AuthModels.kt           # Login, TOTP, password responses
│   │   │   ├── Hospital.kt
│   │   │   ├── Patient.kt              # Patient, Folder, FileItem
│   │   │   └── PatientRequest.kt
│   │   └── repository/
│   │       ├── AuthRepository.kt       # Auth API wrapper
│   │       ├── PatientRepository.kt    # Patient API wrapper
│   │       └── DocumentRepository.kt   # Offline-first document management
│   │
│   ├── domain/usecase/
│   │   ├── AuthUseCases.kt             # 11 auth use cases
│   │   └── PatientUseCases.kt          # 11 patient use cases
│   │
│   ├── ui/
│   │   ├── auth/
│   │   │   ├── LoginActivity.kt
│   │   │   ├── OtpActivity.kt
│   │   │   ├── ChangePasswordActivity.kt
│   │   │   ├── TotpSetupActivity.kt
│   │   │   └── TotpVerificationActivity.kt
│   │   ├── dashboard/
│   │   │   └── DashboardActivity.kt
│   │   ├── patient/
│   │   │   ├── PatientListActivity.kt
│   │   │   ├── PatientDetailsActivity.kt
│   │   │   ├── AdmissionActivity.kt
│   │   │   ├── FolderViewActivity.kt
│   │   │   ├── FolderDetailsActivity.kt
│   │   │   ├── UploadActivity.kt
│   │   │   └── ScannerActivity.kt
│   │   ├── adapter/
│   │   │   ├── PatientAdapter.kt
│   │   │   ├── FileAdapter.kt
│   │   │   └── FolderAdapter.kt
│   │   ├── viewmodel/
│   │   │   ├── AuthViewModel.kt
│   │   │   ├── PatientViewModel.kt
│   │   │   └── ViewModelFactory.kt
│   │   └── SplashActivity.kt
│   │
│   ├── utils/
│   │   ├── NetworkMonitor.kt           # Connectivity + health check
│   │   ├── SessionManager.kt           # 15-min timeout enforcement
│   │   ├── BiometricHelper.kt          # Fingerprint/face auth
│   │   ├── SecurityUtils.kt            # Root detection
│   │   └── TokenManager.kt             # EncryptedSharedPreferences
│   │
│   └── worker/
│       └── SyncDocumentsWorker.kt      # WorkManager background sync
│
├── res/
│   ├── layout/                         # XML layouts for all activities
│   ├── drawable/                        # Icons and backgrounds
│   ├── values/                          # Strings, colors, themes
│   └── xml/
│       └── network_security_config.xml  # Certificate pinning
│
└── AndroidManifest.xml
```

## Key Features

### Certificate Pinning

```mermaid
flowchart LR
    APP[Android App] -->|HTTPS| SERVER[Backend Server]
    APP -->|Verify SHA-256 pin| CERT[Server Certificate]
    CERT -->|Match| OK[Connection Allowed]
    CERT -->|Mismatch| BLOCK[Connection Blocked]

    style OK fill:#86efac
    style BLOCK fill:#fca5a5
```

Configured in `network_security_config.xml`:
- Pins SHA-256 hash of server certificate
- Cleartext traffic disabled globally
- Localhost exempted for development
- Expiry: 2027-01-01

### Encrypted Storage

All sensitive data stored via `EncryptedSharedPreferences`:
- **MasterKey:** AES256-GCM scheme
- **Key encryption:** AES256-SIV
- **Value encryption:** AES256-GCM

Stored values:
| Key | Description |
|-----|-------------|
| `access_token` | JWT access token |
| `refresh_token` | JWT refresh token |
| `temp_token` | Temporary token for TOTP/password flows |
| `hospital_id` | Current hospital ID |
| `hospital_name` | Display name |
| `logo_url` | Hospital logo URL |
| `session_timestamp` | Last interaction time |
| `biometric_enrolled` | Biometric auth flag |

### Document Scanner

Integrates **Google ML Kit Document Scanner** for:
- Camera-based document capture
- Auto-edge detection and perspective correction
- Multi-page scanning with thumbnail preview
- Page reordering and deletion before upload

### Background Sync (WorkManager)

```
Network restored
    → SyncDocumentsWorker triggered
    → Query Room DB for PENDING documents
    → Upload each to backend via Retrofit
    → Update status: COMPLETED / FAILED
    → Delete local files on success
```

## Build Requirements

| Requirement | Version |
|-------------|---------|
| Android Studio | Hedgehog+ |
| Kotlin | 1.9.0 |
| Gradle | 8.5 |
| Min SDK | 26 (Android 8.0) |
| Target SDK | 34 (Android 14) |
| Compile SDK | 34 |
| Java | 1.8 |

## Setup

### 1. Open in Android Studio

```
File → Open → select android-app/ directory
```

### 2. Sync Gradle

Android Studio will auto-sync. If not: `File → Sync Project with Gradle Files`

### 3. Configure Server URL

Update the base URL in `RetrofitClient.kt` to point to your backend:

```kotlin
private const val BASE_URL = "https://your-backend-url.com/"
```

### 4. Update Certificate Pin

If using a different server, update `network_security_config.xml`:

```xml
<pin-set expiration="2027-01-01">
    <pin digest="SHA-256">YOUR_CERTIFICATE_HASH</pin>
</pin-set>
```

### 5. Build & Run

- **Debug:** Run button in Android Studio (or `./gradlew assembleDebug`)
- **Release:** `./gradlew assembleRelease` (requires signing config)

## Dependencies

| Library | Version | Purpose |
|---------|---------|---------|
| Retrofit | 2.9.0 | HTTP client |
| OkHttp | 4.12.0 | HTTP + cert pinning |
| Room | 2.6.1 | SQLite database (offline queue) |
| DataStore | 1.0.0 | Preferences storage |
| Coroutines | 1.7.3 | Async operations |
| WorkManager | 2.9.0 | Background sync |
| ML Kit Scanner | 16.0.0-beta1 | Document scanning |
| CameraX | 1.3.0 | Camera capture |
| Glide | 4.16.0 | Image loading |
| iText7 | 7.2.5 | PDF generation |
| Biometric | 1.1.0 | Fingerprint/face auth |
| EncryptedSharedPrefs | - | AES-256 encrypted storage |
| Jetpack Compose | 1.5.4 | Modern UI toolkit |

## Permissions

| Permission | Purpose |
|------------|---------|
| `INTERNET` | API communication |
| `CAMERA` | Document scanning |
| `POST_NOTIFICATIONS` | Sync status notifications |
