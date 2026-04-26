# CLAUDE.md — Hospital Management System

Condensed context for future Claude sessions. For deep detail see:
- [Audit index](docs/audit/README.md) — start here
- [Drift report](docs/audit/00-drift.md) — what changed since the last audit (incl. §12 Android)
- [Dead code](docs/audit/01-dead-code.md) (incl. §J Android), [Commented code](docs/audit/02-commented-code.md) (incl. §8 Android)
- [Architecture diagrams](docs/audit/03-architecture-diagrams.md) — 30 Mermaid diagrams (§1–§17 backend/web/sidecar, §18–§30 Android)
- [Enhancements](docs/audit/04-enhancements.md) — OWASP + performance + onboarding + scaling cliffs (incl. §6 Android + OWASP Mobile)
- [Tech debt ledger](docs/audit/06-tech-debt-ledger.md) — prioritised backlog (incl. `TD-A01..TD-A20` Android)
- Refreshed [backend](docs/audit/backend.md), [frontend](docs/audit/frontend.md), [features](docs/audit/features.md), [android](docs/audit/android.md)
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
- **Tokens:** access (24 h, `JWT_SECRET`) + refresh (365 d, `REFRESH_TOKEN_SECRET`, httpOnly cookie) + tempTokens (10–15 min, purpose-scoped). **JWT verification is pinned to HS256** in [utils/jwt.js](backend/src/utils/jwt.js) — without `algorithms: ["HS256"]`, jsonwebtoken accepts `alg: none` and is vulnerable to RS256 swap attacks. **Refresh tokens ARE rotated on every `/auth/refresh-token`** (shipped 2026-04-21, TD-002). Replaying a rotated-out token revokes every active session for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) and sends a security email. Reuse detection is guarded against post-logout false positives by requiring at least one other active session before escalating. Normal refresh-token rotation does NOT mark the rotated-out session row as revoked (it just rewrites the cookie + bumps `lastSeenIp/lastSeenAt`); only real revoke events emit a `revokedReason`. The live enum (per [models/Session.js:66-68](backend/src/models/Session.js)) is `SESSION_CONFLICT` / `ADMIN_REVOKE` / `SUSPICIOUS_ACTIVITY` / `SESSION_LIMIT_EXCEEDED` / `IDLE_TIMEOUT` / `REFRESH_TOKEN_REUSE` (plus `ACCOUNT_DISABLED` / `ACCOUNT_DELETED` from hospitals.controller.js). Each is emitted by exactly one site so audit history can disambiguate cleanly. Implementation: [backend/src/services/token.service.js](backend/src/services/token.service.js). Unit coverage: [backend/src/__tests__/refreshToken.rotation.test.js](backend/src/__tests__/refreshToken.rotation.test.js).
- **Server-side idle revoke (shipped 2026-04-25, mobile exempted 2026-04-26 `61fa6ad`):** [jobs/idleSweep.job.js](backend/src/jobs/idleSweep.job.js) runs every 5 min and revokes any **web** session with `lastSeenAt` older than **60 min** (`revokedReason: "IDLE_TIMEOUT"` + `SESSION_IDLE_REVOKED` audit). **Mobile is exempt from idle revoke** — the cron filters `isMobile: false`. Backgrounded phones stop heartbeating (the 60 s heartbeat only runs while app is foregrounded), so the cron was evicting staff who put their phone down between rounds. Mobile security is still enforced via the 7-day Auth Code re-verification gate + 3-device limit. Threshold was 15 min initially but was too aggressive for hospital workflow (a clinician reading a PDF or filling a long form makes no API calls and looks "idle"). Web has no heartbeat — only mobile heartbeats every 60 s — so anything under ~30 min logs out passive readers mid-task. The Sessions list (`listActiveSessions`) applies the same exemption (`$or: [{isMobile: true}, {isMobile: false, lastSeenAt: {$gt: idleCutoff}}]`) so backgrounded phones don't disappear from the user's session list. **Don't reduce IDLE_MS below 30 min without re-evaluating the heartbeat strategy** — this rule applies to web; mobile already exempt as of `61fa6ad`.
- **Real client IP behind Cloudflare:** [utils/clientIp.js](backend/src/utils/clientIp.js) reads `CF-Connecting-IP` first, then `True-Client-IP`, then `X-Forwarded-For[0]`, then `req.ip`. Render sits behind Cloudflare which strips the original client IP at the TCP layer; without this helper geoip resolves to the Cloudflare PoP (e.g. Singapore for Indian traffic). **Every controller that captures an IP for audit/session/email must call `getClientIp(req)`, never `req.ip` directly.** Auth middleware also re-runs geoip when `lastSeenIp` changes (mobile devices roaming between WiFi/cellular). `lastSeenIp` is rendered alongside `ipAddress` in the Sessions list so users can spot cross-network reuse. Spoofing note: any client reaching the backend NOT via Cloudflare could fake `CF-Connecting-IP`; if higher assurance is needed, gate this on `req.ip ∈ Cloudflare-egress-list` before trusting the header.
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
- **Android download/upload pipeline (Phase 1+2, shipped 2026-04-25):** **All bulk downloads now route through `DownloadWorker`** ([worker/DownloadWorker.kt](android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt)) — folder PDF + folder ZIP + patient PDF + patient ZIP, with the worker accepting JSON request bodies for bulk merges and resuming partial transfers via `RandomAccessFile`. Inline download plumbing was deleted in commit `8d8956f`. **Online direct uploads run through the new `UploadWorker`** ([UploadWorker.kt](android-app/app/src/main/java/com/hospital/management/worker/UploadWorker.kt)) with foreground notifications + byte-level progress (`ProgressRequestBody`); offline-queue uploads go through `SyncDocumentsWorker`, which was promoted to a foreground service in the same wave. Dashboard renders an in-flight `WorkProgressBanner` that aggregates download/upload/sync state. Retry cap was removed (`df13d0f`) — every queued upload must eventually land. `NetworkMonitor` debounces ONLINE↔OFFLINE flips so scanner / background transitions don't flicker (`3573f1a`). Document-scanner page limit bumped 20→30 to match the ML Kit ceiling.
- **Compression sidecar:** Node calls `POST /api/folder-download` or `/api/patient-download` with `X-Internal-Secret`; sidecar fetches from Cloudinary, merges with cover page, runs tier ladder (0 digital / 1–4 scanned), uploads result, caches by SHA256 of inputs. Hard timeout 300 s. Android's `DownloadWorker.pollUntilReady()` IS now used (it polls the sidecar's status URL when a server-side merge is in progress); the "INTENTIONAL_FEATURE_HOLD" note from the 2026-04-24 audit is obsolete — keep the branch.
- **Auto-delete cron:** nightly 00:00 UTC hard-deletes `patients` older than 90 days and cascades Cloudinary delete. No soft-delete.
- **Audit logging:** fire-and-forget on every sensitive action; `Patient.toJSON` strips internal IDs like `cloudinaryPublicId` before responses.
- **Notifications:** email (Brevo prod / Mailtrap dev) + FCM push; both gated by `notificationPrefs.{newLoginAlert, securityAlerts, marketing}`.

