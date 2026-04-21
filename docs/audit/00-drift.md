# Drift Detection — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 (TD-002 / TD-004 / TD-005 / TD-010 / TD-012 / TD-013 shipped — resolved rows marked 🛠️ below)
**Baseline docs audited against:** `docs/audit/backend.md`, `docs/audit/frontend.md`, `docs/audit/features.md` (all dated 2026-04-20), plus `CLAUDE.md`.

**Legend:** ✅ Confirmed · ⚠️ Drifted · ❌ False · ➕ New (not in baseline) · 🛠️ Resolved after the audit date

## What's been resolved since the original drift capture

- **§3.4 — TOTP / RECOVERY enum members:** 🛠️ pruned in [AuditLog.js](../../backend/src/models/AuditLog.js) (TD-013).
- **§4 — refresh-token rotation:** 🛠️ rotation + reuse detection implemented in [token.service.js](../../backend/src/services/token.service.js) + cookie overwrite in [auth.controller.js](../../backend/src/controllers/auth.controller.js) (TD-002).
- **§5 — `.env.example` drift:** 🛠️ 13 dead vars removed, 11 missing vars added, `REFRESH_TOKEN_EXPIRY` corrected to `365d` (TD-004).
- **§9 — `REFRESH_TOKEN_EXPIRY` default contradiction:** 🛠️ corrected to `365d` in `.env.example`.
- **Summary item #3 — `GET /api/hospitals` pagination:** 🛠️ cursor pagination + server-side search + first-page totals shipped (TD-005).
- **Summary item #4 — dead TOTP scaffolding:** 🛠️ AuditLog enum cleaned; `.env.example` TOTP block removed.
- **Summary item #5 — `.env.example` missing vars:** 🛠️ now synced with code.
- **Summary item #10 — `r2.service.js` dead code:** still open (TD-003 not yet shipped).
- **Unused backend deps:** 🛠️ `@getbrevo/brevo` + `axios` removed (TD-012).
- **Unused frontend exports / orphan components:** 🛠️ `CountdownTimer`, `SkeletonLoader`, `Toast`, `patientApi.ts`, app-version service fns removed (TD-010).

---

## 1. Tech Stack Versions

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §1 | Node 7.5.0 Mongoose, Express, `bcryptjs 2.4.3`, etc. | ✅ | [backend/package.json](../../backend/package.json) | All versions match. |
| backend.md §1 | `@getbrevo/brevo ^5.0.3` used for prod email | ⚠️ | [backend/package.json:24](../../backend/package.json) | Dep present but **not imported anywhere** in `backend/src/`. Mail uses `nodemailer` + Brevo SMTP (not the Brevo SDK). See dead-code §B1. |
| backend.md §1 | `axios 1.5.0` used as HTTP client | ⚠️ | [backend/package.json:27](../../backend/package.json) | Dep present but **not imported anywhere** in `backend/src/`. GeoIP uses native `fetch`. Dead-code §B2. |
| frontend.md §1 | `recharts 3.8.1` "NOT currently used" | ⚠️ | [frontend/src/pages/ComponentsPreview.tsx:19](../../frontend/src/pages/ComponentsPreview.tsx) | Imported by the `/components-preview` design gallery. Still "unused in product flows" but technically loaded by a shipped route. |
| frontend.md §1 | `lucide-react 1.8.0` "included but all icons are inline SVG" | ⚠️ | [frontend/src/pages/ComponentsPreview.tsx:15](../../frontend/src/pages/ComponentsPreview.tsx) | Same: only used in the design-gallery route. |
| frontend.md §1 | Vite `^8.0.3` | ✅ | [frontend/package.json:34](../../frontend/package.json) | Match. |
| compression README | FastAPI 0.115.12, pikepdf 9.7.0 | ✅ | [compression-service/requirements.txt](../../compression-service/requirements.txt) | Match. |

---

## 2. Route / Endpoint Inventory (Backend)

**Baseline claims:** 54 endpoints total (auth 20, patients 17, hospitals 8, export 3, audit 2, admin 2, version 1, notifications 3, health 2). **Actual:** 59 endpoints (auth 25, patients 21 incl. legacy aliases, hospitals 12, export 3, audit 2, admin 2, version 1, notifications 3, health 2) — see table.

