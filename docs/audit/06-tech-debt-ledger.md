# Tech Debt Ledger — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 (TD-002 / TD-004 / TD-005 / TD-010 / TD-012 / TD-013 shipped)

All findings from `00-drift.md`, `01-dead-code.md`, and `04-enhancements.md` converted into an actionable backlog. Severity: Critical/High/Medium/Low. Effort: XS (<1h) · S (<1d) · M (1-3d) · L (1w) · XL (>1w).

## Shipped so far (2026-04-21)

| ID | Status | Notes |
|---|---|---|
| TD-002 | ✅ DONE | Refresh-token rotation + reuse detection in [token.service.js](../../backend/src/services/token.service.js). Replaying a rotated-out token revokes all active sessions + sends `sendSessionRevokedEmail` with reason `REFRESH_TOKEN_REUSE`. Cookie overwrite added in [auth.controller.js `refreshToken`](../../backend/src/controllers/auth.controller.js). Unit test: [refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js). |
| TD-004 | ✅ DONE | `.env.example` cleaned: 13 dead vars removed (TOTP × 5, SMS × 2, legacy SMTP × 6), 11 undocumented vars added (OTP config, Firebase alt auth, compression service, trust proxy, geoip override, signed uploads), `REFRESH_TOKEN_EXPIRY` fixed `7d → 365d`. |
| TD-005 | ✅ DONE | `GET /api/hospitals` now cursor-paginated (`?limit&cursor&search`, cap 100, default 50) with server-side search + first-page totals. `HospitalsList.tsx` wired to the new contract: debounced server search, "Load more" button, totals-aware stat cards, delete syncs totals. |
| TD-010 | ✅ DONE | Deleted orphan frontend files: `CountdownTimer.tsx`, `SkeletonLoader.tsx`, `Toast.tsx`, `services/patientApi.ts`. Removed `listAppVersions` / `createAppVersion` / `updateAppVersion` + `AppVersion` interface from [hospitalService.ts](../../frontend/src/services/hospitalService.ts). `PasswordConfirmModal.tsx` did not exist on disk. `npx tsc --noEmit` clean; `npx vite build` succeeds. |
| TD-012 | ✅ DONE | `@getbrevo/brevo` + `axios` removed from [backend/package.json](../../backend/package.json); `node_modules` confirmed gone. Mail still works via `nodemailer` + Brevo SMTP; outbound HTTP via native `fetch`. |
| TD-013 | ✅ DONE | Pruned 10 dead enum members (`TOTP_*` × 8, `RECOVERY_*` × 2) from [AuditLog.js](../../backend/src/models/AuditLog.js). Grep confirmed no live emitter. Live enum regrouped by concern. |

---

## 🔥 Do This Week — Critical / Security / Production-impact