## 7. API surface (counts / see backend.md for full tables)

**64 endpoints total** (verified 2026-04-26 against `grep -rE "router\.(get|post|put|patch|delete)" backend/src/routes/` + `app.get` mounts in [index.js:116,138](backend/src/index.js)). Groupings: auth (24), patients (20 = 16 primary + 4 legacy GET aliases), hospitals (12), export (1), audit (2), admin (2), version (1), health (2). Base path: `/api`. TD-030 (2026-04-25) dropped 7 dead endpoints in one sweep: the `/api/notifications` mount (3 endpoints: `/sample`, `/preview`, `/test`), `/api/export/sample-cover`, `/api/export/archive`, `/api/patients/.../stream`, `/api/auth/login/resend-auth-code`. Full table in `docs/audit/backend.md` §4.

`GET /api/patients` uses **cursor pagination** (`limit` clamped 1–100, default 20; opaque `cursor` token; `nextCursor` returned). The legacy `?skip=` shape still works as a fallback but new callers should use the cursor — see [patient.controller.js:80-135](backend/src/controllers/patient.controller.js).

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

**Sessions page (`/sessions`)** shows geolocation next to each session's IP, and login / password-change / logout emails include the same. Provider chain in `backend/src/services/geoip.service.js`: **ipinfo.io** (activated when `IPINFO_TOKEN` is set — 50k/month on the free tier, keyed) → **ip-api.com** keyless fallback (45 req/min/IP). First successful provider wins; timeouts/errors fall through to the next. 24h success cache + 5-min miss cache; private-IP detection (10/8, 172.16/12, 192.168/16, 127/8, ::1, fe80::) falls back to "Local network". Lookup is fire-and-forget on session create so login latency isn't blocked.