| Group | Baseline count | Actual count | Delta |
|---|---|---|---|
| auth | 20 | **25** | +5 |
| patients | 17 primary | **21** (17 primary + 4 legacy aliases) | +4 legacy |
| hospitals | 8 | **12** | +4 |
| export | 3 | 3 | 0 |
| audit | 2 | 2 | 0 |
| admin | 2 | 2 | 0 |
| version | 1 | 1 | 0 |
| notifications | 3 | 3 | 0 |
| health | 2 | 2 | 0 |
| **Total** | **54** | **59** | **+5** (+4 if legacy aliases are merged) |

### 2.1 Endpoints in code but not in baseline counts

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §4 auth table | Counts 20 auth endpoints | ⚠️ | [backend/src/routes/auth.routes.js](../../backend/src/routes/auth.routes.js) | 25 registered. Baseline *lists* most of them (they appear in the tables) but §4 summary says 20 and the final §Summary counts also say 20. |
| backend.md §4 hospitals | Counts 8 hospital endpoints | ⚠️ | [backend/src/routes/hospitals.routes.js:47-63](../../backend/src/routes/hospitals.routes.js) | `/me/change-contact/resend` (line 53), `/me/notification-preferences` GET + PUT (lines 62-63), `/me/change-contact/init` + `/verify` are in the table body but not in the count. Actual = 12. |
| backend.md §4 patient | "Legacy routes" bullet lists 4 GET aliases | ✅ | [backend/src/routes/patient.routes.js:173-176](../../backend/src/routes/patient.routes.js) | All 4 present. Not counted separately in the "17" headline. |

### 2.2 Endpoints in baseline but not in code

None. Every endpoint the audit mentions exists in code.

### 2.3 New route the baseline missed entirely

| Status | Method | Path | Line | Notes |
|---|---|---|---|---|
| ➕ | POST | `/api/hospitals/me/change-contact/resend` | [hospitals.routes.js:53](../../backend/src/routes/hospitals.routes.js) | Resend contact-change OTP. Added to table but never mentioned in features.md §B2. |

### 2.4 Middleware chain drift

All chains match the baseline: `authLimiter`, `otpLimiter`, `verifyAccessToken`, `verifyAdmin`, `verifyAdminOrSelf`, `uploadSingle`, `uploadDocument`, `uploadIdempotencyGuard`, `patientLimiter`, `exportLimiter`. One observation:

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §5 | `verifyHospitalActive` absent from middleware table | ➕ | [backend/src/routes/patient.routes.js:41,55,61](../../backend/src/routes/patient.routes.js) | `verifyHospitalActive` is applied to every patient endpoint after `verifyAccessToken`. Not listed in backend.md §5 middleware table. |

---

## 3. Data Models

### 3.1 Hospital

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §3 | Fields: hospitalName, authCode, email, phone, passwordHash, logoUrl, role, isActive, failedLoginAttempts, lockUntil, address/city/state/zip, mustChangePassword, fcmToken, patientIdCounter, biometricKeys, tcAccepted/Version/AcceptedAt, notificationPrefs | ✅ | [backend/src/models/Hospital.js](../../backend/src/models/Hospital.js) | All present. |
| backend.md §3 | Virtual `fullAddress` | ✅ | [backend/src/models/Hospital.js](../../backend/src/models/Hospital.js) | Present. |
| backend.md §3 | Methods `matchPassword`, `getInitials` | ✅ | Present. |
| backend.md §3 | Statics `generateAuthCode`, `generateUniqueAuthCode` | ✅ | Present. |
| — | Pre-validate hook auto-generates `authCode` on save if unset | ➕ | [Hospital.js:189-198](../../backend/src/models/Hospital.js) | Undocumented invariant; deserves a §Gotchas line. |

### 3.2 Patient

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §3 | `hospitalId`, `patientId`, `patientName`, `remarks(max 500)`, `folders[]` with embedded files[] | ✅ | [backend/src/models/Patient.js](../../backend/src/models/Patient.js) | Match. |
| backend.md §3 | 10 default folders (list) | ✅ | Match. |
| backend.md §3 | `Patient.toJSON()` strips `cloudinaryPublicId`, `resourceType`, `accessMode` | ✅ | Match. |
| backend.md §3 | Compound unique `(hospitalId, patientId)` + `(hospitalId, createdAt)` + single `hospitalId`, `createdAt` | ✅ | Match. |

