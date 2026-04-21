# Hospital Management — End-to-End Feature Map (Refreshed)

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 — TD-002 (refresh rotation), TD-005 (`/hospitals` pagination), TD-010 (dead FE code), TD-012 (unused backend deps), TD-013 (AuditLog enum), TD-004 (`.env.example`) shipped. Items marked 🛠️ below.
**Scope:** Every user-facing feature traced from UI → API → DB, across web + Android (mobile parts marked).

Legend: `admin` (super-user), `hospital` (regular user), `both` (any authenticated).

---

## 0. Changes Since Previous Audit (2026-04-20)

- Endpoint map refreshed against backend code (59 endpoints, corrections in `backend.md` §4 and `00-drift.md` §2).
- `POST /api/hospitals/me/change-contact/resend` added — previously missing from §B2.
- Catch-all `*` on the web renders `NotFound`, not a silent redirect (affects A-series back-navigation flows).
- Web Edit-Patient flow is intentionally commented out (`02-commented-code.md` §1).
- **Audit logging missing on 8 mutation endpoints** — see `00-drift.md` §10. Several C-series features in this map say "every action audit-logged" which is not accurate today for create-patient, upload-file, rename-file, create-folder, etc.
- Compression sidecar error message bug: timeout says "100s limit" but real timeout is 300s.

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
- **BE:** `POST /api/auth/login` → `POST /api/auth/login/verify-auth-code`. Resend: `POST /api/auth/login/resend-auth-code`.
- **DB:** reads `hospitals`, creates `sessions` (with `location` sub-doc populated fire-and-forget by GeoIP service), writes `auditlogs`.
- **Gotchas:** Auth Code strict on every mobile email/password login; biometric bypasses it. Lock at 5 failed attempts (423). Both platforms require Auth Code.

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

### A8. Token refresh & session conflict
- `POST /api/auth/refresh-token` (cookie), `POST /api/auth/session/check-conflict`, `POST /api/auth/session/force-logout`.
- Mobile: 1 session per `(hospitalId, deviceId)`; 3rd mobile login across devices evicts the oldest with `SESSION_CONFLICT`.
- Web is multi-session.
- 🛠️ **Refresh token IS rotated** (TD-002, 2026-04-21). Every successful `/auth/refresh-token` issues a brand-new refresh token, persists it on the session doc, and overwrites the httpOnly cookie. Replaying a rotated-out token revokes all active sessions for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) + sends a security email.

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
- **⚠ No audit log on `patchMe`** today (`00-drift.md` §10).

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
- `/dashboard`. `GET /api/patients` (search, pagination). Scoped to own hospital.

### C2. Create patient
- Mobile primarily; web has the modal but the Edit-Patient flow is commented out (web is read-only per §11 of CLAUDE.md).
- `POST /api/patients`. Atomic `$inc patientIdCounter` → patientId like `SH-000001`. Creates 10 default folders.
- **⚠ No audit log today.**

### C3. View patient detail + folders
- `/patients/:patientId`. `GET /api/patients/:patientId`. `Patient.toJSON()` strips internal IDs.

### C4. Update patient
- `PUT /api/patients/:patientId`. **Web Edit flow commented out** (`02-commented-code.md` §1); any mutation comes from mobile. **⚠ No audit log today.**

### C5. Create folder
- `POST /api/patients/:patientId/folders`. **⚠ No audit log today.**

### C6. List / upload / rename / delete files
- Web shows the list (read-only); mutations are mobile-only.
- `GET /files/:folderName`, `POST /files/:folderName` (multipart + `Idempotency-Key`), `PATCH /.../:fileId/rename`, `DELETE /.../:fileId`.
- Cloudinary public_id: `HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{YYYYMMDD}_{hash}`.
- **⚠ Only `DELETE` is audit-logged today**; upload/rename/create-folder are NOT.

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
- `POST /api/export/archive` body `{ modules: [] }`. **Frontend has no caller** (`01-dead-code.md` §F); verify whether it's actually used.

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
- Preview endpoints public (no auth): `GET /api/notifications/sample` (HTML), `GET /api/notifications/preview` (JSON).
- Admin test: `POST /api/notifications/test`.

