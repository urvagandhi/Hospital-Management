# Dead Code Inventory — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 (several items resolved — see checkmarks inline)

Each finding has a confidence rating (`HIGH` / `MEDIUM` / `LOW`) and a recommended action (`DELETE` / `INVESTIGATE` / `KEEP-WITH-COMMENT` / `MOBILE_ONLY?`).

---

## A. Unused Frontend npm Dependencies

| Package | Version | Import count in `frontend/src/` | Confidence | Recommended Action |
|---|---|---|---|---|
| `recharts` | ^3.8.1 | 1 (only [ComponentsPreview.tsx:19](../../frontend/src/pages/ComponentsPreview.tsx)) | HIGH | **INVESTIGATE** — only used by the unlinked `/components-preview` design gallery. If the gallery is production-facing, keep; otherwise remove both the page and the dep. |
| `lucide-react` | ^1.8.0 | 1 (only [ComponentsPreview.tsx:15](../../frontend/src/pages/ComponentsPreview.tsx)) | HIGH | **INVESTIGATE** — same story. Gallery-only. |

All other `frontend/package.json` deps are live (`react`, `react-dom`, `react-router-dom`, `axios`, `@headlessui/react`).

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

| Path:Symbol | Type | Inbound imports | Confidence | Recommended Action |
|---|---|---|---|---|
| [services/r2.service.js](../../backend/src/services/r2.service.js) (entire file; 8 exports) | service | 0 | HIGH | **DELETE file** + `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` deps (listed but only referenced by this dead file). Cloudinary is the only storage path the code uses. |
| [services/mail.service.js:sendLogoutConfirmationEmail](../../backend/src/services/mail.service.js#L598) | named export | 0 | HIGH | **DELETE** — no caller. |
| [services/token.service.js:cleanupExpiredSessions](../../backend/src/services/token.service.js#L294) | named export | 0 | HIGH | **DELETE** — TTL index on `Session.expiresAt` (`expireAfterSeconds: 0`) auto-deletes; this is belt-and-braces with no invoker. |
| [middleware/validateRequest.js](../../backend/src/middleware/validateRequest.js) | module | 0 | MEDIUM | **INVESTIGATE** — agent reports no route imports it; however routes use `express-validator`'s `.withMessage()` + a local `validate` handler in `auth.routes.js`. Confirm whether this file was superseded before deleting. |

---

## E. Unused Tailwind Tokens

| Token | Defined | Referenced | Confidence | Action |
|---|---|---|---|---|
| `animate-shimmer` | [tailwind.config.js](../../frontend/tailwind.config.js) | 0 (keyframe `shimmer` is used inline in `LoadingSpinners.tsx`, but the `animate-shimmer` utility class is not) | MEDIUM | **DELETE the animation entry or use it consistently.** |

All other custom tokens (primary colour scale, surface, gradient-primary, etc.) are referenced.

---

## F. Endpoints with Zero Frontend Callers

These are backend endpoints the React frontend never calls. Most are legitimately **MOBILE_ONLY** — the Android app uses them. Before any deletion, confirm with the mobile client. (See `android-app/` — out of scope for this audit, but a targeted grep of the Kotlin tree would confirm.)

| Endpoint | Frontend callers | Presumed consumer |
|---|---|---|
| `POST /api/auth/register` | 0 | MOBILE_ONLY (self-service registration) |
| `POST /api/auth/register/verify-otp` | 0 | MOBILE_ONLY |
| `POST /api/auth/register/resend-otp` | 0 | MOBILE_ONLY |
| `POST /api/auth/biometric/register` | 0 | MOBILE_ONLY |
| `POST /api/auth/biometric/challenge` | 0 | MOBILE_ONLY |
| `POST /api/auth/biometric/verify` | 0 | MOBILE_ONLY |
| `POST /api/auth/session/check-conflict` | 0 | MOBILE_ONLY |
| `POST /api/auth/session/force-logout` | 0 | MOBILE_ONLY |
| `GET /api/auth/session/validate` | 0 | MOBILE_ONLY |
| `POST /api/auth/session/reverify-auth-code` | 0 | MOBILE_ONLY |
| `POST /api/auth/fcm-token` | 0 | MOBILE_ONLY |
| `POST /api/patients` (create) | 0 | MOBILE_ONLY (§11 says web is read-only) |
| `PUT /api/patients/:patientId` | 0 | MOBILE_ONLY (web Edit-Patient is commented out) |
| `POST /api/patients/:patientId/folders` | 0 | MOBILE_ONLY |
| `POST /api/patients/:patientId/files/:folderName` (upload) | 0 | MOBILE_ONLY |
| `PATCH /api/patients/.../rename` | 0 | MOBILE_ONLY |
| `DELETE /api/patients/.../:fileId` | 0 | MOBILE_ONLY |
| `GET /api/patients/.../stream` | 0 | MOBILE_ONLY (web uses `/signed-url` + iframe) |
| `GET /api/export/sample-cover` | 0 | **UNUSED?** — Public HTML preview; no mobile/web reference found. **INVESTIGATE** — design-only endpoint. |
| `GET /api/notifications/sample` | 0 | **UNUSED?** — HTML mockup preview; no frontend link. **INVESTIGATE.** |
| `GET /api/notifications/preview` | 0 | **UNUSED?** — JSON preview; no caller. **INVESTIGATE.** |
| `POST /api/export/archive` | 0 | **INVESTIGATE** — frontend.md mentions multi-module archive but no page in `pages/` calls it. Possibly dead. |
| `POST /api/notifications/test` | 0 | **UNUSED on both clients?** Admin test endpoint; verify. |
| `POST /api/auth/login/resend-auth-code` | 0 (frontend service exports but no page calls) | MOBILE_ONLY or dead — confirm. |

**Recommendation:** Ask the Android team to confirm the `MOBILE_ONLY` presumed rows; delete the three `INVESTIGATE` preview endpoints if no one uses them.

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

**Remaining Quick Win:** TD-003 (R2 service + AWS SDK deps). Net already-shipped impact: smaller bundle, simpler mental model, `.env.example` diffs zero-out.
