# Android App — Refreshed Audit

**Verified at commit:** `1b3bf22` (branch `feat/redesign-and-platform-upgrades`, HEAD at 2026-04-24)
**Audit date:** 2026-04-24
**Files analysed:** 77 Kotlin source files (no hand-written Java) under [android-app/app/src/main/java/com/hospital/management/](../../android-app/app/src/main/java/com/hospital/management/), ~13 700 LOC.
**Baseline:** none — the prior audit explicitly scoped `android-app/` out (see [README.md §"Out of scope"](README.md)). This document is the first ground-truth pass.

Companion docs (findings filed into the cross-cutting ledgers rather than duplicated here):
- [`00-drift.md` §12 "Android drift vs §F MOBILE_ONLY guesses"](00-drift.md) — which presumed `MOBILE_ONLY` rows actually are / are not called by the app.
- [`01-dead-code.md` §J "Android dead code"](01-dead-code.md) — 7 unused deps + 1 orphan widget + 1 dead header.
- [`02-commented-code.md` §8 "Android commented code"](02-commented-code.md) — survey (nothing actionable).
- [`03-architecture-diagrams.md` §18-§30](03-architecture-diagrams.md) — 13 Android-specific Mermaid diagrams.
- [`04-enhancements.md` §6 "Android"](04-enhancements.md) — OWASP Mobile mapping + perf + scaling + onboarding.
- [`06-tech-debt-ledger.md` §"Android backlog" (TD-A01..TD-A15)](06-tech-debt-ledger.md) — prioritised Android tickets.

---

## 1. Build system at a glance

| Knob | Value | Source |
|---|---|---|
| AGP | `8.2.0` | [android-app/build.gradle:3](../../android-app/build.gradle) |
| Kotlin | `1.9.22` | [android-app/build.gradle:4](../../android-app/build.gradle) |
| Google Services plugin | `4.4.4` | [android-app/build.gradle:5](../../android-app/build.gradle) |
| `compileSdk` / `targetSdk` | `34` / `34` | [android-app/app/build.gradle:23-28](../../android-app/app/build.gradle) |
| `minSdk` | `26` (Android 8.0 Oreo) | [app/build.gradle:27](../../android-app/app/build.gradle) |
| `versionCode` / `versionName` | `1` / `"1.0"` | [app/build.gradle:29-30](../../android-app/app/build.gradle) |
| Java target | `VERSION_1_8` | [app/build.gradle:52-56](../../android-app/app/build.gradle) |
| R8 in release | `minifyEnabled true` + `shrinkResources true` | [app/build.gradle:46-47](../../android-app/app/build.gradle) |
| Kotlin annotation processing | `kapt` (Room compiler) | [app/build.gradle:3, 8-19, 154](../../android-app/app/build.gradle) |
| Signing (release) | **Points at debug keystore**, plaintext password `android/android` | [app/build.gradle:35-41](../../android-app/app/build.gradle) |
| `applicationId` / `namespace` | `com.hospital.management` | [app/build.gradle:22, 26](../../android-app/app/build.gradle) |
| `viewBinding` | true | [app/build.gradle:58-59](../../android-app/app/build.gradle) |
| `compose` | true, compiler `1.5.8` | [app/build.gradle:60, 63-65](../../android-app/app/build.gradle) — **declared but unused; every Activity is ViewBinding XML** |
| `buildConfig` | true | [app/build.gradle:61](../../android-app/app/build.gradle) |
| Module count | 1 (`:app`) | [settings.gradle:16](../../android-app/settings.gradle) |

### 1.1 Red flags at the build layer

| # | Finding | Severity | Evidence |
|---|---|---|---|
| 1 | `signingConfigs.release` points at `~/.android/debug.keystore` with hard-coded password `"android"` — any upload to Play Store will be rejected as a debug-signed APK. | 🔴 Critical | [app/build.gradle:36-41](../../android-app/app/build.gradle) |
| 2 | `release.keystore` is **tracked in git** at the repo root (`git ls-files android-app/release.keystore` returns a hit). Even if it isn't the live upload keystore, keystores MUST never live in version control. | 🔴 Critical | `git ls-files android-app/release.keystore` |
| 3 | `versionCode 1` never bumped. First Play upload works; every subsequent one is rejected (`INVALID_APK_VERSION_CODE`). | 🟠 High | [app/build.gradle:29](../../android-app/app/build.gradle) |
| 4 | `targetSdk 34`. Play requires 35 for new apps (Aug 2025) / updates (Aug 2026). Trails the deadline. | 🟠 High | [app/build.gradle:28](../../android-app/app/build.gradle) |
| 5 | `androidx.security:security-crypto:1.1.0-alpha06` in release — alpha API in a hospital app. | 🟠 High | [app/build.gradle:79](../../android-app/app/build.gradle) |
| 6 | `play-services-mlkit-document-scanner:16.0.0-beta1` in release — beta API in release. | 🟡 Medium | [app/build.gradle:115](../../android-app/app/build.gradle) |
| 7 | `kapt` still used for Room; Google recommends KSP (faster, Kotlin-native). | 🟡 Medium | [app/build.gradle:3, 154](../../android-app/app/build.gradle) |
| 8 | `gradle.properties` enables `android.enableJetifier=true` — no longer needed (all deps are AndroidX). Costs build time. | 🟡 Medium | [android-app/gradle.properties:3](../../android-app/gradle.properties) |
| 9 | No `ci` script / no CI integrity check configured at repo root. | 🟡 Medium | N/A |

See [`01-dead-code.md` §J](01-dead-code.md) for the dependency-usage audit, and [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) items `TD-A01`–`TD-A05` for remediation steps.

### 1.2 Dependency inventory

57 `implementation` entries. Usage confirmed by grep against `com.hospital.management/**`:

| Library | Version | Used? | Notes |
|---|---|---|---|
| androidx.core / appcompat / material / constraintlayout / recyclerview / cardview / coordinatorlayout / swiperefreshlayout | mixed | ✅ | Baseline UI deps. |
| androidx.security:security-crypto | 1.1.0-alpha06 | ✅ | `EncryptedSharedPreferences` in [TokenManager.kt:38-74](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt) + [AuthInterceptor.kt:46-66](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt). Alpha. |
| androidx.biometric | 1.1.0 | ✅ | [BiometricHelper.kt](../../android-app/app/src/main/java/com/hospital/management/utils/BiometricHelper.kt). |
| **Compose (7 libs incl. activity-compose, material3, navigation-compose, lifecycle-viewmodel-compose, runtime-livedata, ui-tooling)** | 1.5.x | ❌ **Dead** | 0 `@Composable` functions in source; 0 `setContent { }` blocks. Entire Compose tree is unused. See [01-dead-code §J1](01-dead-code.md). |
| Retrofit + converter-gson | 2.9.0 | ✅ | [ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt). |
| OkHttp + logging-interceptor | 4.12.0 | ✅ | [RetrofitClient.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt). |
| kotlinx-coroutines-android | 1.7.3 | ✅ | pervasive. |
| lifecycle-viewmodel-ktx / livedata-ktx / runtime-ktx | 2.6.2 | ✅ | pervasive. |
| **CameraX (core / camera2 / lifecycle / view)** | 1.3.0 | ❌ **Dead** | 0 imports. ScannerActivity uses `GmsDocumentScanning` which ships its own camera UI. |
| play-services-mlkit-document-scanner | 16.0.0-beta1 | ✅ | [ScannerActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/scanner/ScannerActivity.kt). |
| **androidx.datastore:datastore-preferences** | 1.0.0 | ❌ **Dead** | 0 imports. TokenManager uses EncryptedSharedPreferences, not DataStore. |
| WorkManager | 2.9.0 | ✅ | 4 workers, see §6. |
| **Coil (coil-compose)** | 2.5.0 | ❌ **Dead** | 0 imports (depends on Compose, also dead). |
| Glide | 4.16.0 | ✅ | [ProfileActivity.kt:146, DashboardActivity.kt:297, FileViewerActivity.kt:16, FileAdapter.kt](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt). |
| CircleImageView | 3.1.0 | ✅ | 2 XMLs. |
| **iText7** | 7.2.5 | ❌ **Dead** | 0 Kotlin imports. [PdfUtils.kt:11-12](../../android-app/app/src/main/java/com/hospital/management/utils/PdfUtils.kt) uses `android.graphics.pdf.PdfDocument` + `PdfRenderer` from the framework — iText7 is not referenced anywhere. ~8-10 MB of APK bloat. |
| **accompanist-permissions** | 0.32.0 | ❌ **Dead** | 0 imports. |
| **Facebook Shimmer** | 0.5.0 | ❌ **Dead** | 0 Kotlin imports, 0 `<ShimmerFrameLayout>` in layouts. Only leftover: two `shimmer_base` / `shimmer_highlight` colour tokens in [colors.xml](../../android-app/app/src/main/res/values/colors.xml). |
| Firebase BoM + firebase-analytics-ktx + firebase-messaging-ktx | 32.8.1 | ✅ | [HmsFirebaseMessagingService.kt](../../android-app/app/src/main/java/com/hospital/management/services/HmsFirebaseMessagingService.kt). |
| Room runtime / ktx / compiler | 2.6.1 | ✅ | 4 entities, 3 DAOs, 7 migrations. See §5. |
| junit (testImplementation) | 4.13.2 | ⚠️ | Declared but **zero test files exist** under `test/` or `androidTest/`. |

**7 dead dependencies totalling roughly 10 MB of APK bloat** (Compose tree dominates, followed by iText7). See [`06-tech-debt-ledger.md` TD-A06](06-tech-debt-ledger.md) for removal plan.

---

## 2. Architecture

### 2.1 Pattern

Classic MVVM + Repository + thin UseCase layer, no DI framework, manual `ViewModelFactory` in [ViewModelFactory.kt](../../android-app/app/src/main/java/com/hospital/management/presentation/viewmodel/ViewModelFactory.kt). Navigation is explicit `Intent`-based (no Jetpack Navigation Component, no Compose NavHost).

```
ui/<feature>/*Activity              ──┐
   ↓ ViewModelProvider(…, factory)    │
presentation/viewmodel/*ViewModel ────┤  all three composed together in each
   ↓ UseCase(repo)                    │  Activity's setupViewModel()
domain/usecase/*UseCase          ─────┤  (no container / DI object)
   ↓ repo.foo()                       │
data/repository/*Repository      ─────┤
   ↓ apiService OR dao                │
data/api/ApiService (Retrofit) ───────┘
data/local/* (Room, EncryptedSharedPreferences)
```

### 2.2 Package layout

| Package | Purpose | Notable files |
|---|---|---|
| `com.hospital.management` | Application class | [HospitalApplication.kt](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) |
| `.data.api` | Retrofit wiring | [ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt), [RetrofitClient.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt), [AuthInterceptor.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt) |
| `.data.local` | Room + EncryptedSharedPreferences | [AppDatabase.kt](../../android-app/app/src/main/java/com/hospital/management/data/local/AppDatabase.kt), [TokenManager.kt](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt) + 4 DAOs + 4 entities |
| `.data.models` | Gson DTOs | 5 files, 25+ `data class`es with `@SerializedName` |
| `.data.repository` | Repository layer (4 repos) | `AuthRepository`, `PatientRepository`, `DocumentRepository`, `ProfileRepository` |
| `.domain.usecase` | One-call UseCases wrapping repos | [AuthUseCases.kt](../../android-app/app/src/main/java/com/hospital/management/domain/usecase/AuthUseCases.kt) (6 classes), [PatientUseCases.kt](../../android-app/app/src/main/java/com/hospital/management/domain/usecase/PatientUseCases.kt) (11 classes) |
| `.presentation.viewmodel` | 3 ViewModels + factory | `AuthViewModel`, `PatientViewModel`, `ProfileViewModel`, `ViewModelFactory` |
| `.ui.*` | 27 Activities (all `AppCompatActivity` / ViewBinding) | see §3 |
| `.services` | FCM service | [HmsFirebaseMessagingService.kt](../../android-app/app/src/main/java/com/hospital/management/services/HmsFirebaseMessagingService.kt) |
| `.worker` | 4 WorkManager workers | `DownloadWorker`, `SyncDocumentsWorker`, `OfflineLogoutWorker`, `FcmTokenWorker` |
| `.utils` | Helpers | `SessionManager`, `BiometricHelper`, `NetworkMonitor`, `FileLogger`, `PdfUtils`, `ImageUtils`, `SecurityUtils`, `FolderColorMode`, `FeatureFlags`, `DownloadNotifier`, `DownloadActionReceiver` |

### 2.3 Deviations worth knowing