### 3.3 Session

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §3 | `hospitalId`, `refreshToken (unique)`, `deviceId`, `ipAddress`, `userAgent`, `expiresAt (TTL)`, `isActive`, `isMobile`, `platform`, `lastSeenAt`, `lastSeenIp`, `revokedReason`, `lastAccessedAt`, `authCodeVerifiedAt` | ✅ | [backend/src/models/Session.js](../../backend/src/models/Session.js) | All present. |
| — | Embedded `location` sub-document: `{city, region, country, countryCode, isPrivate, displayName}` | ➕ | [Session.js:58-65](../../backend/src/models/Session.js) | Added for GeoIP display on /sessions. Undocumented in backend.md §3 (but mentioned in CLAUDE.md §8 Sessions section). |

### 3.4 AuditLog

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §3 | Action enum with 40+ values incl. `TOTP_*`, `RECOVERY_*` | ⚠️ | [backend/src/models/AuditLog.js:28-38](../../backend/src/models/AuditLog.js) | Enum values remain but **no code path emits `TOTP_*` or `RECOVERY_*` actions** — the TOTP feature was removed. Enum entries are dead. |
| backend.md §3 | Indexes: `(userId, createdAt desc)`, `(action, createdAt desc)` | ✅ | Match. |

### 3.5 AppVersion

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §3 | Fields: platform, minVersion, latestVersion, forceUpdate, updateUrl, releaseNotes | ✅ | [backend/src/models/AppVersion.js](../../backend/src/models/AppVersion.js) | Match. |

---

## 4. Services / Business Logic

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §2 file tree | `services/r2.service.js` — "Cloudflare R2 storage (legacy)" | ⚠️ | [backend/src/services/r2.service.js](../../backend/src/services/r2.service.js) | File exists, all 8 exported functions have **zero importers** (grep returns only self). Effectively dead. See dead-code §D. |
| backend.md §5 | Session creation writes `ipAddress`, `userAgent` | ✅ | [backend/src/services/token.service.js](../../backend/src/services/token.service.js) | Match. Also writes `location` via geoip.service.js fire-and-forget (undocumented). |
| backend.md §5 | Refresh token rotation (implicit: "issue new access tokens") | ⚠️ | [token.service.js:196-231](../../backend/src/services/token.service.js) | On refresh, ONLY access token is new; **refresh token is reused**. Baseline does not explicitly claim rotation, but the wording "issue new access tokens" read alongside 365-day TTL implies rotation. Clarify in refreshed doc. |
| — | `mail.service.js → sendLogoutConfirmationEmail()` | ➕ dead | [mail.service.js:598-616](../../backend/src/services/mail.service.js) | Exported, zero callers. |
| — | `token.service.js → cleanupExpiredSessions()` | ➕ dead | [token.service.js:294-308](../../backend/src/services/token.service.js) | Exported, zero callers (TTL index on `Session.expiresAt` handles cleanup). |

---

## 5. Environment Variables

### 5.1 Variables in code, missing from `.env.example`

| Var | First reference | Notes |
|---|---|---|
| `TRUST_PROXY_HOPS` | [backend/src/index.js:51](../../backend/src/index.js) | CLAUDE.md §9 says default `2`; must be integer, not `true`. |
| `GEOIP_DEV_OVERRIDE_IP` | [backend/src/services/geoip.service.js:81](../../backend/src/services/geoip.service.js) | Dev-only override; unset before shipping. |
| `SIGNED_UPLOADS_ENABLED` | [backend/src/services/storage.service.js](../../backend/src/services/storage.service.js) | Gates B5 signed-URL mode. |
| `USE_COMPRESSION_SERVICE` | [backend/src/config/env.js:93](../../backend/src/config/env.js) | Feature flag for sidecar. |
| `COMPRESSION_SERVICE_URL` | [env.js:94](../../backend/src/config/env.js) | Required if flag on; throws at boot otherwise. |
| `COMPRESSION_SERVICE_SECRET` | [env.js:95](../../backend/src/config/env.js) | Required if flag on. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | [backend/src/config/firebase.js](../../backend/src/config/firebase.js) | Alternative FCM auth mode. |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | [backend/src/config/firebase.js](../../backend/src/config/firebase.js) | Alternative FCM auth mode. |
| `OTP_EXPIRY_MINUTES`, `OTP_LENGTH`, `MAX_OTP_ATTEMPTS` | [backend/src/config/env.js](../../backend/src/config/env.js) | Referenced in env.js but not templated. |

