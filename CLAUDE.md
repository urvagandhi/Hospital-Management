# CLAUDE.md — Hospital Management System

Condensed context for future Claude sessions. For deep detail see:
- [Audit index](docs/audit/README.md) — start here
- [Drift report](docs/audit/00-drift.md) — what changed since the last audit
- [Dead code](docs/audit/01-dead-code.md), [Commented code](docs/audit/02-commented-code.md)
- [Architecture diagrams](docs/audit/03-architecture-diagrams.md) — 17 Mermaid diagrams derived from code
- [Enhancements](docs/audit/04-enhancements.md) — OWASP + performance + onboarding + scaling cliffs
- [Tech debt ledger](docs/audit/06-tech-debt-ledger.md) — prioritised backlog
- Refreshed [backend](docs/audit/backend.md), [frontend](docs/audit/frontend.md), [features](docs/audit/features.md)
- [Existing SRS](doc/HMS_SRS_v2_0.docx) and [end-to-end PDF](doc/end_to_end_flow.pdf)

## 1. What this product is

A multi-tenant hospital records system. Each hospital gets one login and stores patient records as folder-grouped files (PDFs and images). Primary user surface is an **Android app** (file upload + offline cache) plus a **React web app** (read-mostly admin/management). A Python **compression sidecar** merges and size-shrinks PDFs for download/export.

## 2. Repo layout

```
backend/              Node.js + Express + Mongoose API (primary service)
frontend/             React 18 + TypeScript + Vite + Tailwind web app
android-app/          Kotlin app (Room v4 offline cache, WorkManager sync)
compression-service/  Python 3.12 + FastAPI PDF sidecar (pikepdf, GhostScript)
doc/                  Design/SRS references, NOT generated docs
docs/audit/           THIS audit's detailed reports
docker-compose.yml    Local stack
.env.example          All backend env vars
```

## 3. Tech stack at a glance

| Layer | Stack |
|---|---|
| Backend | Node.js (ESM) · Express · Mongoose 7 · MongoDB · Upstash Redis (with in-memory fallback) · JWT · bcryptjs · Multer · Cloudinary · Brevo (prod email) / Mailtrap (dev) · Firebase Admin (FCM) · pdfkit / pdf-lib · archiver · node-cron · pino (structured logs) + pino-http (request ids) |
| Frontend | React 18 · TypeScript 5 · Vite · Tailwind CSS 3 · React Router 6 · Axios · Headless UI · React Context (no Redux/Zustand) |
| Android | Kotlin · Room v4 · WorkManager (unique workers) · Retrofit · BiometricPrompt · FCM |
| Sidecar | FastAPI · pikepdf · pypdfium2 · fpdf2 · GhostScript · Motor (async Mongo) |

## 4. Data model (MongoDB)

Five collections:
- **hospitals** — account (unique email/phone/authCode), role (`admin` | `hospital`), bcrypt `passwordHash`, `authCode` (immutable 6-digit), `logoUrl`, brute-force counters, `biometricKeys[]`, `fcmToken`, `notificationPrefs`, `patientIdCounter`.
- **patients** — `hospitalId` (FK), human-readable `patientId` like `SH-000001`, `patientName`, `remarks`, embedded `folders[]` each with `files[]` (fileName, fileUrl, size, mimeType, cloudinaryPublicId, thumbnailUrl, `accessMode` public|signed).
- **sessions** — `hospitalId`, `deviceId` (SHA256 of UA), platform, `authCodeVerifiedAt`, revocation info. Compound unique index `(hospitalId, deviceId)`.
- **auditlogs** — `userId`, `action` (40+ enum values), `status`, IP, UA, metadata. Indexed for user/action + time.
- **appversions** — per-platform `minVersion` / `latestVersion` / `forceUpdate` flag. Updated via manual script.

Sidecar also writes `merged_pdf_cache` and `compression_audits` collections.