- **No DI framework.** Every Activity manually wires `apiService`, `tokenManager`, `repo`, `factory` in its own `setupViewModel()` — 7+ identical copies across Dashboard, Admission, Profile, FolderView, FolderDetails, Patients, Upload. This is tech debt ([`TD-A10`](06-tech-debt-ledger.md)) but not a bug.
- **ViewModels do not hold a `Context`.** All platform access goes through the Repository → UseCase pipeline. Clean.
- **UseCases are single-method `operator fun invoke()` wrappers.** Zero domain logic inside them; they forward to the repo. Current value is low (an indirection per call); removing them would shrink the codebase by ~60 LOC without losing anything ([`TD-A11`](06-tech-debt-ledger.md) — discuss first).
- **No Fragment usage.** Every screen is an Activity. Mobile navigation back stack is the Activity stack.
- **Compose is dependency-loaded but unused.** Either commit to Compose or remove the dependency ([`TD-A06`](06-tech-debt-ledger.md)).

---

## 3. Screen inventory (27 Activities)

| Activity | Package | File | Guard | Launched from | Notes |
|---|---|---|---|---|---|
| SplashActivity | `ui.splash` | [SplashActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/splash/SplashActivity.kt) | public | LAUNCHER | Only `android:exported="true"`. Version-gate (`/api/version`) + session-validate before routing to Login or Dashboard. |
| LoginActivity | `ui.auth` | [LoginActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/auth/LoginActivity.kt) | public | Splash / Session-revoked / Logout | Two-step login; biometric optional; pre-login `POST /session/check-conflict` before password POST. |
| AuthCodeVerificationActivity | `ui.auth` | [AuthCodeVerificationActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/auth/AuthCodeVerificationActivity.kt) | public (tempToken in intent) | LoginActivity | 6-digit authCode step; auto-submit on 6th char. |
| ChangePasswordActivity | `ui.auth` | [ChangePasswordActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/auth/ChangePasswordActivity.kt) | public (tempToken) | LoginActivity (mustChangePassword branch) | First-login forced password reset. |
| ForgotPasswordActivity / …OtpActivity / …ResetActivity | `ui.auth` | 3 files | public | LoginActivity "Forgot?" link | 3-step forgot flow. Separate activities, not Fragments. |
| RegisterActivity / RegisterOtpActivity | `ui.auth` | 2 files | public | LoginActivity "Register" link | Self-service registration. |
| DashboardActivity | `ui.dashboard` | [DashboardActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt) | authed | Login / Splash / AuthCodeVerify / ChangePassword | Landing screen; patient list inline, search + swipeRefresh + sync badge. |
| AdmissionActivity | `ui.admission` | [AdmissionActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/admission/AdmissionActivity.kt) | authed | Dashboard FAB | Create patient (name + remarks). |
| PatientDetailsActivity | `ui.patients` | [PatientDetailsActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/patients/PatientDetailsActivity.kt) | authed | **nothing** — reachable only via intent-crafting | 🟡 **orphan screen** (DashboardActivity routes patient taps to FolderViewActivity directly). Edit Patient button wired but unreachable. |
| PatientListActivity | `ui.patients` | [PatientListActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/patients/PatientListActivity.kt) | authed | **nothing** | 🟡 **orphan screen** — DashboardActivity shows the patient list inline. |
| FolderViewActivity | `ui.folders` | [FolderViewActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderViewActivity.kt) | authed | DashboardActivity (patient tap) | Grid of folders for one patient. Edit Patient dialog lives here. Download-all FAB. |
| FolderDetailsActivity | `ui.folders` | [FolderDetailsActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderDetailsActivity.kt) | authed | FolderViewActivity | Files in one folder. Upload + download per file. |
| FileViewerActivity | `ui.folders` | [FileViewerActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FileViewerActivity.kt) | authed | FolderDetailsActivity | Signed-URL fetch → Glide (images) or PdfRenderer (pdf). In-app viewer. |
| ScannerActivity | `ui.scanner` | [ScannerActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/scanner/ScannerActivity.kt) | authed | FolderDetailsActivity | Launches ML Kit document scanner; hands pages to UploadActivity. |
| UploadActivity | `ui.upload` | [UploadActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/upload/UploadActivity.kt) | authed | ScannerActivity | Preview scanned pages → compress → upload (online) or queue offline. |
| ProfileActivity | `ui.profile` | [ProfileActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/profile/ProfileActivity.kt) | authed | Dashboard overflow menu | Logo + name + address + change-email/phone (OTP). |
| SessionsActivity | `ui.profile` | [SessionsActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/profile/SessionsActivity.kt) | authed | Dashboard / FCM deep-link | Lists active sessions, reveal auth code. |
| ChangePasswordSettingsActivity | `ui.profile` | [ChangePasswordSettingsActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/profile/ChangePasswordSettingsActivity.kt) | authed | Dashboard overflow menu | Settings-flow password change. |
| NotificationsActivity | `ui.profile` | [NotificationsActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/profile/NotificationsActivity.kt) | authed | Dashboard overflow menu | Notification prefs toggles. |

**Exported / deep-link summary:** only `SplashActivity` is `exported="true"` (MAIN/LAUNCHER). **No `intent-filter` with `<data>` block anywhere** — no deep links, no custom schemes. The `<queries>` block in the manifest is for outbound `ACTION_VIEW` resolution (opening downloaded PDFs / images), not inbound.

