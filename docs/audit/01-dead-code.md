# Dead Code Inventory — Hospital Management System

**Verified at commit:** `61fa6ad` (2026-04-26, branch `main`)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-26 (re-verified against HEAD; §F endpoints reconfirmed clean post-TD-030 sweep; §J Android items still open)

Each finding has a confidence rating (`HIGH` / `MEDIUM` / `LOW`) and a recommended action (`DELETE` / `INVESTIGATE` / `KEEP-WITH-COMMENT` / `MOBILE_ONLY?`).

---

## A. Frontend npm Dependencies — ℹ️ RECLASSIFIED 2026-04-25 (INTENTIONAL, gallery-only)

| Package | Version | Import count in `frontend/src/` | Status |
|---|---|---|---|
| `recharts` | ^3.8.1 | 1 (only [ComponentsPreview.tsx:19](../../frontend/src/pages/ComponentsPreview.tsx)) | ✅ **KEEP — gallery-only, lazy-loaded (intentional).** Isolated to the `ComponentsPreview-*.js` code-split chunk via `React.lazy()` at [AppRoutes.tsx:30](../../frontend/src/routes/AppRoutes.tsx) (see TD-011). Zero bytes in the main bundle; dep only loads when a visitor hits `/components-preview`. The `/components-preview` gallery is design-reference and kept by product decision. |
| `lucide-react` | ^1.8.0 | 1 (only [ComponentsPreview.tsx:15](../../frontend/src/pages/ComponentsPreview.tsx)) | ✅ **KEEP — same story.** Same lazy chunk; same rationale. |

All other `frontend/package.json` deps are live (`react`, `react-dom`, `react-router-dom`, `axios`, `@headlessui/react`).

**Do NOT re-flag these on future audits.** They are gallery-only but intentionally retained; the lazy-load in `AppRoutes.tsx` was shipped precisely to make the "unused in the main bundle" concern moot.

---

## B. Unused Backend npm Dependencies — ✅ RESOLVED 2026-04-21 (TD-012)

| Package | Version | Status |
|---|---|---|
| `@getbrevo/brevo` | ^5.0.3 | ✅ Removed from [backend/package.json](../../backend/package.json); `node_modules/@getbrevo` confirmed gone. |
| `axios` | ^1.5.0 | ✅ Removed from [backend/package.json](../../backend/package.json); `node_modules/axios` confirmed gone. |

All other backend deps are live (verified via grep).

---

## C. Unused Frontend Exports / Components — ✅ RESOLVED 2026-04-21 (TD-010)

| Path:Symbol | Status |
|---|---|
| `components/CountdownTimer.tsx` | ✅ Deleted. |
| `components/SkeletonLoader.tsx` | ✅ Deleted. |
| `components/Toast.tsx` | ✅ Deleted. |
| `components/PasswordConfirmModal.tsx` | ℹ️ Did not exist on disk; stale reference from the prior audit. |
| `services/patientApi.ts` | ✅ Deleted entire file. Dashboard's inline fetcher was already the only live patient-list caller. |
| `services/hospitalService.ts:listAppVersions` / `createAppVersion` / `updateAppVersion` + `AppVersion` interface | ✅ Removed along with default-export entries. |

Verification: `npx tsc --noEmit` clean; `npx vite build` succeeds (2591 modules).

**Not dead** (verified against earlier false positives): `useInactivityTimeout` IS imported by [useAuth.tsx:16](../../frontend/src/hooks/useAuth.tsx).

---

## D. Unused Backend Exports / Files

Re-verified at HEAD 2026-04-25.