### 5.2 Variables in `.env.example`, dead in code

| Var | Status | Notes |
|---|---|---|
| `TOTP_ENCRYPTION_KEY` | ❌ Dead | TOTP feature removed; enum values remain in AuditLog. |
| `TOTP_ISSUER` | ❌ Dead | |
| `TOTP_WINDOW` | ❌ Dead | |
| `TOTP_MAX_ATTEMPTS` | ❌ Dead | |
| `TOTP_LOCK_DURATION_MINUTES` | ❌ Dead | |
| `SMS_GATEWAY_API_KEY` | ❌ Dead | SMS gateway deferred per CLAUDE.md §5. |
| `SMS_GATEWAY_SENDER` | ❌ Dead | Ditto. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, `SMTP_SECURE` | ⚠️ Legacy | Kept "for backward compat" per `.env.example` comment; no code path uses them (Brevo REST + Mailtrap SMTP handle all mail). |
| `MONGO_ROOT_USER`, `MONGO_ROOT_PASSWORD`, `REDIS_PASSWORD` | ✅ Infra-only | Used by `docker-compose.yml`, not by app code. Reasonable. |

### 5.3 Configured defaults that contradict documented values

| Claim source | Claim | Status | Evidence | Notes |
|---|---|---|---|---|
| backend.md §5 | Refresh token 365-day TTL | ⚠️ | [.env.example:24](../../.env.example) | `.env.example` sets `REFRESH_TOKEN_EXPIRY=7d`. Code default in `env.js` falls back to 7d. The 365-day value is operational policy, not the shipped default — and mobile Auth Code re-verify at 7 days means the refresh token is effectively *longer* than the Auth Code lifetime; recommend pinning `.env.example` to the documented `365d`. |

---

## 6. Frontend Routes

### 6.1 Route count

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| frontend.md §2 | 24 routes | ⚠️ | [frontend/src/routes/AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx) — 20 unique `<Route path>` definitions + 1 catch-all = **21 routes**. |
| CLAUDE.md §8 | Catch-all `*` renders `pages/NotFound.tsx` | ✅ | [AppRoutes.tsx:97](../../frontend/src/routes/AppRoutes.tsx) |
| CLAUDE.md §8 | `/spinners-preview` (design gallery, unlinked) | ✅ | [AppRoutes.tsx:59](../../frontend/src/routes/AppRoutes.tsx) |

### 6.2 Route-level delta vs frontend.md §2

Missing from frontend.md §2:
- `/spinners-preview` → `LoadingSpinners` ([AppRoutes.tsx:59](../../frontend/src/routes/AppRoutes.tsx))
- Catch-all `*` → `NotFound` ([AppRoutes.tsx:97](../../frontend/src/routes/AppRoutes.tsx)) — listed in table but claim says "redirects to /dashboard" (FALSE; renders NotFound).

Incorrect claim:

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| frontend.md §2 "Catch-All" table | `*` → "Redirects to /dashboard (which re-checks auth)" | ❌ | [AppRoutes.tsx:97](../../frontend/src/routes/AppRoutes.tsx) renders `<NotFound />`, no redirect. |

---

## 7. Architectural Rules (CLAUDE.md §8)

### 7.1 Rule #1: `min-h-[calc(100vh-4rem)]` inside MainLayout

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| CLAUDE.md §8 | Applied to Dashboard, Profile, NotificationSettings, Password, Sessions, HospitalsList, ActivityLog, PatientDetails, FolderView | ✅ | All 9 pages verified to use `min-h-[calc(100vh-4rem)]`. Pages outside MainLayout correctly use `min-h-screen`. No violations. |