State: React Context `AuthProvider`. **Access token is held in module-scoped memory** inside [services/api.ts](frontend/src/services/api.ts) — never persisted to `sessionStorage`/`localStorage` (TD-029, 2026-04-25). Tab-reopen / page-refresh bootstraps a fresh access token via the httpOnly `refreshToken` cookie + `/auth/refresh-token` round-trip in `AuthProvider.useEffect`. The short-lived `tempToken` (10–15 min, mid-login only) and `resetToken` (forgot-password) stay in `sessionStorage` because they need to survive an in-flow page navigation. Hospital object cached in `localStorage` (with logoUrl stripped if >1 KB). Refresh token lives in httpOnly cookie.

API client: `services/api.ts` Axios wrapper with 401 retry (refresh-token rotation), account-disabled detection, base URL from `VITE_API_URL`.

**Route-level error containment:** [App.tsx](frontend/src/App.tsx) wraps everything in a top-level `<ErrorBoundary>`, and [MainLayout.tsx](frontend/src/layouts/MainLayout.tsx) wraps `<Outlet />` in a second `<ErrorBoundary key={location.pathname} fullScreen={false}>` so a render error on one authenticated route can't blank the whole shell. The inner boundary remounts on navigation (the `key` is the pathname) so navigating away clears the error. Don't remove either layer — the inner boundary is the difference between "broken page" and "white screen of death".

## 9. External integrations & env