### D3. SMS gateway — deferred
- No active integration. Auth Code + email OTP carry all 2FA/OTP. `.env.example` `SMS_GATEWAY_*` vars are dead.

---

## E. Admin-only

### E1. List all hospitals
- `/hospitals`. `GET /api/hospitals`. 🛠️ **Cursor-paginated** (TD-005, 2026-04-21) — `?limit` (default 50, cap 100), `?cursor=<_id>`, `?search=<string>`. First-page response includes `{ totals: { total, active, recentWeek }, nextCursor }`. Admin UI fetches 50 rows at a time with debounced server-side search + "Load more".

### E2. Edit any hospital
- Edit modal. `PUT /api/hospitals/:id`. Only enable/disable transition is audit-logged today.

### E3. Resend welcome email
- `POST /api/hospitals/:id/resend-welcome`. Regenerates temp password if `mustChangePassword=true`.

### E4. Force-delete hospital
- `DELETE /api/hospitals/:id` body `{ password, reason }`. Scrubs PII, revokes sessions, preserves auditlogs. Requires password + 10-char reason + literal "DELETE".

### E5. Activity / audit log
- `/activity`. `GET /api/audits` (hospital-scoped server-side; admin only; cursor pagination), `GET /api/audits/actions`.

### E6. Cloudinary orphan cleanup
- `GET /api/admin/cloudinary/orphans` (dry-run), `DELETE /api/admin/cloudinary/orphans`. Manual, no cron. **⚠ Delete not audit-logged.**

---

## F. App & Infra

### F1. App version gating
- `GET /api/version?platform=android`. `appversions` collection updated manually via `scripts/manage-app-version.js`.
- **⚠ App version admin endpoints exist in hospitalService.ts (`listAppVersions`, `createAppVersion`, `updateAppVersion`) but have no UI caller today.**

### F2. Health checks
- `GET /api/health` (lightweight). `GET /api/health/deep` (Mongo + Redis + server only — does NOT probe Cloudinary / Brevo / FCM / sidecar today).

### F3. Compression sidecar
- Python FastAPI at `/compression-service`. `POST /api/folder-download`, `POST /api/patient-download` with `X-Internal-Secret`. Shared DB for `merged_pdf_cache` + `compression_audits`.
- Pipeline: fetch → classify → optional cover → pikepdf merge → tier ladder (0 digital, 1–4 scanned) → Cloudinary upload → cache upsert.
- Hard 300s timeout (error body incorrectly says "100s"), 502 on Cloudinary fetch fail, 413 on size floor.

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
3. **Every patient/file action is SUPPOSED to be audit-logged.** Reality is 8 mutation endpoints don't. Fix before claiming this in new UI.
4. **OTP length is hard-coded 6 on the frontend.** Backend must stay at 6 or frontend breaks silently.
5. **Compression sidecar is optional** (`USE_COMPRESSION_SERVICE`). Preserve streaming-proxy contract.
6. **Patient auto-delete is a hard delete.** Any new "trash" UI needs a schema migration.
7. **Signed URLs live 5 minutes.** Don't cache longer.
8. **Refresh token is 365d in a cookie.** Do not expose to JS. Note: **not rotated** — token theft = session theft.
9. **Admin cannot self-delete / self-revoke.**
10. **Auth Code is immutable.** UI messaging must not promise rotation.
11. 🛠️ ~~`GET /api/hospitals` has no pagination~~ — resolved (TD-005, 2026-04-21). Cursor pagination + server-side search + first-page totals now ship; admin UI paginates 50 rows at a time.
12. **Compression sidecar returns the wrong timeout string on 504.** Either fix server-side or translate client-side.