## 5. Auth model (critical, mobile-aware)

- **Roles:** `admin` (full) vs `hospital` (scoped to own data).
- **Login:** two-step — password (`POST /api/auth/login` → tempToken, purpose=AUTH_CODE) then 6-digit Auth Code (`.../verify-auth-code` → access+refresh tokens). Auth Code step is strict on every mobile email/password login; only biometric bypasses it.
- **Tokens:** access (24 h, `JWT_SECRET`) + refresh (365 d, `REFRESH_TOKEN_SECRET`, httpOnly cookie) + tempTokens (10–15 min, purpose-scoped). **Refresh tokens ARE rotated on every `/auth/refresh-token`** (shipped 2026-04-21, TD-002). Replaying a rotated-out token revokes every active session for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) and sends a security email. Reuse detection is guarded against post-logout false positives by requiring at least one other active session before escalating. Implementation: [backend/src/services/token.service.js](backend/src/services/token.service.js). Unit coverage: [backend/src/__tests__/refreshToken.rotation.test.js](backend/src/__tests__/refreshToken.rotation.test.js).
- **Mobile session rules:** 1 session per (hospital, deviceId); 3rd mobile login evicts the oldest. After 7 days a mobile session must re-verify the Auth Code (401 `AUTH_CODE_REQUIRED`). Web is multi-session and exempt from the 7-day check.
- **Biometric (Android):** RSA keypair per device; `register` → `challenge` → `verify`. Successful biometric verify resets the 7-day clock.
- **Password policy:** ≥8 chars, upper + lower + digit + special. 5 failed attempts → account lock with email.
- **Forgot password:** 3-step (init → verify OTP → reset); `init` always returns 200 to prevent enumeration.
- **Admin-initiated registration** uses `POST /api/auth/register-hospital` and sends a welcome email with temp password; self-service path uses `/api/auth/register` + OTP.
- **SMS gateway is deferred** — all OTP/2FA goes through email + the immutable Auth Code.

## 6. Core flows

- **Patient ID generation:** `{INITIALS}-{6-digit padded counter}` per hospital, using `hospitals.patientIdCounter`.
- **File pipeline:** Android uploads via multipart → Cloudinary public_id `HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{date}_{hash}`. Files may be `public` or `signed` (5-min TTL). Thumbnails 120×120 for images.
- **Downloads:** per-file, per-folder, or per-patient. PDF merge vs per-folder ZIP modes. Size-check endpoint gates big ZIPs (soft 10 MB, hard 100 MB). Single-file compressed download routes through the sidecar.
- **Compression sidecar:** Node calls `POST /api/folder-download` or `/api/patient-download` with `X-Internal-Secret`; sidecar fetches from Cloudinary, merges with cover page, runs tier ladder (0 digital / 1–4 scanned), uploads result, caches by SHA256 of inputs. Hard timeout 300 s.
- **Auto-delete cron:** nightly 00:00 UTC hard-deletes `patients` older than 90 days and cascades Cloudinary delete. No soft-delete.
- **Audit logging:** fire-and-forget on every sensitive action; `Patient.toJSON` strips internal IDs like `cloudinaryPublicId` before responses.
- **Notifications:** email (Brevo prod / Mailtrap dev) + FCM push; both gated by `notificationPrefs.{newLoginAlert, securityAlerts, marketing}`.

## 7. API surface (counts / see backend.md for full tables)

**59 endpoints total.** Groupings: auth (25), patients (21 = 17 primary + 4 legacy GET aliases), hospitals (12), export (3), audit (2), admin (2), version (1), notifications (3), health (2). Base path: `/api`. Full table in `docs/audit/backend.md` §4.

## 8. Frontend surface