- **Cloudinary** (primary storage) — `CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET`, `SIGNED_UPLOADS_ENABLED`.
- **R2 / S3** — legacy fallback; `R2_ENDPOINT/ACCESS_KEY_ID/SECRET_ACCESS_KEY/BUCKET_NAME`.
- **Brevo** — `BREVO_API_KEY`, sender email/name.
- **Mailtrap** — dev SMTP.
- **Firebase** — `FIREBASE_PROJECT_ID/PRIVATE_KEY/CLIENT_EMAIL`.
- **Upstash Redis** — `UPSTASH_REDIS_REST_URL/TOKEN`. Dev falls back to an in-memory Map-based store with real TTL semantics; **production refuses to boot without Upstash credentials** ([redis.service.js:81](backend/src/services/redis.service.js)) — the in-memory store is per-process and would silently lose OTPs / partial-reg state across multiple Render workers. Latches to the in-memory store mid-process if Upstash becomes unreachable, but logs `redis_fallback_memory` so this is observable.
- **Compression sidecar** — `USE_COMPRESSION_SERVICE`, `COMPRESSION_SERVICE_URL`, `COMPRESSION_SERVICE_SECRET` (shared with sidecar's `INTERNAL_API_SECRET`). **Mandatory in prod (TD-D4, 2026-04-25):** [config/env.js](backend/src/config/env.js) refuses to boot when `NODE_ENV=production` AND `USE_COMPRESSION_SERVICE !== "true"`. The in-process pdf-lib fallback OOMs at scale on large patients; the sidecar is the only safe production path. Render is already set to `true`. To turn it off in prod requires either swapping the merge path to a natively-streaming Node implementation or accepting the OOM risk for small deployments only.
- **Security** — `JWT_SECRET`, `REFRESH_TOKEN_SECRET` (64+ chars, no `dev-` prefix in prod).
- **Proxy / IP** — `TRUST_PROXY_HOPS` (default `2`) controls how many hops Express trusts in `X-Forwarded-For`. Must be a specific integer — `true` is rejected by `express-rate-limit` with `ERR_ERL_PERMISSIVE_TRUST_PROXY`. Bump to `3` if Sessions shows internal `10.x`/`172.16.x` IPs after a real login.
- **GeoIP dev override** — `GEOIP_DEV_OVERRIDE_IP=8.8.8.8` forces every geoip lookup to that IP (localhost would otherwise always resolve to "Local network"). Unset before shipping.
- **Firebase alt auth** — `FIREBASE_SERVICE_ACCOUNT_JSON` or `FIREBASE_SERVICE_ACCOUNT_PATH` (alternative FCM auth paths).
- **OTP config** — `OTP_EXPIRY_MINUTES` (default 10), `OTP_LENGTH` (default 6), `MAX_OTP_ATTEMPTS` (default 5).
- **Logging** — `LOG_LEVEL` (default `info` in prod, `debug` in dev). pino emits JSON in prod, pino-pretty in dev. Every HTTP request has a `request_id` (from `X-Request-Id` header or generated) echoed back on the response and bound to `req.log`; use `req.log.*` inside handlers and module-level `logger` elsewhere. Redact list auto-scrubs Authorization/Cookie headers + top-level + nested `password/newPassword/oldPassword/currentPassword/confirmPassword/token/refreshToken/otp/authCode`. See [utils/logger.js](backend/src/utils/logger.js). `backend/scripts/` intentionally still uses raw `console.*` (CLI operator output).
- Rate limit, frontend URL list.
- See `.env.example` at repo root for the full list. ~~Drift note (2026-04-21): `.env.example` out of sync with code~~ — RESOLVED 2026-04-21 (TD-004). 13 dead vars removed, 11 undocumented vars added, `LOG_LEVEL` documented. `.env.example` and code are now in sync.

## 10. Known code smells / watch-list

- No form-validation library; validation is hand-rolled and inconsistent across forms.
- 🛠️ ~~Tokens in `sessionStorage` (XSS risk)~~ — RESOLVED 2026-04-25 (TD-029). Access token now lives in module-scoped memory inside [api.ts](frontend/src/services/api.ts); tab-reopen bootstraps via the httpOnly refresh cookie. See §8.
- Modal patterns still raw-div (not Headless UI Dialog) — OK for now; all are portaled + consistent.
- `recharts` + `lucide-react` are gallery-only deps, **intentionally kept** and isolated to the `ComponentsPreview-*.js` lazy chunk via `React.lazy()` in [AppRoutes.tsx:30](frontend/src/routes/AppRoutes.tsx) (TD-011). Zero bytes in the main bundle. Do not re-flag as "unused deps".
- Manual UA parsing on `/sessions` (brittle); device-kind detection is best-effort.
- Tailwind class strings long and ternary-heavy.
- Admin nav invisible on mobile viewport.
- Frontend assumes `OTP_LENGTH = 6`; silent break if backend changes.
- Auto-delete is permanent; plan migration before adding any "trash"/restore UI.
- 🛠️ ~~GeoIP uses a free public API (`ip-api.com`, 45 req/min) with no key~~ — RESOLVED 2026-04-25 (TD-027). Provider chain now prefers keyed `ipinfo.io` when `IPINFO_TOKEN` is set and falls back to `ip-api.com`. See §9.
- 🛠️ ~~Refresh token not rotated~~ — RESOLVED 2026-04-21 (TD-002). Rotation + reuse detection shipped. See §5 above.
- 🛠️ ~~Audit coverage gap~~ — RESOLVED 2026-04-21 (TD-001). All 8 mutation endpoints now emit an audit entry: `PATIENT_CREATED` (createPatient), `PATIENT_UPDATED` (updatePatient), `FOLDER_CREATED` (createFolder), `FILE_UPLOADED` (uploadFile), `FILE_RENAMED` (renameFile), `PROFILE_PATCHED` (patchMe, pre-existing), `HOSPITAL_UPDATED` + activeTransition `PROFILE_PATCHED` (updateHospital), `ORPHAN_CLEANUP` (deleteOrphans). The `AuditLog.action` enum also picked up `PATIENT_FILE_DELETE`, `HOSPITAL_RESEND_WELCOME`, `CONTACT_CHANGE_RESEND`, `AUTH_CODE_RESEND`, `BIOMETRIC_REGISTERED` — these were pre-existing emits the validator had been silently rejecting.
- **`r2.service.js` is dead code** (260 lines, 0 callers) + heavy deps `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`. Tracked as TD-003.
- 🛠️ ~~`services/patientApi.ts` (frontend) is dead code~~ — RESOLVED 2026-04-21 (TD-010). File deleted; Dashboard's inline fetcher was already the only live caller.
- 🛠️ ~~`GET /api/hospitals` has no pagination~~ — RESOLVED 2026-04-21 (TD-005). Cursor pagination + server-side search + first-page totals shipped.
- 🛠️ ~~Sidecar 504 error body said "100s limit" while real pipeline timeout is 300s~~ — RESOLVED 2026-04-21 (TD-014). [folder.py:285](compression-service/app/endpoints/folder.py), [patient.py:301](compression-service/app/endpoints/patient.py), [schemas.py:73](compression-service/app/schemas.py) all now read `"Pipeline exceeded 300s limit"`.
- 🛠️ Sidecar `fetch_source_pdfs` was unbounded `asyncio.gather` — RESOLVED 2026-04-21 (TD-015). Now capped at 10 concurrent downloads via `asyncio.Semaphore` (`_FETCH_CONCURRENCY = 10` in [cloudinary_client.py](compression-service/app/cloudinary_client.py)). Protects against connection-pool saturation + Cloudinary per-IP rate limits on patients with many files.
- 🛠️ ~~Backend unused deps: `@getbrevo/brevo`, `axios`~~ — RESOLVED 2026-04-21 (TD-012). Removed from `backend/package.json`; `node_modules` confirmed gone.
- 🛠️ ~~No centralised structured logging; `console.*` scattered across backend with inconsistent prefixes~~ — RESOLVED 2026-04-21 (TD-007). Pino + pino-http + redaction + request-id shipped; 0 `console.*` remain in `backend/src/`.

## 11. Web vs Android — what's shared and what isn't

- **Shared:** entire `/api` surface. Same auth flow, same patient/folder/file model, same audit logging, same compression sidecar integration, same notification prefs.
- **Mobile-only:** biometric auth, FCM push, file upload / rename / delete (web is mostly read-only for mutations), 7-day Auth Code re-verify, single-device enforcement, offline Room cache + WorkManager sync. Mobile sessions are **exempt from the 60-min idle-revoke sweep** (see §5) — backgrounded phones stop heartbeating, and the 7-day Auth Code gate + 3-device limit cover the security envelope.
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

- 🛠️ ~~Replace debug keystore~~ — RESOLVED 2026-04-25 (TD-A01). [app/build.gradle](android-app/app/build.gradle) `signingConfigs.release` now reads `HMS_UPLOAD_KEYSTORE_PATH` / `HMS_UPLOAD_KEYSTORE_PWD` / `HMS_UPLOAD_KEY_PWD` from env vars (or `~/.gradle/gradle.properties` props `hmsUploadKeystorePath/Pwd/KeyPwd`). `assembleRelease` fails closed when neither source is set. Generation runbook: [android-app/KEYSTORE_SETUP.md](android-app/KEYSTORE_SETUP.md). The actual upload keystore lives at `~/.android/keystores/hms-upload.jks` (alias `hms-upload`, DN `CN=Urva Gandhi, OU=HMS, O=AppicLogics, L=Ahmedabad, ST=Gujarat, C=IN`). **SHA-256 fingerprint** (paste into Play Console when enabling Play App Signing): `BC:35:8B:64:41:0C:3A:01:FF:A6:3A:49:F4:3C:37:92:9C:A3:42:53:61:BF:AA:69:C2:6A:3E:62:E4:C8:C3:50`. The password is NOT in this repo — see private memory `project_android_keystore_credentials.md`. **Operator actions still pending:** (a) backup `hms-upload.jks` + password to 1Password + an offline encrypted drive (single most important step — losing both = forced new package + lose every install), (b) first `./gradlew --stop && ./gradlew assembleRelease` to confirm signing path works end-to-end, (c) `apksigner verify --print-certs` to confirm cert DN matches.
- 🛠️ ~~`android-app/release.keystore` is git-tracked~~ — RESOLVED 2026-04-25 (TD-A02). The file is no longer tracked (was actually removed earlier; `git ls-files` returns empty). Root [.gitignore](.gitignore) hardened with `*.keystore`, `*.jks`, `keystore.properties`, `*.aab` so a future drop into `android-app/` can't accidentally land in git. Per `git check-ignore`, `android-app/release.keystore` is now matched by the rule.
- 🛠️ ~~Bump `versionCode` on every upload~~ — first bump done 2026-04-25 (TD-A03). Currently `versionCode 2` / `versionName "1.0.1"`. **Operator note:** every future release must bump `versionCode` by 1 before `./gradlew bundleRelease`.
- 🛠️ ~~`targetSdk 34` staleness~~ — RESOLVED 2026-04-25 (TD-A03). `compileSdk 35` / `targetSdk 35` in [app/build.gradle](android-app/app/build.gradle). Validate the SDK-35 photo picker / predictive-back behaviour on a physical device before the first Play upload.
- **Enable Play App Signing** when creating the listing — Google re-signs with their managed release key; your upload key is for uploading only.
- **Upload `app/build/outputs/mapping/release/mapping.txt`** to Play Console after each release so Play can de-obfuscate crash reports.
- **Prefer App Bundle** — `./gradlew bundleRelease` produces `.aab` which lets Play serve per-device-optimized APKs. Smaller downloads than a fat APK.
- **Manifest declares `FOREGROUND_SERVICE_DATA_SYNC`** (for DownloadWorker) — this is a "special permission" on API 34+ and must be disclosed in Play Data Safety.
- **`FileLogger` writes on-device logs in release builds** (7-day retention at `Android/data/com.hospital.management/files/logs/`). Disclose in Data Safety ("Diagnostics / Crash logs") OR tighten retention + redact `X-Hospital-Id` via [TD-A08](docs/audit/06-tech-debt-ledger.md).
- **No crash reporter currently** — add Firebase Crashlytics before first Play upload. Tracked as `TD-A14`.
- **Privacy Policy URL** — Play requires a publicly reachable URL; [frontend/src/pages/Privacy.tsx](frontend/src/pages/Privacy.tsx) exists, confirm it's reachable at a stable URL.
- Full checklist (15 items incl. optional items like in-app update API, targetSdk currency, FileLogger privacy disclosure) is in `memory/project_android_play_store_checklist.md`. Android-specific tech-debt items `TD-A01..TD-A20` in [docs/audit/06-tech-debt-ledger.md](docs/audit/06-tech-debt-ledger.md).

### Android — architecture notes worth knowing (added 2026-04-24)

Full Android audit: [docs/audit/android.md](docs/audit/android.md). Summary of what future Claude should not accidentally break:

- **MVVM + Repository + UseCases, no DI framework.** Manual `ViewModelFactory` at [presentation/viewmodel/ViewModelFactory.kt](android-app/app/src/main/java/com/hospital/management/presentation/viewmodel/ViewModelFactory.kt). Every Activity hand-wires Retrofit + Repository; ~7 near-identical copies. Hilt migration is tracked as [TD-A10](docs/audit/06-tech-debt-ledger.md).
- **Jetpack Compose is dependency-loaded but unused.** Zero `@Composable` anywhere; every screen is ViewBinding XML. 7 dead Compose + CameraX + DataStore + Coil + iText7 + Accompanist + Shimmer deps are ~10 MB APK bloat. Tracked as [TD-A06](docs/audit/06-tech-debt-ledger.md).
- 🛠️ ~~Hardcoded base URL across 3 sites~~ — RESOLVED 2026-04-25 (TD-A05). `BASE_URL` is now a `buildConfigField` per buildType in [app/build.gradle](android-app/app/build.gradle), exposed as `BuildConfig.BASE_URL`. `RetrofitClient.BASE_URL` re-exports the BuildConfig value so legacy callers (`OfflineLogoutWorker`) stay green; `HospitalApplication.kt` reads `BuildConfig.BASE_URL` directly. To add staging, switch `release { buildConfigField ... }` per buildType (or add a `productFlavors` block) — no source edit needed.
- **`AuthInterceptor` classifies 401s by substring-matching the response body** (`"SESSION_CONFLICT"`, `"AUTH_CODE_REQUIRED"`, `"ACCOUNT_DISABLED"`). A backend message reword silently breaks this. Coordinated fix (add stable `errorCode` field server-side + switch classifier to JSON lookup) is [TD-A07](docs/audit/06-tech-debt-ledger.md).
- **`X-Upload-Profile` header** is sent by Android on every upload but the backend reads it nowhere. Vestigial. Tracked as [TD-A13](docs/audit/06-tech-debt-ledger.md) — discuss before wiring up vs removing.
- 🛠️ ~~`DownloadWorker.pollUntilReady(statusUrl)` branch has zero callers~~ — RESOLVED 2026-04-25 (Phase 1+2). DownloadWorker now drives every bulk download (folder PDF/ZIP, patient PDF/ZIP), accepts JSON request bodies for bulk merges, and `pollUntilReady` is hit when a server-side merge is in progress. Inline-download plumbing was deleted in `8d8956f`. Companion `UploadWorker` ([UploadWorker.kt](android-app/app/src/main/java/com/hospital/management/worker/UploadWorker.kt)) handles online direct uploads with foreground notifications + byte-level progress; `SyncDocumentsWorker` was promoted to a foreground service in the same wave. Dashboard surfaces all in-flight work via `WorkProgressBanner`.
- **Orphan Android Activities: `PatientListActivity`, `PatientDetailsActivity`** declared in manifest ([AndroidManifest.xml:123-124](android-app/app/src/main/AndroidManifest.xml)) but zero `startActivity` callers. Dashboard routes patient taps straight to `FolderViewActivity`; the patient-edit dialog lives on FolderView, not PatientDetails. Candidates for deletion — [TD-A09](docs/audit/06-tech-debt-ledger.md).
- **Room DB `fallbackToDestructiveMigration()` is on** ([AppDatabase.kt:120](android-app/app/src/main/java/com/hospital/management/data/local/AppDatabase.kt)). Any missed migration wipes queued uploads silently. When changing the schema, write a numbered migration — don't rely on the fallback.
- **Cross-account-leak guard is load-bearing.** On logout, `SessionManager.logoutUser` deletes every queued upload owned by the logging-out hospital; on sync, `SyncDocumentsWorker` refuses to upload rows owned by any other hospital (including legacy `''` rows). [SessionManager.kt:159-173](android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt) + [SyncDocumentsWorker.kt:62-71](android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt). Don't weaken — it's healthcare-compliance.
- **No crash reporter in release.** Only `FileLogger` (on-device, `adb pull` retrieval). Adding Firebase Crashlytics is [TD-A14](docs/audit/06-tech-debt-ledger.md).
- **No tests at all.** Zero files in `test/` or `androidTest/`. Test seed tracked as [TD-A12](docs/audit/06-tech-debt-ledger.md); priority targets are `AuthInterceptor` rotation, `SessionManager` cross-account guard, and Room migration chain.
- **60 s foreground session-validate heartbeat** ([HospitalApplication.kt:157-193](android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt)) + 30 s online `/api/health` polling in [NetworkMonitor](android-app/app/src/main/java/com/hospital/management/utils/NetworkMonitor.kt). Battery-drain combo on cellular; tracked as `TD-A16`.

## 12. Conventions (do not violate without discussion)

- All patient-touching endpoints **must** audit-log via `logAudit()` / `AuditLog.create()` and strip internal IDs (`cloudinaryPublicId`, `resourceType`, `accessMode`) via `Patient.toJSON`. All 8 previously-uncovered mutation endpoints were wired up 2026-04-21 (TD-001); if you add a new mutation handler, emit an audit entry in the same fire-and-forget pattern and register the `action` value in [backend/src/models/AuditLog.js](backend/src/models/AuditLog.js) (the Mongoose `enum` silently rejects unknown values).
- Admin-only routes enforced server-side (`verifyAdmin`). Do not rely only on FE hiding.
- `GET /api/audits` is admin-only, hospital-scoped — `userId` is forced server-side, do not accept it from client.
- Folder names are slugified for Cloudinary paths; never send raw names as public_ids.
- Signed URLs TTL = 5 min; cache them no longer than that.
- Audit writes are fire-and-forget — never block a request on audit success.

## graphify

This project has a graphify knowledge graph at graphify-out/.

Rules:
- Before answering architecture or codebase questions, read graphify-out/GRAPH_REPORT.md for god nodes and community structure
- If graphify-out/wiki/index.md exists, navigate it instead of reading raw files
- For cross-module "how does X relate to Y" questions, prefer `graphify query "<question>"`, `graphify path "<A>" "<B>"`, or `graphify explain "<concept>"` over grep — these traverse the graph's EXTRACTED + INFERRED edges instead of scanning files
- After modifying code files in this session, run `graphify update .` to keep the graph current (AST-only, no API cost)

**Known graph extraction artifacts (verified 2026-04-25 — DO NOT recommend refactors based on these flags without verifying actual edges first):**

- **Bridge-node questions for `logAudit()` / `updateHospital()` / `uploadFile()`** are misleading phrasing. graphify's `suggest_questions` builds the "X bridges A to B" sentence from community labels, not actual edges. `logAudit()` is a hub-spoke (every patient mutation calls it — required by §12), not a bridge. `updateHospital()` and `uploadFile()` ARE genuine cross-cutting concerns (admin/self UI + email side effects; Cloudinary + idempotency + audit + thumbnail) but they represent intentional, correct architecture — leave them alone.
- **Low cohesion on `Architecture Diagrams (30 mermaid)` (0.03) and `Backend API README` (0.02)** is a false alarm. They are doc-hub nodes that reference everything by design; cohesion is the wrong metric. Tagged `is_doc_hub=True` in graph.json on 2026-04-25 (18 nodes total) so future re-clusters skip them.
- **Low cohesion on `redis.service.js` (0.03)** is a false positive. It's a kv-store wrapper holding several unrelated keyspaces (`otp:*`, `partial_reg:*`, `last_otp_sent:*`, `forgot_otp:*`, `reset_token:*`, `idempotent_upload:*`) that don't call each other but live in one file by design. Don't split.
- **"Weakly-connected" nodes** (e.g. `ZipDownloadRequest`, `CachedFileItem`, `CachedPatient`, plus Python docstrings used as labels in `audit.py` / `config.py`) show low edge count because they're DTOs / parameter types, not call-graph nodes. The sidecar is HTTP-isolated from the backend by design — correct architecture, not a documentation gap.
- **Duplicate file nodes** (AST + semantic both create one for the same `.js`/`.ts`/`.kt`/`.md` file at the same `source_file` path) double-count edges and create spurious bridges. We merged 207 such pairs on 2026-04-25 — re-run the dedup pass after every fresh extraction.
- **Generic AST tokens (`Error`, `log()`, `.get()`, `.delete()`, `.post()`, `.constructor()`, `fn()`, `D()`, `connect()`, `cmdSet()`)** are extraction noise — every catch block, every `Log.d()`, every basic accessor becomes a graph node. Prune before reporting top god-nodes (we removed 18 nodes / 250 edges on 2026-04-25).