| Path:Symbol | Type | Inbound imports | Confidence | Status / Action |
|---|---|---|---|---|
| [services/r2.service.js](../../backend/src/services/r2.service.js) (entire file; 8 exports) | service | 0 | HIGH | **Still dead — open (TD-003).** DELETE file + `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` deps. Cloudinary is the only storage path the code uses. |
| [services/mail.service.js:sendLogoutConfirmationEmail](../../backend/src/services/mail.service.js) | named export | **1 (was audit false-positive)** | — | ✅ **NOT DEAD** — called at [auth.controller.js:1265](../../backend/src/controllers/auth.controller.js#L1265) (imported at [auth.controller.js:12](../../backend/src/controllers/auth.controller.js#L12)). Prior audit missed the logout-confirmation path. Keep. |
| [services/token.service.js:cleanupExpiredSessions](../../backend/src/services/token.service.js) | named export | 0 | HIGH | ✅ **DELETED 2026-04-25** — removed along with the default-export entry. Mongo TTL index on `Session.expiresAt` (`expireAfterSeconds: 0`) handles cleanup automatically; no invoker remains. |
| [middleware/validateRequest.js](../../backend/src/middleware/validateRequest.js) | module | **4 (was audit false-positive)** | — | ✅ **NOT DEAD** — `handleValidationErrors` (and `sanitizeRequest`) are imported by [auth.routes.js:39](../../backend/src/routes/auth.routes.js#L39), [patient.routes.js:11](../../backend/src/routes/patient.routes.js#L11), [export.routes.js:9](../../backend/src/routes/export.routes.js#L9), and [notifications.routes.js:9](../../backend/src/routes/notifications.routes.js#L9). Prior audit only searched for the filename, not the exported symbols. Keep. |

---

## E. Unused Tailwind Tokens — ✅ RESOLVED 2026-04-21 (TD-018)

| Token | Status |
|---|---|
| `animate-shimmer` / `bg-shimmer` / `keyframes.shimmer` in [tailwind.config.js](../../frontend/tailwind.config.js) | ✅ Removed. Three orphan entries (`backgroundImage.shimmer`, `animation.shimmer`, `keyframes.shimmer`) deleted. The only live shimmer effects (`globals.css:14-22` via `.skeleton`; inline `animation: "shimmer ..."` in `LoadingSpinners.tsx`) redeclare their own `@keyframes shimmer` and were left untouched. |

All other custom tokens (primary colour scale, surface, gradient-primary, etc.) are referenced.

---

## F. Endpoints with Zero Frontend Callers — ✅ VERIFIED 2026-04-25 against Android HEAD

Every presumed row below was grepped against `android-app/app/src/main/java/` (Android audit landed 2026-04-24). "Confirmed" means the Kotlin tree has both a Retrofit declaration AND at least one call site reaching it through repository / usecase / viewmodel / activity. "Dead (both clients)" means zero callers in either `frontend/src/` or `android-app/app/src/main/java/`.

| Endpoint | FE callers | Android callers | Status (2026-04-25) |
|---|---|---|---|
| `POST /api/auth/register` | 0 | ✅ [ApiService.kt:27](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) + RegisterActivity chain | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/register/verify-otp` | 0 | ✅ [ApiService.kt:32](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/register/resend-otp` | 0 | ✅ [ApiService.kt:37](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/biometric/register` | 0 | ✅ [ApiService.kt:55](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/biometric/challenge` | 0 | ✅ [ApiService.kt:60](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/biometric/verify` | 0 | ✅ [ApiService.kt:65](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/session/check-conflict` | 0 | ✅ [ApiService.kt:78](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/session/force-logout` | 0 | ✅ Declaration **REMOVED 2026-04-25 (TD-030)** on Android; backend route kept as protective admin surface | **Android `forceLogoutOtherSessions` declaration deleted.** Backend route preserved — awaiting product call before also removing server-side. |
| `GET /api/auth/session/validate` | 0 | ✅ [ApiService.kt:75](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) + HospitalApplication heartbeat | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/session/reverify-auth-code` | 0 | ✅ [ApiService.kt:84](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/auth/fcm-token` | 0 | ✅ [ApiService.kt:264](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/patients` (create) | 0 | ✅ [ApiService.kt:155](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) → AdmissionActivity | **Confirmed MOBILE_ONLY.** Keep. |
| `PUT /api/patients/:patientId` | 0 | ✅ [ApiService.kt:172](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/patients/:patientId/folders` | 0 | ✅ [ApiService.kt:178](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `POST /api/patients/:patientId/files/:folderName` (upload) | 0 | ✅ [ApiService.kt:191](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) → SyncDocumentsWorker | **Confirmed MOBILE_ONLY.** Keep. |
| `PATCH /api/patients/.../rename` | 0 | ✅ [ApiService.kt:201](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `DELETE /api/patients/.../:fileId` | 0 | ✅ [ApiService.kt:208](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | **Confirmed MOBILE_ONLY.** Keep. |
| `GET /api/patients/.../stream` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Route + `streamFile` handler removed. |
| `POST /api/export/archive` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Backend route + `exportArchive` handler + `generateModulePdf` / `formatModuleName` helpers + unused `archiver` import removed; Android `ApiService.exportArchive` declaration removed. |
| `GET /api/export/sample-cover` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Route + `exportSampleCover` handler + `generateSampleCoverPdf` service dropped. |
| `GET /api/notifications/sample` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Whole `/api/notifications` mount removed; controller + route files deleted. |
| `GET /api/notifications/preview` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Same mount drop. |
| `POST /api/notifications/test` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Same mount drop. |
| `POST /api/auth/login/resend-auth-code` | — | — | ✅ **DELETED 2026-04-25 (TD-030).** Route + `resendLoginAuthCode` handler + `resendAuthCodeCooldown` Map + frontend `authService.resendLoginAuthCode` export + the commented-out VerifyAuthCode scaffolding all removed. **Note:** admin-side resend flow (`POST /api/hospitals/:id/resend-welcome` — the HospitalsList "Resend welcome email" button) is a **different** endpoint and is fully intact. |

**Confirmed MOBILE_ONLY rows:** all 16 keep rows above were verified against the Android tree on 2026-04-25. Do **not** delete.

**Shipped 2026-04-25 (TD-030) — 7 endpoints pruned in one sweep:**

- **Design / testing-only previews:** `GET /api/export/sample-cover`, `GET /api/notifications/sample`, `GET /api/notifications/preview`, `POST /api/notifications/test` (whole `/api/notifications` mount dropped).
- **User-side resend duplicate:** `POST /api/auth/login/resend-auth-code` — admin-side `POST /api/hospitals/:id/resend-welcome` is the surviving and only callable resend path.
- **Backend-only leftover:** `GET /api/patients/.../stream` — no callers; web + Android both use `/signed-url` path.
- **Coordinated server+client drop:** `POST /api/export/archive` backend + Android `ApiService.exportArchive` declaration.

See ledger TD-030 for the full diff.

**Still discuss-first:**

- Backend route `POST /api/auth/session/force-logout` — kept as protective admin surface; Android declaration was removed. Whether to also drop the server side is a product call. Flagged; not in the kill list.

---

## G. Schema Fields with No Read or Write Sites

| Collection.field | Read | Write | Status | Notes |
|---|---|---|---|---|
| `Hospital.tcAccepted` | Admin UI only? | Set at registration | ⚠️ | Written in admin registration. Verify any read/display usage before pruning. |
| `Hospital.tcVersion` | 0 | Written at registration | LOW | Possibly reserved for future compliance reporting. Keep for now. |
| `Hospital.tcAcceptedAt` | 0 | Written | LOW | Same. |
| `Patient.folders[].files[].resourceType` | storage service (delete) | Multer upload | ✅ | Used. |
| `Patient.folders[].files[].accessMode` | storage service (signed vs public URL) | Multer upload | ✅ | Used. |
| `AuditLog.action = "TOTP_*"` (8 values) | 0 | 0 | ❌ | Dead enum members; TOTP feature removed. |
| `AuditLog.action = "RECOVERY_*"` (2 values) | 0 | 0 | ❌ | Dead enum members. |

---

## H. Unused Env Vars — ✅ RESOLVED 2026-04-21 (TD-004)

All 13 dead vars removed from `.env.example`; 11 previously-undocumented vars added with defaults; `REFRESH_TOKEN_EXPIRY` corrected `7d → 365d`. See ledger TD-004 for the full diff.

---

## I. Orphaned Frontend Files

After excluding entry points (`main.tsx`, `App.tsx`, `AppRoutes.tsx`, `MainLayout.tsx`, `vite-env.d.ts`, `globals.css`) and any file imported anywhere: no orphan `.tsx` / `.ts` files found.

---

## Quick Wins — Status

1. ~~Delete `backend/src/services/r2.service.js` + drop `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`~~ — **still open** (tracked as TD-003).
2. ~~Delete `frontend/src/services/patientApi.ts`~~ — ✅ DONE (TD-010).
3. ~~Delete `components/{CountdownTimer,SkeletonLoader,Toast}.tsx`~~ — ✅ DONE (TD-010).
4. ~~Drop backend `@getbrevo/brevo` and `axios`~~ — ✅ DONE (TD-012).
5. ~~Remove TOTP + SMS + legacy SMTP entries from `.env.example`~~ — ✅ DONE (TD-004).
6. ~~Remove dead AuditLog enum members (`TOTP_*`, `RECOVERY_*`)~~ — ✅ DONE (TD-013).
7. ~~Remove `animate-shimmer` / `bg-shimmer` / `keyframes.shimmer` from `tailwind.config.js`~~ — ✅ DONE (TD-018).
8. ~~Decide on `recharts` / `lucide-react` gallery-only deps~~ — ✅ DONE (TD-011). Isolated to a lazy chunk; keep.

**Remaining Quick Win:** TD-003 (R2 service + AWS SDK deps). Net already-shipped impact: smaller bundle, simpler mental model, `.env.example` diffs zero-out.

---

## J. Android Dead Code

Added 2026-04-24 with first-pass Android audit. All items verified against HEAD (`1b3bf22`). Severity applies to `android-app/` only — none of these block server-side work.

### J1. Unused Android dependencies

Seven `implementation` lines in [android-app/app/build.gradle](../../android-app/app/build.gradle) pull in libraries that have **zero import sites in `android-app/app/src/main/java/`**. Combined APK bloat is roughly 8–10 MB release / ~15 MB debug.

| Dep | Line | Confidence | Why it's dead | Recommended Action |
|---|---|---|---|---|
| Jetpack Compose tree (7 artifacts: `compose.ui`, `compose.material3`, `compose.ui:ui-tooling-preview`, `activity-compose`, `navigation-compose`, `lifecycle-viewmodel-compose`, `runtime-livedata`, `compose.ui:ui-tooling` debug) | [84-91](../../android-app/app/build.gradle) | HIGH | 0 `@Composable` functions anywhere in source; 0 `setContent { … }` blocks. Every Activity is ViewBinding XML. | **DELETE** plus set `buildFeatures.compose false` at [line 60](../../android-app/app/build.gradle) and drop `composeOptions` [63-65](../../android-app/app/build.gradle). ~4–5 MB APK. |
| `androidx.datastore:datastore-preferences:1.0.0` | [118](../../android-app/app/build.gradle) | HIGH | 0 imports. `TokenManager` uses `EncryptedSharedPreferences`, not DataStore. | **DELETE**. |
| `androidx.camera:camera-*:1.3.0` (4 artifacts) | [108-112](../../android-app/app/build.gradle) | HIGH | 0 imports. ML Kit Document Scanner ships its own camera UI. | **DELETE** all four. ~1 MB. |
| `io.coil-kt:coil-compose:2.5.0` | [124](../../android-app/app/build.gradle) | HIGH | 0 imports; Compose itself is unused. | **DELETE**. |
| `com.itextpdf:itext7-core:7.2.5` | [133](../../android-app/app/build.gradle) | HIGH | 0 imports. [PdfUtils.kt](../../android-app/app/src/main/java/com/hospital/management/utils/PdfUtils.kt) uses `android.graphics.pdf.PdfDocument` + `PdfRenderer` from the framework — iText7 is never referenced. The proguard-rules.pro §11 entry ([pro:149-154](../../android-app/app/proguard-rules.pro)) that keeps `com.itextpdf.**` is guarding a dep no longer used. | **DELETE** dep + drop proguard §11 + drop `-dontwarn org.bouncycastle.**` / `org.slf4j.**`. ~2–3 MB (iText is chunky). |
| `com.google.accompanist:accompanist-permissions:0.32.0` | [136](../../android-app/app/build.gradle) | HIGH | 0 imports; accompanist is Compose-only. | **DELETE**. |
| `com.facebook.shimmer:shimmer:0.5.0` | [139](../../android-app/app/build.gradle) | HIGH | 0 Kotlin imports, 0 `<ShimmerFrameLayout>` in layouts. The only residue is `shimmer_base` / `shimmer_highlight` colour tokens in [colors.xml:68-70](../../android-app/app/src/main/res/values/colors.xml) + [values-night/colors.xml:62-64](../../android-app/app/src/main/res/values-night/colors.xml). | **DELETE** dep + drop unused colour tokens + drop proguard §15. |

Tracked as [`06-tech-debt-ledger.md` TD-A06](06-tech-debt-ledger.md).

### J2. Declared Retrofit methods with zero call sites

Re-verified at HEAD 2026-04-26.

| Method | `ApiService.kt` line | Status | Recommended Action |
|---|---|---|---|
| `getHospitalById(@Path id)` | [17](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) | 0 call sites | Backend supports; remove from `ApiService` until a caller materialises. |
| ~~`forceLogoutOtherSessions`~~ | — | ✅ **DELETED 2026-04-25 (TD-030).** Android declaration removed. Backend route preserved as protective admin surface — see §F. | done |
| ~~`exportArchive(@Body body: Map<String,Any>)`~~ | — | ✅ **DELETED 2026-04-25 (TD-030).** Android declaration + backend route + `archiver` dep all removed in coordinated drop — see §F. | done |

### J3. Orphan UI widget

- [`ui/components/GlassAppBar.kt`](../../android-app/app/src/main/java/com/hospital/management/ui/components/GlassAppBar.kt) — custom `View` subclass, 0 references in XML layouts or Kotlin. Sibling widgets `GlassCardView` and `GradientBlobBackground` ARE used (e.g. `activity_register.xml`, `activity_admission.xml`). **DELETE** `GlassAppBar.kt`.

### J4. Dead header on every upload

- `POST /api/patients/:id/files/:folder` includes `X-Upload-Profile: Int` ([ApiService.kt:196-197](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt), [DocumentRepository.kt:34-36, 47](../../android-app/app/src/main/java/com/hospital/management/data/repository/DocumentRepository.kt)). Backend grep confirms **zero consumers** (`rg "X-Upload-Profile|uploadProfileUsed" backend/`). The corresponding `OfflineDocument.uploadProfileUsed` column + `PdfUtils.PdfResult.profileUsed` surface were added for a Cloud Run compression path that was never built. See `android.md §4.3 D1`. **Two options**: (a) remove the header + column now (`TD-A13`); (b) leave for Phase 3C sidecar integration. Confirm direction first.

### J5. Orphan Activities (declared in manifest, never `startActivity`'d)

| Activity | Manifest line | Inbound call sites | Notes |
|---|---|---|---|
| `ui.patients.PatientListActivity` | [123](../../android-app/app/src/main/AndroidManifest.xml) | 0 | Dashboard renders the patient list inline; no code path opens PatientListActivity. |
| `ui.patients.PatientDetailsActivity` | [124](../../android-app/app/src/main/AndroidManifest.xml) | 0 | Edit-Patient dialog lives on [FolderViewActivity](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderViewActivity.kt); Dashboard routes taps straight there. |

Both are candidates for **DELETE** (plus their layouts + manifest entries). Any future "patient detail" screen would replace the FolderView header rather than resurrect this one. Tracked as [`TD-A09`](06-tech-debt-ledger.md).

### J6. Dead unit-test harness

- [android-app/app/build.gradle:146-148](../../android-app/app/build.gradle) declares `junit:4.13.2` and `androidx.test.ext:junit`/`espresso-core` but there are **zero test files** under `android-app/app/src/test/` or `android-app/app/src/androidTest/`. Keep the declarations (removing them would block `TD-A12`'s test seed) but add at least one smoke test so the Gradle task is validated in CI.

### J7. Feature flag flipped permanently

- [`utils/FeatureFlags.kt`](../../android-app/app/src/main/java/com/hospital/management/utils/FeatureFlags.kt) declares two `const val`s:
  - `USE_DOWNLOAD_WORKER = true` — gates the WorkManager single-file download path in [FolderDetailsActivity.kt:404](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderDetailsActivity.kt). The legacy inline-HTTP single-file fallback (`legacyDownloadFile`) is still kept for rollback. Bulk-download legacy plumbing was removed 2026-04-25 in commit `8d8956f`; the per-file fallback survives.
  - `USE_COMPRESSION_SERVICE = true` — gates the per-file `…/compressed` sidecar path. Both branches still exist in code.
Both flags are safe to inline + delete the file (`TD-A15`) **once** the per-file legacy-download branch is also removed.

### J8. DownloadWorker polling branch — ✅ NO LONGER DORMANT (2026-04-25)

- [DownloadWorker.kt:198](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt) now calls `pollUntilReady(statusUrl, ...)` whenever a server-side merge is in progress — DownloadWorker drives every bulk download (folder PDF/ZIP, patient PDF/ZIP) and falls into the polling branch when the sidecar streams a status URL instead of immediate bytes. The "INTENTIONAL_FEATURE_HOLD" classification from the 2026-04-24 audit is obsolete — keep the branch.