24 routes. Public: `/`, `/login`, `/verify-auth-code`, `/change-password`, `/forgot-password`, `/terms`, `/privacy`, `/components-preview`, `/spinners-preview` (design gallery, unlinked). Authenticated: `/dashboard`, `/patients/:id`, `/patients/:id/folders/:name`, `/profile`, `/password`, `/sessions`, `/notifications`, legacy `/security`. Admin-only: `/register`, `/hospitals`, `/activity`. Catch-all `*` renders `pages/NotFound.tsx` (no silent redirect).

Layout shell: fixed `Navbar` + `MainLayout`. **Navbar** is 3-column: LEFT = app logo + "HospitALL" wordmark → `/dashboard`; CENTER = nav links (Dashboard always, Hospitals admin-gated, gradient-primary underline on active); RIGHT = hospital chip (generic inline-SVG hospital icon + truncated name + live green/red online dot from `useNetworkStatus`) → settings gear (Headless-UI Menu: Account / Security / Sign out) → avatar. Both chip and avatar open `HospitalProfileModal`. No bell, no search input. Admin nav still hidden on mobile (known gap). Standalone pages (Login, VerifyAuthCode, ChangePassword, ForgotPassword, NotFound, Privacy, Terms, LandingPage, HospitalRegistration) live outside `MainLayout` and own their chrome; their "Back" button must use `navigate(-1)` with a `location.key !== "default"` fallback to `/` (not `navigate("/")` directly — that bounces logged-in users to dashboard).

Three hard architectural rules enforced across the app:

1. **Pages inside `MainLayout` must use `min-h-[calc(100vh-4rem)]`, never `min-h-screen`.** MainLayout already provides its own `min-h-screen` + navbar-offset `pt-16`; a child `min-h-screen` compounds to `100vh + 4rem` and forces a phantom scrollbar. Applied across Dashboard, Profile, NotificationSettings, Password, Sessions, HospitalsList, ActivityLog, PatientDetails, FolderView.
2. **Every full-viewport modal MUST `createPortal(..., document.body)` and use `z-[100]`.** The fixed `<nav>` owns `z-50` and creates its own stacking context — any inline modal inside Navbar, or inside any positioned+z-indexed ancestor, will get its backdrop clipped. All existing modals are portaled (sweep done 2026-04-21): `Navbar` logout, `HospitalProfileModal`, `ConfirmDialog`, `DocumentViewer`, `PdfModeModal`, `ZipSizeModal`, `HospitalsList > ModalShell`, `Profile` contact-change modal. Never use `z-50` for a modal — that's the navbar's layer.
3. **Every page sets its tab title via `useDocumentTitle("...")`** (see `hooks/useDocumentTitle.ts`). Without this the previous page's title persists across navigation. **Current violators (2026-04-21):** Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode use `document.title = "..."` directly; ForgotPassword sets no title. Replace with the hook — direct assignment doesn't restore the prior title on unmount.

**Redesign status: COMPLETE** as of 2026-04-21 — every route in `AppRoutes.tsx` is on the shared token vocabulary (see `memory/project_frontend_redesign.md` for the full CTA/badge/avatar recipes). No page-by-page redesign work pending. On `PatientDetails`, the Edit-Patient button + modal are **intentionally commented out** in `pages/PatientDetails.tsx` (four marked blocks: state, handlers, button, modal) — web stays read-only for patient mutations per §11; uncomment to re-enable.

Shared `<Spinner>` component in `components/Spinner.tsx` — variants `heartbeat` (default, generic loading), `scan` (document/download/export/upload), `tri-ring` (fallback). Uses `currentColor`; swap default at the top of `Spinner.tsx` to flip app-wide. `/spinners-preview` hosts a 19-variant showcase. Initial-fetch states use `<PageLoader label="..." />` (`components/PageLoader.tsx`) for a consistent shell across Profile / Sessions / NotificationSettings / HospitalsList.

Avatar fallback across Navbar, LogoHeader, Profile, and HospitalsList uses a single `bg-gradient-primary` via `utils/avatar.ts → getAvatarGradient()`. The signature is preserved for legacy callers but the value is constant — previously a hash-picked palette, now one brand gradient. Callers must render the returned class WITHOUT a `bg-gradient-to-br` prefix.