### TD-001 · High · S — Add audit logging to 8 mutation endpoints
- **Source:** `00-drift.md` §10 · `04-enhancements.md` SEC-020
- **Blast radius:** Compliance (cannot forensically trace who uploaded/created/renamed what); every hospital's mutation traffic.
- **Migration plan:** Add `logAudit()` calls (fire-and-forget, same pattern as existing auth-controller calls) to:
  1. [patient.controller.js `createPatient`](../../backend/src/controllers/patient.controller.js)
  2. [patient.controller.js `updatePatient`](../../backend/src/controllers/patient.controller.js)
  3. [patient.controller.js `createFolder`](../../backend/src/controllers/patient.controller.js)
  4. [patient.controller.js `uploadFile`](../../backend/src/controllers/patient.controller.js)
  5. [patient.controller.js `renameFile`](../../backend/src/controllers/patient.controller.js)
  6. [hospitals.controller.js `patchMe`](../../backend/src/controllers/hospitals.controller.js)
  7. [hospitals.controller.js `updateHospital`](../../backend/src/controllers/hospitals.controller.js) (log all field changes, not only activeTransition)
  8. [admin.controller.js `deleteOrphans`](../../backend/src/controllers/admin.controller.js)
  - Extend the `AuditLog.action` enum if needed (`PATIENT_CREATED`, `PATIENT_UPDATED`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED`, `HOSPITAL_PROFILE_PATCHED`, `HOSPITAL_UPDATED`, `ORPHAN_CLEANUP`).
- **Acceptance:** `git grep -n "logAudit\|AuditLog\.create" backend/src/controllers/` shows a call in every mutation handler.
- **Dependencies:** None.

### TD-002 · High · M — Implement refresh-token rotation + reuse detection — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` SEC-004
- **Blast radius:** All sessions. Security critical.
- **Shipped in:**
  - [backend/src/services/token.service.js](../../backend/src/services/token.service.js) — `refreshAccessToken` now generates a fresh refresh token on every call, persists it on the session, and returns the new value alongside `hospitalId` for the controller. Added `handlePossibleRefreshReuse(hospitalId)` which, on a JWT-valid but DB-missing token, revokes all active sessions (`revokedReason: "REFRESH_TOKEN_REUSE"`) + fires `notifySessionRevoked` + `sendSessionRevokedEmail`. Guards the benign post-logout-retry case by checking whether ANY other sessions are still active (if zero, the reuse handler exits — no blast radius).
  - [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js) — `refreshToken` uses `tokens.hospitalId` instead of re-querying by the old token (which wouldn't match after rotation) and overwrites the httpOnly `refreshToken` cookie with the new value so the next refresh presents the rotated token.
  - [backend/src/__tests__/refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js) — Jest unit test (in-process mocks; no live DB required). Covers rotation happy-path, reuse detection (active-session guard), post-logout benign case, and malformed-JWT short-circuit.
- **Acceptance:** Two consecutive refreshes each issue different refresh tokens ✓. Replaying an old refresh token raises `"Invalid or expired refresh token"` (401) and revokes all other active sessions + emails the hospital ✓.

### TD-003 · High · S — Remove dead `r2.service.js` + heavy S3 deps
- **Source:** `01-dead-code.md` §D
- **Blast radius:** `backend/package.json`, one file delete.
- **Migration plan:**
  1. Confirm no runtime config flips `USE_R2_STORAGE` or similar to `true`.
  2. Delete [backend/src/services/r2.service.js](../../backend/src/services/r2.service.js).
  3. Remove `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` from [backend/package.json](../../backend/package.json).
  4. Remove `R2_*` and `USE_LOCAL_STORAGE`, `LOCAL_STORAGE_PATH` from `.env.example` if the local-storage path is also dead (verify first).
- **Acceptance:** `npm run start` boots. `grep -r "r2\.service\|r2Service" backend/src/` is empty. Install size drops by ~7 MB.
- **Dependencies:** None.

### TD-004 · Medium · S — `.env.example` hygiene — ✅ SHIPPED 2026-04-21
- **Source:** `00-drift.md` §5
- **Blast radius:** Developer onboarding; nothing runtime.
- **Shipped in:** [.env.example](../../.env.example) — 13 dead vars removed (TOTP × 5, SMS × 2, legacy SMTP × 6); 11 undocumented-but-referenced vars added with sensible defaults (`OTP_EXPIRY_MINUTES=10`, `OTP_LENGTH=6`, `MAX_OTP_ATTEMPTS=5`, `SIGNED_UPLOADS_ENABLED=false`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `USE_COMPRESSION_SERVICE=false`, `COMPRESSION_SERVICE_URL`, `COMPRESSION_SERVICE_SECRET`, `TRUST_PROXY_HOPS=2`, `GEOIP_DEV_OVERRIDE_IP`); `REFRESH_TOKEN_EXPIRY` fixed from `7d` to `365d`. R2 block retained with an explicit "currently unused" header pending TD-003.
- **Acceptance:** Every `process.env.X` in `backend/src/` has a matching line in `.env.example`; no dead var remains.

### TD-005 · Medium · S — Add pagination to `GET /api/hospitals` — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` SEC-001 / PERF-001
- **Blast radius:** Admin UI (`HospitalsList.tsx`).
- **Shipped in:**
  - [backend/src/controllers/hospitals.controller.js](../../backend/src/controllers/hospitals.controller.js) — `getAllHospitals` accepts `?limit` (default 50, capped at 100), `?cursor=<_id>` (validated ObjectId; `_id: { $lt: cursor }` on a `_id: -1` sort for a stable, time-ordered cursor), and `?search=<string>` (escaped regex on hospitalName / email / phone / authCode — case-insensitive). Fetches `limit + 1` to detect `hasMore` without a count query. First-page responses also include a `totals` block `{ total, active, recentWeek }` so the stat cards don't need a second round-trip.
  - [frontend/src/pages/HospitalsList.tsx](../../frontend/src/pages/HospitalsList.tsx) — in-memory filter removed; search is now server-side with a 300 ms debounce (`debouncedSearch` effect refetches page 1). `nextCursor` / `loadingMore` state drive a "Load more" button appended after the card grid. Stat cards read from server-computed totals; delete handler decrements totals locally to stay in sync.
- **Acceptance:** With 200 hospitals the admin page loads 50 rows immediately, server-side search filters as you type, "Load more" fetches the next page on demand. Totals reflect global counts, not just the loaded window.

---

## 📅 Do This Quarter — High severity, planned work

### TD-006 · High · L — Establish real test coverage
- **Source:** `04-enhancements.md` §5.5 / QUAL-007
- **Migration plan:** Jest integration tests for the top 10 untested paths (listed in §5.5). Playwright E2E for login → Dashboard → PatientDetails. GitHub Action for CI.
- **Acceptance:** > 50% backend branch coverage in critical controllers; at least 1 E2E happy-path.
- **Dependencies:** None.

### TD-007 · Medium · M — Centralised structured logging (pino / bunyan) on backend
- **Source:** `04-enhancements.md` OBS-004
- **Migration plan:** Replace `console.log` with `pino` logger (JSON out); add request-id middleware; redact `Authorization` header + password fields.
- **Dependencies:** None.

### TD-008 · Medium · M — Probe all externals in `/api/health/deep`
- **Source:** `04-enhancements.md` OBS-001
- **Migration plan:** In [index.js:140-177](../../backend/src/index.js), add 2-3s-timeout probes for Cloudinary (`api.resource` for a sentinel), Brevo (ping endpoint), FCM (send no-op), sidecar (GET `/api/health`). Report per-dep status with degraded flag.
- **Dependencies:** None.

### TD-009 · Medium · M — Fix `useDocumentTitle` rule violations (7 pages)
- **Source:** `00-drift.md` §7.3
- **Migration plan:** Replace `document.title = "..."` with `useDocumentTitle("...")` in: Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode. Add a title to ForgotPassword.
- **Acceptance:** `grep -n "document\.title" frontend/src/pages/` is empty.
- **Dependencies:** None.

### TD-010 · Medium · S — Delete dead frontend code — ✅ SHIPPED 2026-04-21
- **Source:** `01-dead-code.md` §C
- **Shipped in:** Deleted `frontend/src/components/CountdownTimer.tsx`, `SkeletonLoader.tsx`, `Toast.tsx`, and `frontend/src/services/patientApi.ts`. Removed `listAppVersions`, `createAppVersion`, `updateAppVersion` (and the `AppVersion` interface + default-export entries) from [hospitalService.ts](../../frontend/src/services/hospitalService.ts). `PasswordConfirmModal.tsx` was never on disk (stale reference in the prior audit text).
- **Acceptance:** `npx tsc --noEmit` clean ✓. `npx vite build` succeeds in ~1 min, 2591 modules transformed ✓.

### TD-011 · Medium · M — Move `/components-preview` off the main bundle
- **Source:** `04-enhancements.md` PERF-006
- **Migration plan:** `lazy()` the route + `Suspense` fallback. Vite will code-split. This moves `recharts` + `lucide-react` out of the main chunk.
- **Acceptance:** `vite build --mode production` reports a smaller main chunk (est. -200-400 kB gzipped).
- **Dependencies:** None.

### TD-012 · Medium · S — Remove backend `@getbrevo/brevo` and `axios` deps — ✅ SHIPPED 2026-04-21
- **Source:** `01-dead-code.md` §B
- **Shipped in:** Removed both entries from [backend/package.json](../../backend/package.json); `npm uninstall @getbrevo/brevo axios` run by the user — `node_modules/@getbrevo` + `node_modules/axios` confirmed absent. Mail continues via `nodemailer` + Brevo SMTP; outbound HTTP uses native `fetch`.

### TD-013 · Medium · M — Remove dead `AuditLog.action` enum members (TOTP_*, RECOVERY_*) — ✅ SHIPPED 2026-04-21
- **Source:** `00-drift.md` §3.4
- **Shipped in:** [backend/src/models/AuditLog.js](../../backend/src/models/AuditLog.js) — pruned 10 dead values (`TOTP_SETUP_INITIATED`, `TOTP_SETUP_COMPLETED`, `TOTP_VERIFIED`, `TOTP_DISABLED`, `TOTP_ENABLED`, `TOTP_LOGIN_ATTEMPT`, `TOTP_ROTATION_INITIATED`, `TOTP_ROTATION_COMPLETED`, `RECOVERY_LOGIN_ATTEMPT`, `RECOVERY_LOGIN_SUCCESS`). Pre-prune grep confirmed no live code path emitted them (only `middleware/auth.js:109` comment mentions TOTP for historical context). Live enum regrouped by concern for readability.
- **Acceptance:** Live actions still validate; pruned values cannot be referenced since nothing was writing them.

### TD-014 · Medium · S — Sidecar timeout error string fix
- **Source:** `04-enhancements.md` OBS-005
- **Migration plan:** At [compression-service/app/endpoints/folder.py:274](../../compression-service/app/endpoints/folder.py) and [patient.py:288](../../compression-service/app/endpoints/patient.py), change "Pipeline exceeded 100s limit" → "Pipeline exceeded 300s limit" (or reference `_PIPELINE_TIMEOUT` directly).
- **Dependencies:** None.

---

## 🧹 Backlog Polish — Medium / Low, opportunistic

### TD-015 · Low · XS — Compression sidecar: bound `asyncio.gather` parallelism on source fetch
- **Source:** `04-enhancements.md` PERF-007 · `03-architecture-diagrams.md` §9
- **Migration plan:** Wrap fetch tasks in a `Semaphore(10)` in [cloudinary_client.py:169](../../compression-service/app/cloudinary_client.py).
- **Dependencies:** None.

### TD-016 · Low · XS — Remove unused `datetime` import in `cover_page.py`
- **Source:** Compression service recon (Explore agent)
- **Migration plan:** Delete line from [compression-service/app/compression/cover_page.py](../../compression-service/app/compression/cover_page.py).
- **Dependencies:** None.

### TD-017 · Low · S — Strip control chars from PDF-rendered text
- **Source:** `04-enhancements.md` SEC-010
- **Migration plan:** In [pdf.service.js](../../backend/src/services/pdf.service.js), sanitize `patientName` and `fileName` via `.replace(/[\x00-\x1F\x7F]/g, '')` before `drawText`.
- **Dependencies:** None.

### TD-018 · Low · XS — Remove `animate-shimmer` from Tailwind config OR adopt the utility
- **Source:** `01-dead-code.md` §E
- **Dependencies:** None.

### TD-019 · Low · S — Loud in-memory Redis fallback in prod
- **Source:** `04-enhancements.md` FAIL-002
- **Migration plan:** In [redis.service.js](../../backend/src/services/redis.service.js), if `NODE_ENV==="production"` AND Upstash env missing, log a loud `console.error` OR refuse to boot. Today it's silent.
- **Dependencies:** None.

### TD-020 · Low · M — Share API types between frontend and backend
- **Source:** `04-enhancements.md` QUAL-004 / CDRIFT-001
- **Migration plan:** Extract request/response types to `backend/src/types/` and import from the frontend via a symlinked or pnpm-workspace package. Or adopt Zod schemas referenced in both.
- **Dependencies:** None.

### TD-021 · Low · S — Route-level ErrorBoundary in frontend
- **Source:** `04-enhancements.md` OBS-003
- **Dependencies:** None.

### TD-022 · Low · S — Bump `bcryptjs` or migrate to native `bcrypt`
- **Source:** `04-enhancements.md` SEC-015
- **Migration plan:** `npm install bcryptjs@^3` OR switch to native `bcrypt` for performance. Re-run existing login tests.
- **Dependencies:** None.

### TD-023 · Low · XS — Explicitly pin JWT `alg` on verify
- **Source:** `04-enhancements.md` (hardening)
- **Migration plan:** In [utils/jwt.js](../../backend/src/utils/jwt.js), pass `{ algorithms: ["HS256"] }` to `jwt.verify`. The library defaults are safe; the explicit pin is belt-and-braces.
- **Dependencies:** None.

### TD-024 · Low · XS — CI integrity: add `npm ci` script + Dependabot
- **Source:** `04-enhancements.md` SEC-019
- **Dependencies:** None.

### TD-025 · Low · S — Cursor pagination for `/api/patients`
- **Source:** `04-enhancements.md` PERF-002
- **Migration plan:** Replace offset/limit in [patient.service.js](../../backend/src/services/patient.service.js) with `createdAt`+`_id` cursor. Preserve backward compatibility (keep offset as fallback) or bump API version.
- **Dependencies:** None.

### TD-026 · Low · M — Extract oversized pages into component files
- **Source:** `04-enhancements.md` QUAL-005
- **Migration plan:** Split `HospitalsList.tsx` (modals → separate files), `PatientDetails.tsx` (header, folder grid, modals), `ComponentsPreview.tsx` (sections). Aim for no file > 500 LOC.
- **Dependencies:** None.

### TD-027 · Low · S — Swap `ip-api.com` for a keyed GeoIP provider
- **Source:** `04-enhancements.md` §5.10 scaling cliffs
- **Migration plan:** Abstract [geoip.service.js](../../backend/src/services/geoip.service.js) behind a provider interface; add `ipinfo.io` implementation; keep `ip-api.com` as fallback.
- **Dependencies:** None.

---

## 🤔 Discuss First — Architectural decisions, not tickets

### TD-D1 — Soft-delete vs hard-delete for patients
- **Source:** `04-enhancements.md` scaling, features.md C13
- **Question:** Is 90-day hard-delete the right policy? Regulatory / "I accidentally deleted" recovery becomes impossible.
- **Options:** (a) keep hard-delete, (b) soft-delete with 30-day trash + cron hard-delete, (c) tier-based retention per hospital.
- **Who needs to decide:** Product + legal.

### TD-D2 — Web Edit-Patient: re-enable, move off, or commit to "mobile-only forever"
- **Source:** `02-commented-code.md` §1
- **Question:** Four blocks are commented out today. Is this a temporary hold or permanent policy?
- **Options:** (a) remove dead commented code and commit to mobile-only, (b) re-enable, (c) keep commented with a date-stamped decision note.
- **Who needs to decide:** Product.

### TD-D3 — Access token in sessionStorage (XSS exposure)
- **Source:** CLAUDE.md §10, `04-enhancements.md`
- **Question:** Worth migrating to in-memory + httpOnly refresh only?
- **Trade-off:** Harder page-refresh UX (must re-refresh on every cold start) vs tighter XSS posture.
- **Who needs to decide:** Security + frontend lead.

### TD-D4 — Compression sidecar default: on or off in new deployments?
- **Source:** backend.md §6
- **Question:** Many features (big PDF export) degrade to local pdf-lib merge when sidecar is off and OOM risk at scale. Should the sidecar be required in prod?
- **Options:** (a) document as strongly recommended, (b) hard-require via env-assertion, (c) build merge into Node natively.
- **Who needs to decide:** Ops + SRE.

### TD-D5 — Multi-replica deployment of the backend
- **Source:** `04-enhancements.md` RACE-005 + FAIL-002
- **Question:** Auto-delete cron has no distributed lock; in-memory Redis fallback becomes per-instance. Do we plan for HA?
- **Options:** (a) commit to single-instance forever (simpler), (b) add Mongo-based job lock + require Upstash in prod.
- **Who needs to decide:** Ops.

---

## Summary

| Tier | Items | Total effort |
|---|---|---|
| 🔥 This Week | 5 | ~1 week |
| 📅 This Quarter | 9 | ~3-4 weeks |
| 🧹 Backlog Polish | 13 | opportunistic |
| 🤔 Discuss First | 5 | architecture decisions |

Fix the This-Week items before recommending this system for new production deployments: audit gaps + token rotation + dead code + `.env.example` + hospitals pagination are all load-bearing for compliance / onboarding / security.