**Orphan screens (declared in manifest + navigable-in-theory but never `startActivity`'d from code):** `PatientListActivity`, `PatientDetailsActivity` (see table). Candidates for removal — see [`01-dead-code.md` §J5](01-dead-code.md).

**Navigation graph** (flowchart) is in [`03-architecture-diagrams.md` §19](03-architecture-diagrams.md).

---

## 4. API surface (what the app calls)

55 Retrofit methods declared on `interface ApiService` ([ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt)). Plus two bare OkHttp calls: `/api/auth/refresh-token` from [AuthInterceptor.kt:198-242](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt) and `/api/auth/logout` from [OfflineLogoutWorker.kt:96-103](../../android-app/app/src/main/java/com/hospital/management/worker/OfflineLogoutWorker.kt). Every call is HTTPS to `https://hospital-management-8lbf.onrender.com` (hardcoded in [RetrofitClient.kt:18](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt)).

### 4.1 Endpoints called by Android

| Endpoint | Method | Called by | Matches backend? | Notes |
|---|---|---|---|---|
| `/api/auth/login` | POST | AuthRepository.login | ✅ | Sends both `identifier` AND `email` (legacy compat) — backend accepts either. |
| `/api/auth/login/verify-auth-code` | POST | AuthRepository.verifyAuthCodeLogin | ✅ | Bearer tempToken. |
| `/api/auth/change-password` | POST | ChangePasswordActivity | ✅ | Bearer PASSWORD_CHANGE tempToken. |
| `/api/auth/register` | POST | RegisterActivity | ✅ | Multipart optional. Sends `tcAccepted=true`, `tcVersion=1.0`. |
| `/api/auth/register/verify-otp` | POST | RegisterOtpActivity | ✅ | |
| `/api/auth/register/resend-otp` | POST | RegisterOtpActivity | ✅ | |
| `/api/auth/forgot-password/init` | POST | AuthRepository.forgotPasswordInit | ✅ | |
| `/api/auth/forgot-password/verify` | POST | AuthRepository.forgotPasswordVerify | ✅ | |
| `/api/auth/forgot-password/reset` | POST | AuthRepository.forgotPasswordReset | ✅ | Bearer PASSWORD_RESET tempToken. |
| `/api/auth/password/change` | POST | AuthRepository.changePasswordSettings | ✅ | In-session change, bearer access token. |
| `/api/auth/refresh-token` | POST | AuthInterceptor.performRefresh (bare OkHttp, not Retrofit) | ✅ | Sends `refreshToken` in body. Backend rotates (TD-002) — Android picks up new refresh via `newRefresh` check at [AuthInterceptor.kt:229-232](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt). Compatible. |
| `/api/auth/logout` | POST | AuthRepository.logout + OfflineLogoutWorker | ✅ | Direct call; if offline, a bare-OkHttp worker retries until ack. |
| `/api/auth/biometric/register` | POST | AuthRepository.registerBiometric | ✅ | Sends `{publicKey, deviceId}`. |
| `/api/auth/biometric/challenge` | POST | LoginActivity | ✅ | No auth; pre-login. Returns `{challenge, hospitalId}`. |
| `/api/auth/biometric/verify` | POST | LoginActivity | ✅ | Returns `LoginResponse` (fresh tokens). |
| `/api/auth/session/check-conflict` | POST | LoginActivity | ✅ | Pre-login preview; **returns 200 with `conflict: bool` regardless of credential validity** — effectively a login-less enumeration signal (see [§8 security](#8-security-surface)). |
| `/api/auth/session/validate` | GET | SplashActivity + HospitalApplication heartbeat + HmsFirebaseMessagingService (post-push) | ✅ | 60 s heartbeat while foreground — see §6.3. |
| `/api/auth/session/force-logout` | POST | Declared on ApiService but **0 call sites** | ⚠️ dead in app | Likely leftover from an earlier "kick other device" UX. |
| `/api/auth/session/reverify-auth-code` | POST | BaseActivity reverify dialog | ✅ | Fires in response to 401 `AUTH_CODE_REQUIRED`. |
| `/api/auth/session/list` | GET | AuthRepository.listSessions | ✅ | |
| `/api/auth/session/revoke/:id` | POST | AuthRepository.revokeSession | ✅ | |
| `/api/auth/session/revoke-all-others` | POST | AuthRepository.revokeAllOtherSessions | ✅ | |
| `/api/auth/fcm-token` | POST | LoginActivity + HmsFirebaseMessagingService + FcmTokenWorker | ✅ | Fire-and-forget on login; worker handles retry if not yet authed. |
| `/api/health` | GET | (Not called via Retrofit — NetworkMonitor uses raw HttpURLConnection at [NetworkMonitor.kt:134](../../android-app/app/src/main/java/com/hospital/management/utils/NetworkMonitor.kt)) | ✅ | 20 s timeout (Render.com cold-start tolerant). 30 s cadence when online, 2 s when offline. |
| `/api/hospitals/me` | GET | DashboardActivity + ProfileActivity + SessionsActivity | ✅ | SessionsActivity reads the `authCode` field here (masked UI; reveal toggle). |
| `/api/hospitals/me` | PATCH (multipart / JSON) | ProfileRepository.patchProfile | ✅ | Multipart when logo, JSON otherwise. |
| `/api/hospitals/me/change-contact/init` | POST | ProfileRepository.initContactChange | ✅ | |
| `/api/hospitals/me/change-contact/verify` | POST | ProfileRepository.verifyContactChange | ✅ | |
| `/api/hospitals/me/notification-preferences` | GET / PUT | NotificationsActivity | ✅ | |
| `/api/hospitals/:id` | GET | ApiService.getHospitalById declared but **0 call sites** | ⚠️ dead in app | Server supports, client never asks. |
| `/api/patients` | POST / GET | PatientRepository | ✅ | GET uses `limit + skip + search?`. No cursor — offset-based. |
| `/api/patients/:patientId` | GET / PUT | PatientRepository | ✅ | |
| `/api/patients/:patientId/folders` | POST | PatientRepository | ✅ | Body `{folderName}`. |
| `/api/patients/:patientId/files/:folderName` | GET / POST (multipart) | PatientRepository | ✅ | POST sends `Idempotency-Key` and `X-Upload-Profile: Int` — **backend ignores `X-Upload-Profile`** (no middleware reads it). See §9 drift. |
| `/api/patients/:patientId/files/:folderName/:fileId/rename` | PATCH | PatientRepository | ✅ | |
| `/api/patients/:patientId/files/:folderName/:fileId` | DELETE | ApiService.deleteFile declared, called from FileAdapter long-press | ✅ | |
| `/api/patients/:patientId/files/:folderName/:fileId/signed-url` | GET | FileViewerActivity | ✅ | 5-min TTL signed URL; Android refetches per view. |
| `/api/patients/:patientId/files/:folderName/:fileId/compressed` | GET (streaming) | FolderDetailsActivity single-file compressed download | ✅ | Gated by `FeatureFlags.USE_COMPRESSION_SERVICE = true`. |
| `/api/patients/:patientId/download/zip/size-check` | GET | FolderViewActivity | ✅ | |
| `/api/patients/:patientId/download/zip` | POST (streaming, with/without body) | FolderViewActivity | ✅ | Two ApiService methods — one with `ZipDownloadRequest{selectedFolders}`, one with no body. Both POST the same URL. |
| `/api/patients/:patientId/download/pdf` | POST (streaming) | FolderViewActivity | ✅ | Body `Map<String,String>` — **Android never populates `mode`**; backend defaults to `merged`. |
| `/api/patients/:patientId/folders/:folderName/download/zip` | GET (streaming) | PatientRepository.downloadFolderZip | ✅ | |
| `/api/patients/:patientId/folders/:folderName/download/pdf` | GET (streaming) | PatientRepository.downloadFolderPdf | ✅ | |
| `/api/patients/:patientId/download/pdf` | GET (legacy) | PatientRepository.downloadAllPdf → `downloadAllPdfLegacy` | ✅ | Current active path. |
| `/api/patients/:patientId/download/zip` | GET (legacy) | PatientRepository.downloadAllZip → `downloadAllZipLegacy` | ✅ | |
| `/api/version` | GET | SplashActivity version gate | ✅ | `?platform=android&currentVersion=1.0` hard-coded to `1.0` unless PackageInfo has a different value. |
| `/api/export/archive` | POST (streaming) | ApiService.exportArchive declared but **0 call sites** | ⚠️ dead in app | Backend also has no web caller (see [01-dead-code.md §F](01-dead-code.md)). Likely fully dead. |

### 4.2 Endpoints the app DOES NOT call (but backend exposes)

These were labelled `MOBILE_ONLY` in [`01-dead-code.md §F`](01-dead-code.md). Updated status now that Android is in scope:

| Endpoint | 01-dead-code §F presumed | Actually |
|---|---|---|
| `POST /api/auth/login/resend-auth-code` | MOBILE_ONLY | ❌ **Dead** — not called from Android either. [ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) does not declare it; AuthCodeVerificationActivity has no "Resend" button. |
| `POST /api/auth/session/force-logout` | MOBILE_ONLY | ⚠️ Declared in `ApiService.forceLogoutOtherSessions` but no Activity calls it. Likely an earlier-design leftover. |
| `GET /api/patients/:id/files/:folder/:fileId/stream` | MOBILE_ONLY | ❌ **Not Android** — Android uses `/signed-url` + direct CDN fetch. The `/stream` route is web-only (inline PDF viewer). |
| `GET /api/export/sample-cover`, `/api/notifications/sample`, `/api/notifications/preview`, `/api/notifications/test` | UNUSED? | ✅ **DELETED 2026-04-25 (TD-030)** — all four endpoints removed; `/api/notifications` mount dropped entirely. |
| `POST /api/export/archive` | INVESTIGATE | ❌ **Dead** — not called from Android. Safe to delete. |
| `POST /api/auth/register-hospital` | (admin-only) | ❌ **Not Android** — admin-initiated; admin console is web-only. Backend confirms the `verifyAdmin` middleware. Android uses `/register` self-service. |

See updated drift in [`00-drift.md` §12](00-drift.md).

### 4.3 Contract mismatches

| # | Claim | Reality | Severity |
|---|---|---|---|
| D1 | Android sends `X-Upload-Profile` header with every file upload. | Backend never reads it (`grep -rn "X-Upload-Profile\|uploadProfileUsed" backend/` returns zero). The `uploadProfileUsed` column in [OfflineDocument.kt:25-26](../../android-app/app/src/main/java/com/hospital/management/data/local/OfflineDocument.kt) and the CLAUDE.md mention of "Cloud Run can use this to skip aggressive re-compression" is aspirational — no Cloud Run path exists. Bytes on the wire per upload × no backend consumer. | 🟡 Medium — tracked as [TD-A13](06-tech-debt-ledger.md). |
| D2 | `DownloadWorker.KEY_STATUS_URL` branch (Cloud Run polling) is designed and tested. | **Zero enqueuers pass `KEY_STATUS_URL`**. [FolderDetailsActivity](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderDetailsActivity.kt) only uses the direct-URL path. The polling branch ([DownloadWorker.kt:541-608](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt)) is unreachable dead code today — but architecturally sound and left in place for the compression-sidecar Phase 3C integration. Keep as intentional hold, document. | 🟡 Medium — document in CLAUDE.md. |
| D3 | 401 classification is done by substring-matching the error body (`body.contains("SESSION_CONFLICT")`, `"AUTH_CODE_REQUIRED"`, `"ACCOUNT_DISABLED"`). | Backend error payloads are JSON; a rewording of any message would silently break the classifier. | 🟠 High — tracked as [TD-A07](06-tech-debt-ledger.md). Suggest returning a stable `errorCode` field server-side. |
| D4 | `GET /api/version` expects `currentVersion` query param. | [SplashActivity.kt:73-75](../../android-app/app/src/main/java/com/hospital/management/ui/splash/SplashActivity.kt) passes `packageManager.getPackageInfo(...).versionName`. That's always `"1.0"` today (TD-A03). Once `versionCode` is bumped it'll send the new `versionName`. ✅ correct logic — blocked by TD-A03. | 🟡 Medium (depends on TD-A03). |
| D5 | Backend stores geoip on Session on login. | Android does nothing to surface geoip; SessionsActivity just renders backend-supplied fields. ✅ no mismatch. | ok |
| D6 | `ApiService.listSessions` response DTO `SessionItem.id` accepts `_id` as alternate. | Required — backend returns both `id` and `_id` depending on path. ✅ already wired via `@SerializedName(value="id", alternate=["_id"])`. | ok |

---

## 5. Data model — Room (client-side cache)

`AppDatabase` version `8`, 7 numbered migrations (`1→8` via [AppDatabase.kt:24-110](../../android-app/app/src/main/java/com/hospital/management/data/local/AppDatabase.kt)). `fallbackToDestructiveMigration()` is enabled — any missed migration wipes the DB silently on the next open.

| Entity | Table | Key | Purpose |
|---|---|---|---|
| `OfflineDocument` | `offline_documents` | auto-increment | Queued scans waiting to upload. Includes `owner_hospital_id` (migration `7→8`) so cross-account leaks are impossible: the sync worker refuses to upload rows whose owner ≠ the currently-logged-in hospital, and `SessionManager.logoutUser` deletes rows belonging to the logging-out account. Critical healthcare-compliance guard. |
| `CachedPatient` | `cached_patients` | `id` (Mongo `_id`) | List cache for Dashboard + Detail screens when offline. `foldersJson` column (migration `4→5`) carries serialised folder names + counts to survive Dashboard → Detail navigation without a server fetch. |
| `CachedFileItem` | `cached_file_items` | composite `(fileId, patientId, folderName)` | Folder-file list cache; served when FolderDetails opens offline. |
| `DownloadCache` | `download_cache` | `contentHash` (sha256 of URL ± Last-Modified) | Client-side download cache up to 500 MB LRU-evicted. Used by `DownloadWorker`. |

### 5.1 DAO behaviours worth knowing

- [DocumentDao.deleteAllForHospital](../../android-app/app/src/main/java/com/hospital/management/data/local/DocumentDao.kt) and `.deleteAllNotOwnedBy` are the load-bearing queries for the cross-account-leak guard. Called from both `SessionManager.logoutUser` and `SyncDocumentsWorker` start — defense in depth.
- [DocumentDao.resetStuckUploading](../../android-app/app/src/main/java/com/hospital/management/data/local/DocumentDao.kt) runs at worker entry to unstick rows left in `UPLOADING` by a previous crashed worker run.
- [DocumentDao.observePendingCount](../../android-app/app/src/main/java/com/hospital/management/data/local/DocumentDao.kt) is a `Flow<Int>` subscribed by `DashboardActivity.observePendingBadge` to drive the toolbar sync badge live.
- [DownloadCacheDao.getEvictionCandidates](../../android-app/app/src/main/java/com/hospital/management/data/local/DownloadCacheDao.kt) has a 60 s "safety window" — entries touched in the last minute are never evicted, preventing a race where a user is watching a PDF and the backing file is pulled out from under them.

### 5.2 Non-obvious invariants

1. **`CachedPatient.foldersJson`** is intentionally preserved when a list refresh ([PatientRepository.cachePatients](../../android-app/app/src/main/java/com/hospital/management/data/repository/PatientRepository.kt#L75-L98) lines 81-85) happens — the list endpoint doesn't return folder arrays, so without this the Detail cache gets clobbered by a List refresh. Breaking this one check re-introduces the bug fixed in migration `4→5`.
2. **`OfflineDocument.idempotencyKey`** is generated once and reused across retries — see [DocumentRepository.newIdempotencyKey](../../android-app/app/src/main/java/com/hospital/management/data/repository/DocumentRepository.kt#L78-L81). The server uses it via `uploadIdempotencyGuard` (backend [patient.routes.js:97-109](../../backend/src/routes/patient.routes.js)) to dedupe a succeeded-but-client-dropped upload. Do not regenerate on retry.
3. **`OfflineDocument.ownerHospitalId`** must be non-empty; the `7→8` migration sets `""` for existing rows, and the sync worker treats `''` as orphaned → deletes.

---

## 6. Background work (WorkManager + FCM)

Three `CoroutineWorker`s + one plain `FirebaseMessagingService`. All workers are tagged and uniquely-named to survive duplicate enqueues.

| Component | Class | Unique work name / tag | Trigger | Notes |
|---|---|---|---|---|
| Upload sync | `SyncDocumentsWorker` | `"auto_sync_documents"` (ExistingWorkPolicy.KEEP) | (a) app foreground → HospitalApplication.scheduleSyncIfNeeded; (b) network-regained via NetworkCallback; (c) manual toolbar "Sync" in DashboardActivity | Auth-gate + cross-account guard + `resetStuckUploading` at entry. Max 5 retries per doc. |
| Download | `DownloadWorker` | `"download_<url.hashCode()>"` (REPLACE) + `TAG_DOWNLOAD` | FolderDetailsActivity single-file download when `FeatureFlags.USE_DOWNLOAD_WORKER = true` | Foreground service (`FOREGROUND_SERVICE_DATA_SYNC`). HEAD-then-GET with resume via `Range` header; `saveToMediaStore` on success. Tag lets `SessionManager.logoutUser` cancel all in-flight downloads. |
| FCM token catch-up | `FcmTokenWorker` | one-shot, NO unique name | Enqueued from `HmsFirebaseMessagingService.onNewToken` when no access token is available yet | Reads `pending_fcm_token` from `fcm_prefs` SharedPreferences. Not EncryptedSharedPreferences — plain. Low-sensitivity data. |
| Offline logout | `OfflineLogoutWorker` | `"offline_logout_<token.hashCode()>"` (KEEP) | `SessionManager.logoutUser` when direct `/api/auth/logout` call fails | **Uses a bare OkHttp client, not RetrofitClient** — avoids AuthInterceptor recursion. Treats any 4xx as success (session already gone). |

### 6.1 Foreground service rules

- DownloadWorker declares `FOREGROUND_SERVICE` + `FOREGROUND_SERVICE_DATA_SYNC` (manifest lines 9-10). The manifest also merges a `SystemForegroundService` override with `android:foregroundServiceType="dataSync"` ([AndroidManifest.xml:151-154](../../android-app/app/src/main/AndroidManifest.xml)). API 34+ requires both.
- `setForeground(...)` must fire within ~10 s of `doWork()` entry on API 31+, which is why [DownloadWorker.kt:133-147](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt) promotes BEFORE parsing optional input. Don't re-order.

### 6.2 FCM flow

`HmsFirebaseMessagingService.onMessageReceived` dispatches by `data["type"]`: `NEW_LOGIN` shows a grouped summary notification that deep-links to SessionsActivity; `SESSION_REVOKED` is **validated against the server first** ([HmsFirebaseMessagingService.kt:104-129](../../android-app/app/src/main/java/com/hospital/management/services/HmsFirebaseMessagingService.kt)) before being acted on — the push is account-scoped, so a revoke on device A must not kick device B. `PASSWORD_CHANGED` opens SessionsActivity. Anything else falls through to the launcher.

### 6.3 Application-level heartbeats + network callbacks ([HospitalApplication.kt](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt))

- `startSessionHeartbeat()` hits `GET /api/auth/session/validate` every 60 s while the app is foregrounded. Catches SESSION_CONFLICT that happens without the user triggering an API call. Stops on background.
- `registerNetworkCallback()` fires `scheduleSyncIfNeeded()` whenever the OS reports a network becoming available — drives offline-queued uploads to upload on reconnect without user intervention.
- `applicationScope = SupervisorJob() + Dispatchers.Main`. ActivityLifecycleCallbacks counts references to decide foreground.

---

## 7. Auth flow (from the client side)

Canonical path (passwords):

```
LoginActivity.login()
  → POST /auth/session/check-conflict   (pre-flight peek; NOT authenticated)
  → user confirms if conflict
  → AuthViewModel.login()
      → POST /auth/login
      → branch by response:
          requirePasswordChange=true → ChangePasswordActivity (tempToken PASSWORD_CHANGE)
          requireAuthCode=true       → AuthCodeVerificationActivity (tempToken AUTH_CODE)
          else                       → LoggedIn directly (biometric path only)
  → POST /auth/login/verify-auth-code   (in AuthCodeVerificationActivity)
  → LoginActivity biometric-enrolment dialog (if hospital never enrolled on this device)
  → navigateToDashboard()
```

**Biometric path (subsequent logins):**

```
LoginActivity.performBiometricLogin(hospitalId)
  → POST /auth/biometric/challenge { identifier, deviceId }
      → backend returns { challenge, hospitalId }
  → verify returned hospitalId == keystore-alias-bound hospitalId
     (if not → wipe local state, force password login)
  → BiometricPrompt with CryptoObject(SHA256withRSA.initSign(keystoreKey))
      → on success: sig = SHA256withRSA(challenge.toByteArray())
  → POST /auth/biometric/verify { hospitalId, deviceId, signature }
      → backend returns LoginResponse with fresh accessToken + refreshToken
```

**Token storage:** `accessToken`, `refreshToken`, `hospital_id`, `hospital_name`, `hospital_logo_url`, `device_id`, `user_email`, `temp_token`, `session_timestamp`, biometric flags — all in a single `EncryptedSharedPreferences` file named `"secure_hospital_prefs"` ([TokenManager.kt:22-44](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt)). Key scheme AES256-GCM, value scheme AES256-GCM, key-key scheme AES256-SIV. Corruption-recovery path ([TokenManager.kt:50-74](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt)) wipes + rebuilds the file, last-resort falls back to plain SharedPreferences to avoid a crash loop — rare but real on devices with Keystore issues.

**401 handling** — `AuthInterceptor.intercept()` ([AuthInterceptor.kt:78-169](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt)):

1. Peek 1 024 bytes of error body.
2. If body contains `"SESSION_CONFLICT"` or `"signed in on another device"` → broadcast `ACTION_SESSION_REVOKED` with reason `SESSION_CONFLICT`, return 401 as-is.
3. If body contains `"ACCOUNT_DISABLED"` → broadcast with reason `ACCOUNT_DISABLED`.
4. If body contains `"AUTH_CODE_REQUIRED"` or `"AUTH_CODE_STALE"` → broadcast `ACTION_AUTH_CODE_REQUIRED` (BaseActivity shows reverify dialog).
5. Otherwise assume access-token expiry: bare-OkHttp `POST /api/auth/refresh-token`, save new `accessToken` + (if present) new `refreshToken`, retry the original request **once**. Monitor `refreshLock` prevents parallel-401 stampede.

**Session expiry tracking** — client-side `SessionManager.SESSION_TIMEOUT_MS = 7 days` ([SessionManager.kt:24](../../android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt)). SplashActivity `isSessionValid` treats anything older than 7 days without interaction as expired. Intentionally aligned with the server's 7-day mobile Auth Code re-verify (CLAUDE.md §5); prior value was 15 min which caused false logouts.

Diagrams in [`03-architecture-diagrams.md` §21 (state machine), §22 (password sequence), §23 (biometric sequence), §24 (token refresh)](03-architecture-diagrams.md).

---

## 8. Security surface

OWASP Mobile Top 10 (2024) mapping in [`04-enhancements.md` §6.1](04-enhancements.md). Highlights:

- **🔴 Release keystore is the debug keystore** ([app/build.gradle:36-41](../../android-app/app/build.gradle)) + `release.keystore` checked in. `TD-A01` / `TD-A02`.
- **🟠 401 classification via body-substring match** ([AuthInterceptor.kt:96-120](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt)) — fragile to backend message rewording. `TD-A07`.
- **🟡 FileLogger writes on-device logs in release** ([FileLogger.kt:39-46](../../android-app/app/src/main/java/com/hospital/management/utils/FileLogger.kt)) under `/sdcard/Android/data/com.hospital.management/files/logs/`, 7-day retention. OkHttp redacts `Authorization`/`Cookie`/`Set-Cookie` but **not `X-Hospital-Id`** (attached by every request, see [AuthInterceptor.kt:181](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt)). Request URLs also contain hospital IDs (e.g. `GET /api/patients/SH-000001/...`). Low-to-medium PII on disk if a user hands over a rooted device. `TD-A08`.
- **🟡 Pre-login `POST /session/check-conflict` accepts `{identifier}` unauthenticated** and returns 200 with `conflict: bool` + `activeDevice` details. If the identifier does not belong to any hospital, behaviour is backend-side (need verify) — if it returns the same 200 both ways, safe; if it distinguishes, it's an account-enumeration surface. Confirm with backend team. See [LoginActivity.kt:130-188](../../android-app/app/src/main/java/com/hospital/management/ui/auth/LoginActivity.kt).
- **🟡 Root detection** only toasts a warning ([HospitalApplication.kt:63-66](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt)). Hospital-compliance policies should decide whether to block.
- **🟡 No certificate pinning** ([network_security_config.xml:11-13](../../android-app/app/src/main/res/xml/network_security_config.xml)) — removed because Render.com rotates certs via Google Trust Services and pinning caused `SSLPeerUnverifiedException` after every rotation. System-CA trust is the fallback. If a DoH/DoT attacker can swap a system CA this is weakened; acceptable for current risk model.
- **✅ Tokens stored in `EncryptedSharedPreferences`** (`AES256-GCM` values, `AES256-SIV` keys).
- **✅ `allowBackup=false`** + `backup_rules.xml` + `data_extraction_rules.xml` exclude sharedprefs/DB/files from auto-backup and device-transfer ([AndroidManifest.xml:31](../../android-app/app/src/main/AndroidManifest.xml), [backup_rules.xml](../../android-app/app/src/main/res/xml/backup_rules.xml), [data_extraction_rules.xml](../../android-app/app/src/main/res/xml/data_extraction_rules.xml)).
- **✅ `usesCleartextTraffic=false`** globally; localhost/10.0.2.2 cleartext allowed for dev ([network_security_config.xml](../../android-app/app/src/main/res/xml/network_security_config.xml)).
- **✅ Biometric key per-hospitalId** ([BiometricHelper.kt:33-37, 75-100](../../android-app/app/src/main/java/com/hospital/management/utils/BiometricHelper.kt)): alias `"hospital_biometric_key_<id>"`, `setUserAuthenticationRequired(true)` + `setInvalidatedByBiometricEnrollment(true)` — correctly invalidated by new fingerprint.
- **✅ Only `SplashActivity` exported** ([AndroidManifest.xml:44](../../android-app/app/src/main/AndroidManifest.xml)). `FileProvider` declared `exported=false`. FCM service explicit `exported=false`. DownloadActionReceiver explicit `exported=false`.
- **✅ FileProvider paths scoped to app-private directories** ([file_paths.xml](../../android-app/app/src/main/res/xml/file_paths.xml)) — no external/shared exposure.
- **✅ `PendingIntent.FLAG_IMMUTABLE`** used on every `PendingIntent.get*()` call (DownloadNotifier, HmsFirebaseMessagingService).

---

## 9. Notable quirks a new engineer would miss

Forward-port of CLAUDE.md §11 with live-code citations.

1. **[R8 rules in proguard-rules.pro are load-bearing for release login](../../android-app/app/proguard-rules.pro#L212-L242).** Section 17 ("GAPS identified during release-build login debugging") keeps `com.hospital.management.domain.**` fully, preserves Kotlin metadata + coroutine `Continuation`, and keeps `TypeToken` — without any one of these the release APK login throws `ClassCastException` or `ClassNotFoundException`. Reverifying the rule set is a load-bearing step before any Kotlin/AGP/R8 bump.
2. **Cross-account-leak guard.** Logging out deletes every queued upload owned by the logging-out hospital; the sync worker refuses to touch rows owned by other accounts, including legacy rows with `owner_hospital_id=''`. Healthcare-compliance net — don't weaken. [SessionManager.kt:159-173](../../android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt), [SyncDocumentsWorker.kt:62-71](../../android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt).
3. **Refresh-token rotation handled client-side.** Backend rotates on every `/refresh-token`; the bare-OkHttp refresh path at [AuthInterceptor.kt:228-232](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt) saves the new refresh token when present. If this branch is ever removed (e.g. a naive "just keep accessToken" refactor), every subsequent refresh will replay the rotated-out token and — per TD-002 — kill every active session + email the hospital.
4. **Heartbeat loop is foreground-only.** The 60 s `GET /auth/session/validate` loop runs while at least one Activity is started; it's stopped in `onActivityStopped` at zero-refs. Designed so a SESSION_CONFLICT on another device is noticed before the user tries to do something, but without burning battery when backgrounded.
5. **`DownloadWorker.KEY_STATUS_URL` branch is intentionally dormant.** The polling flow for Cloud Run / sidecar status exists but has no caller today. Keep for compression-sidecar Phase 3C. See §4.3 D2.
6. **`X-Upload-Profile` header is Android-only.** Backend ignores it; the column in `OfflineDocument` and the API declaration are vestigial. Either wire up a backend consumer or drop the header ([TD-A13](06-tech-debt-ledger.md)).
7. **`fallbackToDestructiveMigration()` is enabled on AppDatabase.** Any missed numbered migration wipes the Room DB silently. When adding a new entity or column, write a migration; skipping one and shipping is not a safe option since queued uploads would be lost.
8. **`PatientListActivity` and `PatientDetailsActivity` are orphan screens.** The Dashboard routes straight to `FolderViewActivity`, and the Patient edit dialog lives on FolderViewActivity, not PatientDetails. Don't add features to the orphans — they're candidates for deletion (`TD-A09`).
9. **`GlobalScope.launch` at [DashboardActivity.kt:241-254](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt).** Deliberate — the coroutine survives the `finish()` that happens two lines later. Annotated `@OptIn(DelicateCoroutinesApi)`. Not tech debt.
10. **FileLogger only activates in release.** Debug builds skip `init()` ([FileLogger.kt:42](../../android-app/app/src/main/java/com/hospital/management/utils/FileLogger.kt)) because Android Studio Logcat covers debug. If you're debugging a release-only issue, bump `HttpLoggingInterceptor.Level` from `HEADERS` to `BODY` in [RetrofitClient.kt:73](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt) — but revert before shipping, as BODY writes payloads to disk.

---

## 10. "Read this first" — new-senior-Android onboarding order

12 files, in order, for ~90 min of focused reading before the first commit:

1. [CLAUDE.md](../../CLAUDE.md) §§5, 11 — auth model + web/Android split.
2. [android-app/app/build.gradle](../../android-app/app/build.gradle) + [proguard-rules.pro](../../android-app/app/proguard-rules.pro) — build red flags + R8 rules that must survive.
3. [AndroidManifest.xml](../../android-app/app/src/main/AndroidManifest.xml) — exported surfaces, permissions, foreground service type.
4. [HospitalApplication.kt](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) — app-level lifecycle, heartbeat, sync scheduling.
5. [RetrofitClient.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt) + [AuthInterceptor.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt) — network stack + 401 classification + token refresh.
6. [TokenManager.kt](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt) — everything that lives in EncryptedSharedPreferences.
7. [SessionManager.kt](../../android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt) — the one canonical logout path; read carefully.
8. [LoginActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/auth/LoginActivity.kt) — check-conflict → login → verify-auth-code → biometric enrolment.
9. [BaseActivity.kt](../../android-app/app/src/main/java/com/hospital/management/ui/base/BaseActivity.kt) — broadcast receivers + reverify dialog + inset handling.
10. [AppDatabase.kt](../../android-app/app/src/main/java/com/hospital/management/data/local/AppDatabase.kt) + 4 DAOs.
11. [SyncDocumentsWorker.kt](../../android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt) + [DownloadWorker.kt](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt) — the two long-running pipelines.
12. [HmsFirebaseMessagingService.kt](../../android-app/app/src/main/java/com/hospital/management/services/HmsFirebaseMessagingService.kt) — FCM dispatch + deep-link intents.

---

## 11. What's missing (delta vs a healthy Android app)

| Gap | Impact | Mitigation |
|---|---|---|
| **No tests at all** (0 files under `test/` or `androidTest/`). | No regression safety net. Release-breaking R8 rule drift has no automated catch. | [TD-A12](06-tech-debt-ledger.md) — add a Robolectric smoke suite for `AuthInterceptor.refresh`, `SessionManager.logoutUser` cross-account guard, and `DownloadWorker` happy path. |
| **No DI.** Every Activity hand-wires Retrofit + Repository + UseCase. | ~60 LOC duplication; harder to inject test doubles. | [TD-A10](06-tech-debt-ledger.md) — Hilt migration. |
| **No analytics / no crash reporter.** Firebase Analytics is added to the BoM but `logEvent` calls are zero. Crashlytics is NOT in the BoM. | Production crashes invisible. Release-only login bugs took days to diagnose via FileLogger + adb. | [TD-A14](06-tech-debt-ledger.md) — add Crashlytics + strip from debug. |
| **`versionCode 1` forever.** | Blocks Play Store second upload. | [TD-A03](06-tech-debt-ledger.md). |
| **Debug keystore used for release.** | Blocks Play Store first upload. | [TD-A01](06-tech-debt-ledger.md). |
| **KSP migration pending** (Room still on kapt). | Slower incremental builds. | [TD-A04](06-tech-debt-ledger.md). |
| **No in-app update API.** The version gate shows a dialog + opens Play; Google's `AppUpdateManager` would deliver smoother UX. | Minor. | Backlog. |
| **Admin nav not surfaced on mobile.** CLAUDE.md §10 flags this; web-only admin. | By design. | — |

---

*This document is the canonical Android reference. All cross-cutting findings (dead code, diagrams, enhancements, tech debt) live in the numbered ledgers — see the companion-doc list at the top.*
