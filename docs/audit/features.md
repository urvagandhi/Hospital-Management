# Hospital Management — End-to-End Feature Map (Refreshed)

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-26 — refreshed against `main`. Wave through 2026-04-25 added: TD-001 (audit every mutation), TD-D3 (access token in memory), TD-D4 (sidecar mandatory in prod), JWT pinned to HS256 (`09fae23`), Cloudflare-aware client-IP + server-side idle revoke (`d554a4a` / `7377d76` / `61fa6ad`), distinct revoke reasons (`TOKEN_ROTATION` vs `IDLE_TIMEOUT` vs `REFRESH_TOKEN_REUSE` vs `SESSION_REVOKED` vs `SESSION_LIMIT_EXCEEDED`), cursor pagination on `/api/patients` (`d69f0be`), Android Phase 1+2 (`DownloadWorker` for ALL bulk downloads + `UploadWorker` for online uploads + `SyncDocumentsWorker` foreground). Items marked 🛠️ below.
**Scope:** Every user-facing feature traced from UI → API → DB, across web + Android (mobile parts marked).

Legend: `admin` (super-user), `hospital` (regular user), `both` (any authenticated).

---

## 0. Changes Since Previous Audit (2026-04-20)

- Endpoint map refreshed against backend code (64 endpoints as of 2026-04-26 — verified via `grep -E "router\.(get|post|put|patch|delete)" backend/src/routes/*.js` + 2 inline `/api/health*` mounts in `index.js`. TD-030 dropped 7 dead endpoints in one sweep on 2026-04-25. Corrections in `backend.md` §4 and `00-drift.md` §2).
- `POST /api/hospitals/me/change-contact/resend` added — previously missing from §B2.
- Catch-all `*` on the web renders `NotFound`, not a silent redirect (affects A-series back-navigation flows).
- Web Edit-Patient flow is intentionally commented out (`02-commented-code.md` §1).
- 🛠️ ~~Audit logging missing on 8 mutation endpoints~~ — RESOLVED 2026-04-21 (TD-001, `a118b0a`). All 8 are now wired (`PATIENT_CREATED`, `PATIENT_UPDATED`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED`, `PROFILE_PATCHED`, `HOSPITAL_UPDATED`, `ORPHAN_CLEANUP`). C-series notes below corrected.
- 🛠️ ~~Compression sidecar timeout body says "100s"~~ — RESOLVED 2026-04-21 (TD-014, `73b2ea2`). Now reads "300s".
- 🛠️ JWT verification pinned to HS256 in [utils/jwt.js](../../backend/src/utils/jwt.js) — without `algorithms: ["HS256"]`, jsonwebtoken accepts `alg: none` and is RS256-swap vulnerable (`09fae23`).
- 🛠️ Real client IP resolved via `getClientIp(req)` in [utils/clientIp.js](../../backend/src/utils/clientIp.js): `CF-Connecting-IP` → `True-Client-IP` → `X-Forwarded-For[0]` → `req.ip`. Render sits behind Cloudflare; without this helper geoip resolves to a Cloudflare PoP. Every controller capturing an IP for audit / session / email must call `getClientIp(req)`, never `req.ip` directly (`d554a4a`).
- 🛠️ Distinct revoke reasons are now tracked (no longer one bucket): `TOKEN_ROTATION` (refresh-token rotation churn), `IDLE_TIMEOUT` (60-min server-side sweep, web only), `REFRESH_TOKEN_REUSE` (replay detection), `SESSION_REVOKED` (manual / "sign out all others"), `SESSION_LIMIT_EXCEEDED` (3rd mobile login evicts oldest). Audit history no longer conflates them (`7377d76`).

---

## A. Authentication & Account

### A1. Self-service hospital registration
- **Who:** public (anyone)
- **FE:** mobile app primarily; web `/register` is admin-only (A2). No web self-serve path.
- **BE:** `POST /api/auth/register` → `POST /api/auth/register/verify-otp` → optional `POST /api/auth/register/resend-otp`.
- **DB:** creates `hospitals`, caches OTP in Redis.
- **Gotchas:** 6-digit OTP, 10-min TTL, admin-path is A2.

### A2. Admin-initiated hospital onboarding
- **Who:** admin
- **FE:** `/register` (AdminRoute).
- **BE:** `POST /api/auth/register-hospital` (multipart).
- **DB:** inserts `hospitals` with `mustChangePassword=true`, auto-generated unique `authCode` (via pre-validate hook), sends welcome email. Response includes `tempPassword` for admin visibility.

### A3. Login (web + mobile)
- **Who:** both
- **FE:** `/login` → `/verify-auth-code` (→ `/change-password` if first login).
- **BE:** `POST /api/auth/login` → `POST /api/auth/login/verify-auth-code`. (TD-030, 2026-04-25: `POST /api/auth/login/resend-auth-code` was removed — `auth/login` already issues a fresh tempToken on retry, the dedicated endpoint had no caller.)
- **DB:** reads `hospitals`, creates `sessions` (with `location` sub-doc populated fire-and-forget by GeoIP service via the `ipinfo.io` → `ip-api.com` chain — TD-027), writes `auditlogs`. Client IP is resolved via `getClientIp(req)` to honour Cloudflare headers.
- **Gotchas:** Auth Code strict on every mobile email/password login; biometric bypasses it. Lock at 5 failed attempts (423). Both platforms require Auth Code. JWTs are signed AND verified with `algorithms: ["HS256"]` only — no `alg: none` / RS256-swap acceptance.

### A4. First-login forced password change
- `/change-password` with tempToken `purpose=PASSWORD_CHANGE` → `POST /api/auth/change-password`. Updates `passwordHash`, clears `mustChangePassword`, issues session.

### A5. Forgot password (self-service)
- `/forgot-password` single route, 3-step UI.
- `POST /api/auth/forgot-password/{init,verify,reset}`.
- Init ALWAYS returns 200 (no enumeration). 5 OTP attempts max.

### A6. Biometric login (Android only)
- Mobile-only. `POST /api/auth/biometric/register` (authed) → `/challenge` → `/verify`.
- Writes `hospitals.biometricKeys`, creates session, updates `authCodeVerifiedAt` (resets 7-day clock).

### A7. Session list / revoke
- `/sessions`. `GET /api/auth/session/list`, `POST /api/auth/session/revoke/:id`, `POST /api/auth/session/revoke-all-others`.
- Current session cannot self-revoke; "Sign out all others" keeps current.
- 🛠️ Session list returns `lastSeenIp` alongside `ipAddress` (mobile devices roaming WiFi↔cellular surface a different IP from the one they logged in on); auth middleware re-runs geoip when `lastSeenIp` changes (`7377d76`).
- 🛠️ Server-side idle sweep ([jobs/idleSweep.job.js](../../backend/src/jobs/idleSweep.job.js)) revokes web sessions with `lastSeenAt` older than 60 min (`revokedReason: "IDLE_TIMEOUT"`, audit `SESSION_IDLE_REVOKED`). **Mobile sessions are exempt** (`61fa6ad`) because backgrounded mobile apps make no API calls but are alive. Sessions list filters out web sessions past the same 60-min cutoff so UI matches the sweep instantly.

### A8. Token refresh & session conflict
- `POST /api/auth/refresh-token` (cookie), `POST /api/auth/session/check-conflict`, `POST /api/auth/session/force-logout`.
- Mobile: 1 session per `(hospitalId, deviceId)`; 3rd mobile login across devices evicts the oldest with `SESSION_CONFLICT`.
- Web is multi-session.
- 🛠️ **Refresh token IS rotated** (TD-002, 2026-04-21). Every successful `/auth/refresh-token` issues a brand-new refresh token, persists it on the session doc, and overwrites the httpOnly cookie. Replaying a rotated-out token revokes all active sessions for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) + sends a security email. Reuse detection now requires at least one other active session before escalating, so a logout-then-replay can't false-positive (`30b4477`).
- 🛠️ Revoke reasons are split: `TOKEN_ROTATION` (rotation churn — not a security event), `IDLE_TIMEOUT` (60-min web sweep), `REFRESH_TOKEN_REUSE` (replay), `SESSION_REVOKED` (manual), `SESSION_LIMIT_EXCEEDED` (3rd-mobile eviction), `USER_LOGOUT`. Audit history must not conflate these (`7377d76`).

### A9. 7-day Auth Code re-verification (mobile only)
- `POST /api/auth/session/reverify-auth-code`. Middleware returns 401 `AUTH_CODE_REQUIRED` after 7 days of `authCodeVerifiedAt` staleness. Web exempt.

### A10. Logout
- `POST /api/auth/logout` — marks session `isActive=false`, reason `USER_LOGOUT`, clears refresh cookie.

### A11. FCM token registration (mobile)
- `POST /api/auth/fcm-token` → writes `hospitals.fcmToken.{token, updatedAt}`.

---

## B. Profile, Security & Preferences

### B1. View / edit profile (non-sensitive)
- `/profile`. `GET /api/hospitals/me`, `PATCH /api/hospitals/me` (multipart: name, address, logo).
- 🛠️ Emits `PROFILE_PATCHED` audit (TD-001, 2026-04-21).

### B2. Change email or phone (sensitive)
- `/profile` modal. Three-endpoint flow:
  - `POST /api/hospitals/me/change-contact/init`
  - `POST /api/hospitals/me/change-contact/resend` **(newly documented here; was missing from prior audit)**
  - `POST /api/hospitals/me/change-contact/verify`
- Email change OTP → new email; phone change OTP → current email.

### B3. Change password (in-session)
- `/password`. `POST /api/auth/password/change`. Logs out all other sessions, keeps current.

### B4. Notification preferences
- `/notifications`. `GET/PUT /api/hospitals/me/notification-preferences`.
- `notificationPrefs.{newLoginAlert, securityAlerts, marketing}` gates both email and push paths (see D).

### B5. View Auth Code
- `/sessions` (masked; reveal toggle). No dedicated API — code comes with login payload and lives in auth state.
- Immutable unless admin resend-welcome regenerates (only if `mustChangePassword=true`).

---

## C. Patients & Documents

### C1. List patients
- `/dashboard`. `GET /api/patients`. Scoped to own hospital.
- 🛠️ **Cursor pagination** (TD-D / `d69f0be`, 2026-04-25): `?limit` clamped 1–100 (default 20), opaque `?cursor=<token>`, response carries `nextCursor`. Legacy `?skip=` still works as a fallback for older callers; new callers should use the cursor — see [patient.controller.js:80-135](../../backend/src/controllers/patient.controller.js).

### C2. Create patient
- Mobile primarily; web has the modal but the Edit-Patient flow is commented out (web is read-only per §11 of CLAUDE.md).
- `POST /api/patients`. Atomic `$inc patientIdCounter` → patientId like `SH-000001`. Creates 10 default folders.
- 🛠️ Emits `PATIENT_CREATED` audit (TD-001).

### C3. View patient detail + folders
- `/patients/:patientId`. `GET /api/patients/:patientId`. `Patient.toJSON()` strips internal IDs.

### C4. Update patient
- `PUT /api/patients/:patientId`. **Web Edit flow commented out** (`02-commented-code.md` §1); any mutation comes from mobile.
- 🛠️ Emits `PATIENT_UPDATED` audit (TD-001).

### C5. Create folder
- `POST /api/patients/:patientId/folders`.
- 🛠️ Emits `FOLDER_CREATED` audit (TD-001).

### C6. List / upload / rename / delete files
- Web shows the list (read-only); mutations are mobile-only.
- `GET /files/:folderName`, `POST /files/:folderName` (multipart + `Idempotency-Key`), `PATCH /.../:fileId/rename`, `DELETE /.../:fileId`.
- Cloudinary public_id: `HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{hash}`.
- 🛠️ All four mutation paths emit audits (TD-001): `FILE_UPLOADED`, `FILE_RENAMED`, `PATIENT_FILE_DELETE`. The `AuditLog.action` enum picked up the previously-rejected values in the same wave.

### C7. View / stream / signed-URL file
- Web uses `GET /files/.../:fileId/signed-url` (5-min TTL) + iframe preview. Image thumbnails from Cloudinary (120×120).
- `GET /files/.../stream` exists (mobile-only usage).

### C8. Single-file compressed download
- `GET /files/.../:fileId/compressed`. Backend calls sidecar `/api/folder-download` with `X-Internal-Secret`; returns merged/compressed URL to client.

### C9. Folder-level download (PDF or ZIP)
- `GET /patients/:id/folders/:folder/download/{pdf,zip}`. Legacy aliases without `/download/` still valid.

### C10. Patient-level download (PDF or ZIP, with size gate)
- `/patients/:id`. `GET /download/zip/size-check` (413 if > 100 MB), `POST /download/zip` (body `{ selectedFolders? }`), `POST /download/pdf` (body `{ mode: "merged" | "per-folder" }`).
- Soft 10 MB warning, hard 100 MB limit. Merged → single PDF. Per-folder → ZIP of PDFs.

### C11. Patients PDF bulk export
- `/dashboard` "Export all". `GET /api/export/patients/pdf` (blob, 300s timeout).

### C12. Multi-module archive export
- 🛠️ ~~`POST /api/export/archive`~~ — REMOVED 2026-04-25 (TD-030, `65f1012`). Endpoint had no frontend or Android caller; deleted in the dead-route sweep along with `/api/export/sample-cover`, `/api/patients/.../stream`, `/api/auth/login/resend-auth-code`, and the entire `/api/notifications` mount.

### C13. Auto-delete of old patients
- Nightly 00:00 UTC cron (`autoDelete.job.js`). Hard delete `patients` older than 90 days + cascade Cloudinary delete. One aggregate `AUTO_DELETE` audit row per run.

---

## D. Notifications (Email + Push)

### D1. Transactional emails
- Templates: welcome, OTP, session-revoked, new-login, password-changed, account-locked, account-disabled, account-deleted, account-deleted.
- Routes through Brevo REST (prod) or Mailtrap SMTP (dev).
- Gated by `notificationPrefs.newLoginAlert` / `.securityAlerts`.

### D2. Push notifications (FCM)
- Types: `NEW_LOGIN`, `PASSWORD_CHANGED`, `SESSION_REVOKED`, `CUSTOM`.
- Sent to `hospital.fcmToken.token` if present and pref allows.
- Preview / test endpoints removed 2026-04-25 (TD-030) — `GET /api/notifications/sample`, `GET /api/notifications/preview`, `POST /api/notifications/test` + the whole `/api/notifications` mount are gone. Debug by reading push payloads directly in [push.service.js](../../backend/src/services/push.service.js) or observing FCM telemetry.

### D3. SMS gateway — deferred
- No active integration. Auth Code + email OTP carry all 2FA/OTP. `.env.example` `SMS_GATEWAY_*` vars are dead.

---

## E. Admin-only

### E1. List all hospitals
- `/hospitals`. `GET /api/hospitals`. 🛠️ **Cursor-paginated** (TD-005, 2026-04-21) — `?limit` (default 50, cap 100), `?cursor=<_id>`, `?search=<string>`. First-page response includes `{ totals: { total, active, recentWeek }, nextCursor }`. Admin UI fetches 50 rows at a time with debounced server-side search + "Load more".

### E2. Edit any hospital
- Edit modal. `PUT /api/hospitals/:id`.
- 🛠️ Emits `HOSPITAL_UPDATED` on every patch + an active-state-transition `PROFILE_PATCHED` when enable/disable flips (TD-001).

### E3. Resend welcome email
- `POST /api/hospitals/:id/resend-welcome`. Regenerates temp password if `mustChangePassword=true`.

### E4. Force-delete hospital
- `DELETE /api/hospitals/:id` body `{ password, reason }`. Scrubs PII, revokes sessions, preserves auditlogs. Requires password + 10-char reason + literal "DELETE".

### E5. Activity / audit log
- `/activity`. `GET /api/audits` (hospital-scoped server-side; admin only; cursor pagination), `GET /api/audits/actions`.

### E6. Cloudinary orphan cleanup
- `GET /api/admin/cloudinary/orphans` (dry-run), `DELETE /api/admin/cloudinary/orphans`. Manual, no cron.
- 🛠️ Emits `ORPHAN_CLEANUP` audit (TD-001).

---

## F. App & Infra

### F1. App version gating
- `GET /api/version?platform=android`. `appversions` collection updated manually via `scripts/manage-app-version.js`.
- 🛠️ ~~App version admin endpoints exist in hospitalService.ts but have no UI caller~~ — RESOLVED 2026-04-21 (TD-010, `a09c738`). The unused `listAppVersions/createAppVersion/updateAppVersion` exports were dropped from `hospitalService.ts`. Updates remain script-only.

### F2. Health checks
- `GET /api/health` (lightweight). `GET /api/health/deep` (Mongo + Redis + server only — does NOT probe Cloudinary / Brevo / FCM / sidecar today).

### F3. Compression sidecar
- Python FastAPI at `/compression-service`. `POST /api/folder-download`, `POST /api/patient-download` with `X-Internal-Secret`. Shared DB for `merged_pdf_cache` + `compression_audits`.
- Pipeline: fetch → classify → optional cover → pikepdf merge → tier ladder (0 digital, 1–4 scanned) → Cloudinary upload → cache upsert.
- Hard 300s timeout (🛠️ error body now correctly reads "Pipeline exceeded 300s limit" — TD-014), 502 on Cloudinary fetch fail, 413 on size floor.
- Source-fetch concurrency capped at 10 via `asyncio.Semaphore` to protect Cloudinary per-IP rate limits + connection pool (TD-015, `150ae0d`).
- 🛠️ **Mandatory in production** (TD-D4, 2026-04-25, `173db5a`). [config/env.js](../../backend/src/config/env.js) refuses to boot when `NODE_ENV=production` AND `USE_COMPRESSION_SERVICE !== "true"` — the in-process pdf-lib fallback OOMs at scale on large patients. Render is already set to `true`. Disabling in prod requires either swapping merge to a streaming Node implementation or accepting the OOM risk for very small deployments only.
- 🛠️ Android `DownloadWorker.pollUntilReady(statusUrl)` is now active (the prior "INTENTIONAL_FEATURE_HOLD" note is obsolete) — when the sidecar reports a server-side merge in flight, the worker polls until the merged URL is ready.

---

## G. Web-only Pages

| Page | Route | Purpose |
|---|---|---|
| Landing | `/` | Marketing/entry. |
| Terms | `/terms` | Legal. |
| Privacy | `/privacy` | Legal. |
| Components preview | `/components-preview` | Design system sandbox (pulls `recharts` + `lucide-react`). |
| Loading spinners preview | `/spinners-preview` | 19-variant Spinner showcase, unlinked. |
| Legacy redirect | `/security` → `/sessions` | Backward compat. |
| Not found | `*` | Renders `NotFound` (NOT redirects). |

---

## Cross-cutting gotchas for redesign / mobile parity

1. **File mutations (upload/rename/delete) are mobile-first.** Web is read-only.
2. **Mobile-only enforcements:** 7-day Auth Code re-verify, 1-device, FCM push, biometric.
3. 🛠️ ~~Every patient/file action is SUPPOSED to be audit-logged. Reality is 8 mutation endpoints don't.~~ — RESOLVED 2026-04-21 (TD-001, `a118b0a`). All 8 mutation endpoints now emit audits; new mutation handlers must follow suit and register their `action` value in [models/AuditLog.js](../../backend/src/models/AuditLog.js) (the Mongoose enum silently rejects unknown values).
4. **OTP length is hard-coded 6 on the frontend.** Backend must stay at 6 or frontend breaks silently.
5. 🛠️ ~~Compression sidecar is optional~~ — Sidecar is **mandatory in production** (TD-D4). Backend refuses to boot in prod without it. Optional in dev only.
6. **Patient auto-delete is a hard delete.** Any new "trash" UI needs a schema migration.
7. **Signed URLs live 5 minutes.** Don't cache longer.
8. 🛠️ ~~Refresh token is 365d in a cookie. Do not expose to JS. Note: not rotated — token theft = session theft.~~ — Refresh token is rotated on every `/auth/refresh-token` (TD-002). Replaying a rotated-out token revokes ALL active sessions for the hospital and emails the user. Still httpOnly + 365d.
9. **Admin cannot self-delete / self-revoke.**
10. **Auth Code is immutable.** UI messaging must not promise rotation.
11. 🛠️ ~~`GET /api/hospitals` has no pagination~~ — resolved (TD-005, 2026-04-21). Cursor pagination + server-side search + first-page totals now ship; admin UI paginates 50 rows at a time.
12. 🛠️ ~~Compression sidecar returns the wrong timeout string on 504.~~ — Fixed (TD-014); body now reads "Pipeline exceeded 300s limit".
13. **Access token is held in module-scoped JS memory** (TD-D3) — never in `sessionStorage`/`localStorage`. Refresh-cookie + `/auth/refresh-token` bootstrap on cold start. Don't reintroduce on-disk persistence.
14. **Always read client IP via `getClientIp(req)`**, never `req.ip` directly — Cloudflare strips the original IP at the TCP layer; `req.ip` resolves to a Cloudflare PoP (e.g. Singapore for Indian traffic).
15. **Server-side idle revoke is web-only.** Mobile sessions are exempt because backgrounded apps look idle but are alive. If you reduce `IDLE_MS` below 30 min, re-evaluate the heartbeat strategy first.
16. **Android Phase 1+2 (2026-04-25):** all bulk downloads (folder PDF/ZIP, patient PDF/ZIP) flow through `DownloadWorker` ([worker/DownloadWorker.kt](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt)) which accepts JSON request bodies for bulk merges and resumes partial transfers via `RandomAccessFile`. Online direct uploads go through `UploadWorker` with foreground notifications + byte-level progress. Offline-queue uploads run through `SyncDocumentsWorker`, now promoted to a foreground service. Dashboard renders `WorkProgressBanner` aggregating download/upload/sync state. Inline-download plumbing was deleted in `8d8956f` — do not reintroduce.