### 7.2 Rule #2: `createPortal(..., document.body)` + `z-[100]` for every full-viewport modal

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| CLAUDE.md §8 | 8 modals portaled: Navbar logout, HospitalProfileModal, ConfirmDialog, DocumentViewer, PdfModeModal, ZipSizeModal, HospitalsList ModalShell, Profile contact-change | ✅ | All 8 verified. [Navbar.tsx:409](../../frontend/src/components/Navbar.tsx), [HospitalProfileModal.tsx:41](../../frontend/src/components/HospitalProfileModal.tsx), [ConfirmDialog.tsx:44](../../frontend/src/components/ConfirmDialog.tsx), [DocumentViewer.tsx:152](../../frontend/src/components/DocumentViewer.tsx), [PdfModeModal.tsx:39](../../frontend/src/components/PdfModeModal.tsx), [ZipSizeModal.tsx:50](../../frontend/src/components/ZipSizeModal.tsx), [HospitalsList.tsx:1408](../../frontend/src/pages/HospitalsList.tsx), [Profile.tsx:727](../../frontend/src/pages/Profile.tsx). All use `z-[100]`. |

### 7.3 Rule #3: `useDocumentTitle("...")` on every page

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| CLAUDE.md §8 | Every page sets tab title via `useDocumentTitle` | ⚠️ | 6 violations found: |

| Page | Violation | Line |
|---|---|---|
| Dashboard | Uses `document.title = "..."` directly, bypassing the hook | [Dashboard.tsx:132](../../frontend/src/pages/Dashboard.tsx) |
| Login | Direct `document.title` | [Login.tsx:43](../../frontend/src/pages/Login.tsx) |
| Password | Direct `document.title` | [Password.tsx:152](../../frontend/src/pages/Password.tsx) |
| Profile | Direct `document.title` | [Profile.tsx:85](../../frontend/src/pages/Profile.tsx) |
| Sessions | Direct `document.title` | [Sessions.tsx:183](../../frontend/src/pages/Sessions.tsx) |
| VerifyAuthCode | Direct `document.title` | [VerifyAuthCode.tsx:33](../../frontend/src/pages/VerifyAuthCode.tsx) |
| ForgotPassword | No title set at all | [ForgotPassword.tsx](../../frontend/src/pages/ForgotPassword.tsx) |

**Reason matters:** direct `document.title` assignment sets the title but does NOT restore it on unmount, while the hook does. This means after navigating away from (e.g.) `/login`, the previous page's title may persist until the next page also assigns directly — the exact bug the hook was introduced to prevent.

---

## 8. Frontend State & API Claims

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| frontend.md §6 / CLAUDE.md §8 | Access token in `sessionStorage`, refresh in httpOnly cookie | ✅ | [authService.ts:118-122](../../frontend/src/services/authService.ts), [authService.ts:113-115](../../frontend/src/services/authService.ts) |
| frontend.md §6 | `localStorage.hospital` JSON stringified; logo >1KB stripped | ✅ | [useAuth.tsx](../../frontend/src/hooks/useAuth.tsx) verified |
| frontend.md §7 | `services/api.ts` Axios with 401 retry + account-disabled detection | ✅ | [services/api.ts](../../frontend/src/services/api.ts) |
| frontend.md §9 | "Inactivity Logout — 15-minute" | ✅ | [useAuth.tsx:211](../../frontend/src/hooks/useAuth.tsx) wires `useInactivityTimeout(handleInactivityTimeout, state.isAuthenticated)` |
| frontend.md §11 | `useInactivityTimeout` hook listed as "in hooks/" | ✅ | [useInactivityTimeout.ts](../../frontend/src/hooks/useInactivityTimeout.ts), imported by useAuth. |

---

## 9. Security / Auth Behaviour