**Sessions page (`/sessions`)** shows geolocation next to each session's IP, and login / password-change / logout emails include the same. Uses `ip-api.com` (free, no key) via `backend/src/services/geoip.service.js` — 24h cache, private-IP detection (10/8, 172.16/12, 192.168/16, 127/8, ::1, fe80::) falls back to "Local network". Lookup is fire-and-forget on session create so login latency isn't blocked.

State: React Context `AuthProvider`. Tokens in `sessionStorage` (XSS-exposed — flagged for redesign). Hospital object cached in `localStorage` (with logoUrl stripped if >1 KB). Refresh token lives in httpOnly cookie.

API client: `services/api.ts` Axios wrapper with 401 retry (refresh-token rotation), account-disabled detection, base URL from `VITE_API_URL`.

## 9. External integrations & env

- **Cloudinary** (primary storage) — `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `SIGNED_UPLOADS_ENABLED`.
- **R2 / S3** — legacy fallback; `R2_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME`.
- **Brevo** — `BREVO_API_KEY`, sender email/name.
- **Mailtrap** — dev SMTP.
- **Firebase** — `FIREBASE_PROJECT_ID/PRIVATE_KEY/CLIENT_EMAIL`.
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL/TOKEN` (falls back to in-memory silently).
- **Compression sidecar** — `USE_COMPRESSION_SERVICE`, `COMPRESSION_SERVICE_URL`, `COMPRESSION_SERVICE_SECRET` (shared with sidecar's `INTERNAL_API_SECRET`).
- **Security** — `JWT_SECRET`, `REFRESH_TOKEN_SECRET` (64+ chars, no `dev-` prefix in prod).
- **Proxy / IP** — `TRUST_PROXY_HOPS` (default `2`) controls how many hops Express trusts in `X-Forwarded-For`. Must be a specific integer — `true` is rejected by `express-rate-limit` with `ERR_ERL_PERMISSIVE_TRUST_PROXY`. Bump to `3` if Sessions shows internal `10.x`/`172.16.x` IPs after a real login.
- **GeoIP dev override** — `GEOIP_DEV_OVERRIDE_IP=8.8.8.8` forces every geoip lookup to that IP (localhost would otherwise always resolve to "Local network"). Unset before shipping.
- **Firebase alt auth** — `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` (alternative FCM auth paths).
- **OTP config** — `OTP_EXPIRY_MINUTES` (default 10), `OTP_LENGTH` (default 6), `MAX_OTP_ATTEMPTS` (default 5).
- **Logging** — `LOG_LEVEL` (default `info` in prod, `debug` in dev). pino emits JSON in prod, pino-pretty in dev. Every HTTP request has a `request_id` (from `X-Request-Id` header or generated) echoed back on the response and bound to `req.log`; use `req.log.*` inside handlers and module-level `logger` elsewhere. Redact list auto-scrubs Authorization/Cookie headers + top-level + nested `password/newPassword/oldPassword/currentPassword/confirmPassword/token/refreshToken/otp/authCode`. See [utils/logger.js](backend/src/utils/logger.js). `backend/scripts/` intentionally still uses raw `console.*` (CLI operator output).
- Rate limit, frontend URL list.
- See `.env.example` at repo root for the full list. **Drift note (2026-04-21):** `.env.example` is out of sync with code — missing 9 vars referenced in code and containing 13 dead vars (TOTP + SMS + legacy SMTP). See `docs/audit/00-drift.md` §5 for the full diff.

## 10. Known code smells / watch-list

- No form-validation library; validation is hand-rolled and inconsistent across forms.
- Tokens in `sessionStorage` (XSS risk) — consider httpOnly + in-memory.
- Modal patterns still raw-div (not Headless UI Dialog) — OK for now; all are portaled + consistent.
- Unused deps: `recharts`, `lucide-react`.
- Manual UA parsing on `/sessions` (brittle); device-kind detection is best-effort.
- Tailwind class strings long and ternary-heavy.
- Admin nav invisible on mobile viewport.
- Frontend assumes `OTP_LENGTH = 6`; silent break if backend changes.
- Auto-delete is permanent; plan migration before adding any "trash"/restore UI.
- GeoIP uses a free public API (`ip-api.com`, 45 req/min) with no key. Fine for current volume; if usage grows, swap to `ipinfo.io`/`ipapi.co` with a token.
- 🛠️ ~~Refresh token not rotated~~ — RESOLVED 2026-04-21 (TD-002). Rotation + reuse detection shipped. See §5 above.
- **Audit coverage gap.** 8 mutation endpoints do NOT audit-log today (createPatient, updatePatient, createFolder, uploadFile, renameFile, patchMe, updateHospital, deleteOrphans) — violates §12 convention. Tracked as TD-001.
- **`r2.service.js` is dead code** (260 lines, 0 callers) + heavy deps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Tracked as TD-003.
- 🛠️ ~~`services/patientApi.ts` (frontend) is dead code~~ — RESOLVED 2026-04-21 (TD-010). File deleted; Dashboard's inline fetcher was already the only live caller.
- 🛠️ ~~`GET /api/hospitals` has no pagination~~ — RESOLVED 2026-04-21 (TD-005). Cursor pagination + server-side search + first-page totals shipped.
- **Sidecar 504 error body says "100s limit" but real pipeline timeout is 300s.** Tracked as TD-014.
- 🛠️ ~~Backend unused deps: `@getbrevo/brevo`, `axios`~~ — RESOLVED 2026-04-21 (TD-012). Removed from `backend/package.json`; `node_modules` confirmed gone.
- 🛠️ ~~No centralised structured logging; `console.*` scattered across backend with inconsistent prefixes~~ — RESOLVED 2026-04-21 (TD-007). Pino + pino-http + redaction + request-id shipped; 0 `console.*` remain in `backend/src/`.

## 11. Web vs Android — what's shared and what isn't

- **Shared:** entire `/api` surface. Same auth flow, same patient/folder/file model, same audit logging, same compression sidecar integration, same notification prefs.
- **Mobile-only:** biometric auth, FCM push, file upload / rename / delete (web is mostly read-only for mutations), 7-day Auth Code re-verify, single-device enforcement, offline Room cache + WorkManager sync.
- **Web-only:** admin console (`/register`, `/hospitals`, `/activity`), multi-session login, iframe PDF preview, Terms/Privacy/Landing/ComponentsPreview pages.
- When building Android features, any flow that touches file mutations must handle 401 `AUTH_CODE_REQUIRED` and session-conflict revocation.

### Android R8 / ProGuard — release build rules (MANDATORY, 2026-04-21)

Release APK login was failing with a masked "Network error" because R8 rewrote types that Gson/Retrofit reach via reflection. Four rules are now load-bearing in [android-app/app/proguard-rules.pro](android-app/app/proguard-rules.pro) — **do not remove any of them**:

1. `-keep class com.hospital.management.domain.** { *; }` — use-case classes (LoginUseCase etc.) live here; without this rule R8 inlines/renames them and the ViewModelFactory's unchecked cast crashes.
2. `-keep class kotlin.Metadata { *; }` + coroutine Continuation + `RuntimeVisibleAnnotations`/`AnnotationDefault` — without these, Kotlin data classes look like Java POJOs with no constructor to Gson.
3. `-keepclassmembers class com.hospital.management.data.models.** { <init>(...); <fields>; }` + enum keep — preserves Gson's constructor-less instantiation path.
4. `-keep,allowobfuscation,allowshrinking class com.google.gson.reflect.TypeToken` (already present in section 3) — without this, Retrofit suspend calls throw `java.lang.Class cannot be cast to java.lang.reflect.ParameterizedType`.

**API DTO rules:**

- Never use `Map<String, Any>` for a Retrofit `@Body` in new code — Gson resolves `Any` via runtime reflection and this combination is fragile under R8. Use a typed `data class` with `@SerializedName` fields (see `LoginRequest` as the canonical example).
- Every field on every response DTO should be nullable with `= null` default — Gson bypasses Kotlin null-checks via reflection, so a server omission becomes a delayed NPE/ClassCastException at the use-site. Null-check at the caller instead.

**Release-only debugging playbook:**

1. Bump `HttpLoggingInterceptor.Level` in [RetrofitClient.kt](android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt) to `BODY` (temporary — BODY writes payloads to the on-device log file; revert before shipping).
2. `adb logcat AuthViewModel:V LoginActivity:V AuthInterceptor:V OkHttp:V AndroidRuntime:E FileLogger:V *:S > /tmp/hms_logcat.txt`
3. The catch blocks in `AuthViewModel.login` and `LoginActivity.checkConflictThenLogin` are intentionally verbose — they log `e.javaClass.name` + full throwable and surface `ClassName: message` to UI. Keep that verbosity — it's the first line of defense.

### Android — pre-Play-Store publish checklist

The release APK runs correctly via sideload but has never been uploaded to Google Play. Before the first Play upload:

- **Replace debug keystore.** [app/build.gradle](android-app/app/build.gradle) `signingConfigs.release` points to `~/.android/debug.keystore` with alias `androiddebugkey` — Play rejects debug-signed uploads. Generate a real upload keystore with `keytool -genkey -v -keystore release.keystore -alias upload -keyalg RSA -keysize 2048 -validity 10000`, store credentials in `~/.gradle/gradle.properties` (user-level, never commit), back up the keystore in two secure places — losing it means never shipping updates to the same Play listing.
- **Bump `versionCode` on every upload** (Play rejects duplicates). Currently `versionCode 1`, `versionName "1.0"`.
- **Enable Play App Signing** when creating the listing — Google re-signs with their managed release key; your upload key is for uploading only.
- **Upload `app/build/outputs/mapping/release/mapping.txt`** to Play Console after each release so Play can de-obfuscate crash reports.
- **Prefer App Bundle** — `./gradlew bundleRelease` produces `.aab` which lets Play serve per-device-optimized APKs. Smaller downloads than a fat APK.
- **Manifest declares `FOREGROUND_SERVICE_DATA_SYNC`** (for DownloadWorker) — this is a "special permission" on API 34+ and must be disclosed in Play Data Safety.
- **Privacy Policy URL** — Play requires a publicly reachable URL; [frontend/src/pages/Privacy.tsx](frontend/src/pages/Privacy.tsx) exists, confirm it's reachable at a stable URL.
- Full checklist (15 items incl. optional items like in-app update API, targetSdk currency, FileLogger privacy disclosure) is in `memory/project_android_play_store_checklist.md`.

## 12. Conventions (do not violate without discussion)

- All patient-touching endpoints **must** audit-log via `logAudit()` / `AuditLog.create()` and strip internal IDs (`cloudinaryPublicId`, `resourceType`, `accessMode`) via `Patient.toJSON`. **As of 2026-04-21 this rule has 8 known violations** — see `docs/audit/00-drift.md` §10. Fix any existing mutation endpoint you touch.
- Admin-only routes enforced server-side (`verifyAdmin`). Do not rely only on FE hiding.
- `GET /api/audits` is admin-only, hospital-scoped — `userId` is forced server-side, do not accept it from client.
- Folder names are slugified for Cloudinary paths; never send raw names as public_ids.
- Signed URLs TTL = 5 min; cache them no longer than that.
- Audit writes are fire-and-forget — never block a request on audit success.