| Claim source | Claim | Status | Evidence |
|---|---|---|---|
| CLAUDE.md §5 | Auth Code immutable unless admin resets | ✅ | Hospital.js pre-validate hook generates only on first save. |
| CLAUDE.md §5 | 5 failed attempts → account lock with email | ✅ | [auth.controller.js](../../backend/src/controllers/auth.controller.js) brute-force counters. |
| CLAUDE.md §5 | Forgot password init always 200 (no enumeration) | ✅ | Verified in controller. |
| CLAUDE.md §5 | Access token TTL 24h | ⚠️ | [.env.example:22](../../.env.example) sets `JWT_EXPIRY=24h` ✓. Matches claim. |
| CLAUDE.md §5 | Refresh token TTL 365 days | ⚠️ | [.env.example:24](../../.env.example) sets `REFRESH_TOKEN_EXPIRY=7d`. Doc-code mismatch; pin to 365d for mobile. |
| CLAUDE.md §5 | Mobile 7-day Auth Code re-verify | ✅ | [middleware/auth.js](../../backend/src/middleware/auth.js) enforces `AUTH_CODE_REQUIRED`. |
| backend.md §6 | Auto-delete daily 00:00 UTC, 90 days | ✅ | [jobs/autoDelete.job.js:12](../../backend/src/jobs/autoDelete.job.js) `cron.schedule("0 0 * * *", ...)`, calls `deleteOldPatients(90)`. |
| Conventions §12 | Patient endpoints audit-log every action | ⚠️ | Mutation audit coverage has GAPS — see §10 below. |
| Conventions §12 | `GET /api/audits` admin-only, `userId` forced server-side | ✅ | [audit.controller.js:43](../../backend/src/controllers/audit.controller.js) forces `userId: hospitalId`. |

---

## 10. Audit Logging Gaps (Convention Violation)

CLAUDE.md §12 asserts "All patient-touching endpoints audit-log." **Violated** — these mutations have no `AuditLog.create()` / `logAudit()` call:

| Endpoint | Controller | Line | Severity |
|---|---|---|---|
| POST `/api/patients` | patient.controller.js | `createPatient` | HIGH |
| PUT `/api/patients/:patientId` | patient.controller.js | `updatePatient` | HIGH |
| POST `/api/patients/:patientId/folders` | patient.controller.js | `createFolder` | MEDIUM |
| POST `/api/patients/:patientId/files/:folderName` | patient.controller.js | `uploadFile` | HIGH |
| PATCH `/api/patients/:patientId/files/:folderName/:fileId/rename` | patient.controller.js | `renameFile` | MEDIUM |
| PATCH `/api/hospitals/me` | hospitals.controller.js | `patchMe` | MEDIUM |
| PUT `/api/hospitals/:id` | hospitals.controller.js | `updateHospital` (only enable/disable is logged) | MEDIUM |
| DELETE `/api/admin/cloudinary/orphans` | admin.controller.js | `deleteOrphans` | MEDIUM |

*Endpoints WITH audit coverage:* DELETE file, downloads (ZIP/PDF), all auth mutations, admin force-delete hospital, contact-change flow, resend-welcome.

---

## 11. Summary of Drift — Top 10 by Impact

1. **Audit logging missing on 8 mutation endpoints** (§10) — violates explicit convention; compliance risk.
2. **Refresh token rotation claim is implicit and wrong**: refresh token is reused across refreshes (§4). Token theft → indefinite access until session TTL.
3. **`GET /api/hospitals` has no pagination** ([hospitals.controller.js:31](../../backend/src/controllers/hospitals.controller.js)); selects all, sorted by `createdAt`. Scales poorly. (Baseline does not flag.)
4. **TOTP enum + env scaffolding are dead** across `AuditLog.actions` and `.env.example` (§3.4, §5.2) — confusing for new engineers.
5. **`.env.example` is missing 9 env vars that are actually consumed** (§5.1) — new developer sets up broken service.
6. **Catch-all route claim is wrong in frontend.md §2**: renders NotFound, not redirects to dashboard (§6.2).
7. **Endpoint count understates reality by 5** (§2.1) — 59 endpoints, not 54.
8. **Session `location` sub-document is undocumented** in backend.md §3 (§3.3) — live feature missing from schema doc.
9. **`useDocumentTitle` architectural rule has 7 violations** (§7.3) — the very bug it was introduced to prevent can still occur.
10. **`r2.service.js` is dead code** (§4) — 260-line file, 8 exports, 0 callers. Remove or document as intentional fallback.

---

*Proceed to `01-dead-code.md` for the full dead-code inventory.*
