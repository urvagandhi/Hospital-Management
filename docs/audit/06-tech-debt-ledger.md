# Tech Debt Ledger — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 (TD-001 / TD-002 / TD-004 / TD-005 / TD-007 / TD-008 / TD-009 / TD-010 / TD-011 / TD-012 / TD-013 / TD-014 / TD-015 / TD-016 / TD-018 shipped)

All findings from `00-drift.md`, `01-dead-code.md`, and `04-enhancements.md` converted into an actionable backlog. Severity: Critical/High/Medium/Low. Effort: XS (<1h) · S (<1d) · M (1-3d) · L (1w) · XL (>1w).

## Shipped so far (2026-04-21)

| ID | Status | Notes |
|---|---|---|
| TD-002 | ✅ DONE | Refresh-token rotation + reuse detection in [token.service.js](../../backend/src/services/token.service.js). Replaying a rotated-out token revokes all active sessions + sends `sendSessionRevokedEmail` with reason `REFRESH_TOKEN_REUSE`. Cookie overwrite added in [auth.controller.js `refreshToken`](../../backend/src/controllers/auth.controller.js). Unit test: [refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js). |
| TD-004 | ✅ DONE | `.env.example` cleaned: 13 dead vars removed (TOTP × 5, SMS × 2, legacy SMTP × 6), 11 undocumented vars added (OTP config, Firebase alt auth, compression service, trust proxy, geoip override, signed uploads), `REFRESH_TOKEN_EXPIRY` fixed `7d → 365d`. |
| TD-005 | ✅ DONE | `GET /api/hospitals` now cursor-paginated (`?limit&cursor&search`, cap 100, default 50) with server-side search + first-page totals. `HospitalsList.tsx` wired to the new contract: debounced server search, "Load more" button, totals-aware stat cards, delete syncs totals. |
| TD-007 | ✅ DONE | Centralised pino logger at [utils/logger.js](../../backend/src/utils/logger.js); `pino-http` adds a per-request `X-Request-Id` + `req.log` child in [index.js](../../backend/src/index.js). Pretty output in dev, JSON in prod, `LOG_LEVEL` env. Redact list covers Authorization/Cookie headers and top-level + nested `password / newPassword / oldPassword / currentPassword / confirmPassword / token / refreshToken / otp / authCode`. Zero `console.*` remain in `backend/src/`; 330+ call-sites migrated across 27 files (configs × 3, controllers × 8, middleware × 2, routes × 2, services × 10, jobs, seed, index). `backend/scripts/` intentionally left on `console.*` (CLI operator output). Dev-only ASCII boot banner preserved via `process.stdout.write`. Cloudinary probe in `/api/health/deep` bumped to 5s to match its cold-call latency. |
| TD-008 | ✅ DONE | `/api/health/deep` now probes Mongo, Redis, Cloudinary, Brevo, FCM, and the compression sidecar in parallel with a 3s hard timeout per probe. Response shape: `{ status, degraded, checks: { server, database, redis, cloudinary, brevo, fcm, sidecar }, timestamp }`. Per-dep fields include `latency_ms` and an optional `detail`; unconfigured deps (`BREVO_API_KEY` missing, `USE_COMPRESSION_SERVICE=false`, etc.) report `status: "disabled"` and do NOT mark the system degraded. Probe logic lives in [health.service.js](../../backend/src/services/health.service.js). |
| TD-009 | ✅ DONE | Replaced direct `document.title = "..."` with `useDocumentTitle("...")` in Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode, and ForgotPassword. `grep -rn "document\.title" frontend/src/pages/` is empty; `npx tsc --noEmit` clean. |
| TD-011 | ✅ DONE | `/components-preview` and `/spinners-preview` are now `lazy()` in [AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx) with a `<Suspense fallback>` running the shared `Spinner`. Vite now emits `ComponentsPreview-*.js` (438 kB raw / 121 kB gz — carries `recharts` + `lucide-react`) and `LoadingSpinners-*.js` (15 kB raw / 4 kB gz) as separate chunks. Main `index-*.js` chunk drops from ~872 kB raw / ~231 kB gz to 434 kB raw / 110 kB gz. |
| TD-014 | ✅ DONE | Sidecar 504 body + schema default both read `"Pipeline exceeded 300s limit"` in [folder.py:285](../../compression-service/app/endpoints/folder.py), [patient.py:301](../../compression-service/app/endpoints/patient.py), and [schemas.py:73](../../compression-service/app/schemas.py); matches `_PIPELINE_TIMEOUT = 300.0`. |
| TD-015 | ✅ DONE | Bounded `fetch_source_pdfs` parallelism in [cloudinary_client.py](../../compression-service/app/cloudinary_client.py) with `asyncio.Semaphore(10)` (`_FETCH_CONCURRENCY = 10`). `_fetch_one` wrapped `async with semaphore:`; gather/order preserved. Prevents connection-pool saturation + Cloudinary rate-limit trips on patients with many files. |
| TD-016 | ✅ DONE | Removed unused `from datetime import datetime, timezone` at [cover_page.py:14](../../compression-service/app/compression/cover_page.py). No call sites referenced it; file parses clean. |
| TD-018 | ✅ DONE | Deleted three orphan shimmer entries (`backgroundImage.shimmer`, `animation.shimmer`, `keyframes.shimmer`) from [frontend/tailwind.config.js](../../frontend/tailwind.config.js). No component used `animate-shimmer` / `bg-shimmer`; inline keyframes in `globals.css` + `LoadingSpinners.tsx` untouched. `npx tsc --noEmit` clean. |
| TD-010 | ✅ DONE | Deleted orphan frontend files: `CountdownTimer.tsx`, `SkeletonLoader.tsx`, `Toast.tsx`, `services/patientApi.ts`. Removed `listAppVersions` / `createAppVersion` / `updateAppVersion` + `AppVersion` interface from [hospitalService.ts](../../frontend/src/services/hospitalService.ts). `PasswordConfirmModal.tsx` did not exist on disk. `npx tsc --noEmit` clean; `npx vite build` succeeds. |
| TD-012 | ✅ DONE | `@getbrevo/brevo` + `axios` removed from [backend/package.json](../../backend/package.json); `node_modules` confirmed gone. Mail still works via `nodemailer` + Brevo SMTP; outbound HTTP via native `fetch`. |
| TD-013 | ✅ DONE | Pruned 10 dead enum members (`TOTP_*` × 8, `RECOVERY_*` × 2) from [AuditLog.js](../../backend/src/models/AuditLog.js). Grep confirmed no live emitter. Live enum regrouped by concern. |

---

## 🔥 Do This Week — Critical / Security / Production-impact

### TD-001 · High · S — Add audit logging to 8 mutation endpoints — ✅ SHIPPED 2026-04-21
- **Source:** `00-drift.md` §10 · `04-enhancements.md` SEC-020
- **Blast radius:** Compliance (cannot forensically trace who uploaded/created/renamed what); every hospital's mutation traffic.
- **Shipped in:**
  - [backend/src/models/AuditLog.js](../../backend/src/models/AuditLog.js) — enum extended with `PATIENT_CREATED`, `PATIENT_UPDATED`, `PATIENT_FILE_DELETE`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED`, `HOSPITAL_UPDATED`, `HOSPITAL_RESEND_WELCOME`, `CONTACT_CHANGE_RESEND`, `AUTH_CODE_RESEND`, `BIOMETRIC_REGISTERED`, `ORPHAN_CLEANUP`. The last five fix pre-existing silently-failing emits that the Mongoose validator was rejecting.
  - [backend/src/controllers/patient.controller.js](../../backend/src/controllers/patient.controller.js) — `logAudit()` (fire-and-forget, existing helper) now emits `PATIENT_CREATED`, `PATIENT_UPDATED`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED` inside the five mutation handlers, each capturing the hospital-scoped patient MongoId + human `patientId` + a minimal diff.
  - [backend/src/controllers/hospitals.controller.js](../../backend/src/controllers/hospitals.controller.js) — `updateHospital` now snapshots the pre-change profile, computes a `changedFields` list (`hospitalName`, `email`, `phone`, `address`, `isActive`, `logoUrl`), and emits a `HOSPITAL_UPDATED` audit on every successful save — not only on `isActive` transitions. The pre-existing `PROFILE_PATCHED` activeTransition entries remain as richer purpose-specific records. `patchMe` already emitted `PROFILE_PATCHED`; left unchanged.
  - [backend/src/controllers/admin.controller.js](../../backend/src/controllers/admin.controller.js) — imported `AuditLog`; `deleteOrphans` now emits `ORPHAN_CLEANUP` (status `SUCCESS`/`FAILURE` based on per-resource failure count) with `{ cloudinaryTotal, dbReferencedCount, deletedCount, deletedBytes, failedCount }`.
- **Acceptance:** `git grep -n "logAudit\|AuditLog\.create" backend/src/controllers/` returns a call in every mutation handler ✓. `node --check` passes on all four modified files ✓.

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

### TD-007 · Medium · M — Centralised structured logging (pino) on backend — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` OBS-004
- **Blast radius:** Every log line in the backend — observability, secret-leak posture, ops correlation.
- **Shipped in:**
  - [backend/src/utils/logger.js](../../backend/src/utils/logger.js) — shared `pino` logger. JSON in prod, `pino-pretty` in dev (colour, `SYS:standard` time, `singleLine=false`). Base fields `service: "hms-backend"` + `env`. `LOG_LEVEL` env drives the level (`info` default in prod, `debug` in dev). Exports `httpLogger` = `pino-http` middleware with a `genReqId` that trusts an incoming `X-Request-Id` (<200 chars) or mints `crypto.randomUUID()`, and always echoes the id back on the response header. `customLogLevel` maps 5xx → `error`, 4xx → `warn`, else `info`.
  - **Redaction (centralised)** — `REDACT_PATHS` covers `req.headers.authorization`, `req.headers.cookie`, `req.headers["set-cookie"]`, `res.headers["set-cookie"]`, and both top-level AND nested forms (via `*.field`) of `password`, `newPassword`, `oldPassword`, `currentPassword`, `confirmPassword`, `token`, `refreshToken`, `otp`, `authCode`. Any new secret-ish field should be added here rather than pre-scrubbed at call sites.
  - [backend/src/index.js](../../backend/src/index.js) — old ad-hoc request-logger middleware (which was itself leaking headers in dev) replaced with `app.use(httpLogger)` above CORS/body-parsers. Boot flow now emits `server_started` (structured) and keeps the ASCII banner as `process.stdout.write(...)` gated on `NODE_ENV !== "production"` so humans keep the visual and aggregators get the JSON. CORS block → `logger.warn({ event: "cors_blocked", origin })`. Health endpoints log via `req.log` with `event: "health_hit" | "health_deep_hit" | "health_deep_failed"`.
  - [backend/src/middleware/errorHandler.js](../../backend/src/middleware/errorHandler.js) — unconditional structured error log (`event: "request_error"`, with `err` + `status_code`), up from dev-only. Uses `req.log` when available (request-id stays attached), falls back to the module logger otherwise. Stack is still only echoed to the client in dev.
  - **330+ `console.*` call sites migrated across 27 files** in `backend/src/`:
    - Configs × 3 (`db.js`, `env.js`, `firebase.js`)
    - Jobs × 1 (`autoDelete.job.js`) · Seed (`seed.js`) · Entry (`index.js`)
    - Middleware × 2 (`auth.js`, `errorHandler.js`)
    - Routes × 2 (`auth.routes.js`, `patient.routes.js`)
    - Controllers × 8 (`auth` × 51, `patient` × 24, `hospitals` × 24, `admin` × 7, plus `appVersion`, `audit`, `export`, `notifications`)
    - Services × 10 (`redis` × 28, `patient` × 36, `push` × 10, `token` × 10, `mail` × 6, `pdf` × 4, `geoip` × 4, `r2` × 20, `compression` × 1, `zip` × 1)
    - Handler scope uses `req.log` (pre-bound to `request_id`); non-handler scope imports the module-level `logger`. `.catch(console.error)` fire-and-forget sites were rewritten as `.catch((err) => req.log.error({ event, err }, "..."))` so silent auth/notify failures are now captured.
  - **Cloudinary probe bump** — `/api/health/deep` Cloudinary probe in [health.service.js](../../backend/src/services/health.service.js) gets its own 5s budget (SDK `{ timeout: 5000 }` + outer race) because `cloudinary.api.ping()` lands 2–4s cold and was flapping the global 3s budget.
  - [.env.example](../../.env.example) — documented `LOG_LEVEL` under a new `── Logging (pino) ──` block.
  - [CLAUDE.md](../../CLAUDE.md) §3 + §9 + §10 updated (stack row adds pino/pino-http, §9 documents the `LOG_LEVEL` env + request-id semantics + redaction list, §10 flips the "no structured logging" smell to ✅ resolved).
  - [backend/README.md](../../backend/README.md) — new **Logging** section spelling out the `req.log` vs module-logger convention, the redaction list, and the deliberate `backend/scripts/` opt-out.
- **Deliberate non-scope:** `backend/scripts/` (13 operator CLIs: migrations, smoke tests, manual pushes) stays on raw `console.*`. Rationale: those scripts exist to print human-readable progress for an operator; structured logs are noisier than stdout there. A partial scripts migration was attempted and reverted.
- **Acceptance:**
  - `grep -rn "console\\." backend/src/` → zero matches ✓
  - `node --check` passes on every edited file ✓
  - Smoke test of logger: `{ event, err }` → pino's std serializer emits `type/message/stack` ✓
  - Dev boot shows the ASCII banner then the structured `server_started` log ✓
  - `X-Request-Id` echoed on every HTTP response; pino-pretty prefixes each line with timestamp + level + event fields ✓

### TD-008 · Medium · M — Probe all externals in `/api/health/deep` — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` OBS-001
- **Blast radius:** Observability / on-call runbooks — the deep health endpoint is the single "is the system actually healthy?" signal for synthetic monitors.
- **Shipped in:**
  - [backend/src/services/health.service.js](../../backend/src/services/health.service.js) — new `probeAllExternals()` runs every dep in parallel via `Promise.all` with a per-probe timeout (default 3s, AbortController-backed so fetch-based probes cancel cleanly). Each check returns a uniform shape `{ status, latency_ms, detail?, ...extra }`. Statuses: `"ok" | "error" | "timeout" | "disabled" | "disconnected"`. Probes: `probeDatabase` (mongoose `admin.ping()`), `probeRedis` (wraps the existing `pingRedis()` which discriminates Upstash vs in-memory fallback), `probeCloudinary` (`cloudinary.api.ping({ timeout: 5000 })` — **5s budget** to match the SDK's 2-4s cold-call latency), `probeBrevo` (`GET https://api.brevo.com/v3/account` with `api-key` header), `probeFcm` (cheapest round-trip that validates creds — `admin.app().options.credential.getAccessToken()` against Google OAuth; no fake FCM tokens), `probeSidecar` (`GET ${COMPRESSION_SERVICE_URL}/api/health`).
  - **"disabled" semantics** — dependencies without env configured (`BREVO_API_KEY` missing, `USE_COMPRESSION_SERVICE=false`, Firebase not set, etc.) report `status: "disabled"` and DO NOT mark the system degraded. A feature not wired in this env can't be failing.
  - [backend/src/index.js](../../backend/src/index.js) — `/api/health/deep` handler reduced to a thin wrapper around `probeAllExternals()`. Response shape is now `{ status, degraded, checks: { server, database, redis, cloudinary, brevo, fcm, sidecar }, timestamp }`. HTTP status: 200 when not degraded, 503 otherwise. Runner-level errors produce a 503 with `status: "error"`.
  - [backend/README.md](../../backend/README.md) — endpoint table updated: "DB + Redis + Cloudinary + Brevo + FCM + sidecar probes (3s per-dep timeout; `degraded` flag)".
- **Acceptance:** Live probe against configured environment returns 200 with every dep `"ok"`; pulling any env var flips that dep to `"disabled"` without flipping `degraded`; killing an external surface flips it to `"timeout"`/`"error"` and the whole endpoint to 503.

### TD-009 · Medium · M — Fix `useDocumentTitle` rule violations (7 pages) — ✅ SHIPPED 2026-04-21
- **Source:** `00-drift.md` §7.3
- **Blast radius:** UX — without `useDocumentTitle`, a previous page's title leaks into the next page after navigation (the hook restores the prior title on unmount; direct `document.title =` does not).
- **Shipped in:**
  - [frontend/src/pages/Dashboard.tsx](../../frontend/src/pages/Dashboard.tsx) → `useDocumentTitle("Dashboard - Hospital Management")`
  - [frontend/src/pages/Login.tsx](../../frontend/src/pages/Login.tsx) → `useDocumentTitle("Login - Hospital Management")`
  - [frontend/src/pages/Password.tsx](../../frontend/src/pages/Password.tsx) → `useDocumentTitle("Change Password — Hospital Management")`
  - [frontend/src/pages/Profile.tsx](../../frontend/src/pages/Profile.tsx) → `useDocumentTitle("Profile — Hospital Management")` (placed alongside the existing `useScrollToHash()` call)
  - [frontend/src/pages/Sessions.tsx](../../frontend/src/pages/Sessions.tsx) → `useDocumentTitle("Security & Sessions — Hospital Management")`
  - [frontend/src/pages/VerifyAuthCode.tsx](../../frontend/src/pages/VerifyAuthCode.tsx) → `useDocumentTitle("Enter Auth Code — Hospital Management")`
  - [frontend/src/pages/ForgotPassword.tsx](../../frontend/src/pages/ForgotPassword.tsx) → `useDocumentTitle("Forgot Password — Hospital Management")` (its own `useEffect` form was already setting the same string; migrated in place)
  - In every file only the `document.title = ...` line was removed; other effects, imports, and behaviour were preserved.
- **Acceptance:** `grep -rn "document\.title" frontend/src/pages/` → empty ✓. `npx tsc --noEmit` clean ✓.

### TD-010 · Medium · S — Delete dead frontend code — ✅ SHIPPED 2026-04-21
- **Source:** `01-dead-code.md` §C
- **Shipped in:** Deleted `frontend/src/components/CountdownTimer.tsx`, `SkeletonLoader.tsx`, `Toast.tsx`, and `frontend/src/services/patientApi.ts`. Removed `listAppVersions`, `createAppVersion`, `updateAppVersion` (and the `AppVersion` interface + default-export entries) from [hospitalService.ts](../../frontend/src/services/hospitalService.ts). `PasswordConfirmModal.tsx` was never on disk (stale reference in the prior audit text).
- **Acceptance:** `npx tsc --noEmit` clean ✓. `npx vite build` succeeds in ~1 min, 2591 modules transformed ✓.

### TD-011 · Medium · M — Move `/components-preview` off the main bundle — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` PERF-006
- **Blast radius:** Bundle size — first-paint time + bandwidth for every user of every route, even though `/components-preview` and `/spinners-preview` are design-gallery pages almost no one ever visits.
- **Shipped in:**
  - [frontend/src/routes/AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx) — `ComponentsPreview` and `LoadingSpinners` converted from eager imports to `React.lazy(() => import(...))`. Both routes wrapped in `<Suspense fallback={<PreviewFallback />}>` where the fallback is a centered shared `<Spinner />` on `bg-surface-bg` (lightweight, no heavy deps, no calc-height dependency since these routes live outside `MainLayout`).
  - Scope expanded beyond the ticket: the ticket named only `/components-preview`, but `/spinners-preview` (19-variant design showcase) was a sibling with the same profile — also lazied in the same pass.
- **Acceptance:** Vite production build emits three distinct chunks:
  - Main `index-*.js` — **434 kB raw / 110 kB gz** (was ~872 kB raw / ~231 kB gz). **−438 kB raw / −121 kB gz off the main chunk.**
  - `ComponentsPreview-*.js` — 438 kB raw / 121 kB gz (carries `recharts` + `lucide-react`, which are now isolated to this chunk only)
  - `LoadingSpinners-*.js` — 15 kB raw / 4 kB gz
- `npx tsc --noEmit` clean ✓.

### TD-012 · Medium · S — Remove backend `@getbrevo/brevo` and `axios` deps — ✅ SHIPPED 2026-04-21
- **Source:** `01-dead-code.md` §B
- **Shipped in:** Removed both entries from [backend/package.json](../../backend/package.json); `npm uninstall @getbrevo/brevo axios` run by the user — `node_modules/@getbrevo` + `node_modules/axios` confirmed absent. Mail continues via `nodemailer` + Brevo SMTP; outbound HTTP uses native `fetch`.

### TD-013 · Medium · M — Remove dead `AuditLog.action` enum members (TOTP_*, RECOVERY_*) — ✅ SHIPPED 2026-04-21
- **Source:** `00-drift.md` §3.4
- **Shipped in:** [backend/src/models/AuditLog.js](../../backend/src/models/AuditLog.js) — pruned 10 dead values (`TOTP_SETUP_INITIATED`, `TOTP_SETUP_COMPLETED`, `TOTP_VERIFIED`, `TOTP_DISABLED`, `TOTP_ENABLED`, `TOTP_LOGIN_ATTEMPT`, `TOTP_ROTATION_INITIATED`, `TOTP_ROTATION_COMPLETED`, `RECOVERY_LOGIN_ATTEMPT`, `RECOVERY_LOGIN_SUCCESS`). Pre-prune grep confirmed no live code path emitted them (only `middleware/auth.js:109` comment mentions TOTP for historical context). Live enum regrouped by concern for readability.
- **Acceptance:** Live actions still validate; pruned values cannot be referenced since nothing was writing them.

### TD-014 · Medium · S — Sidecar timeout error string fix — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` OBS-005
- **Blast radius:** Ops / incident triage — the 504 response body is the operator's first clue when a compression job times out. Wrong number → wasted minutes hunting a phantom 100s timeout that doesn't exist.
- **Shipped in:**
  - [compression-service/app/endpoints/folder.py:285](../../compression-service/app/endpoints/folder.py) → `"detail": "Pipeline exceeded 300s limit"` (matches `_PIPELINE_TIMEOUT = 300.0` at line 38)
  - [compression-service/app/endpoints/patient.py:301](../../compression-service/app/endpoints/patient.py) → same
  - [compression-service/app/schemas.py:73](../../compression-service/app/schemas.py) → `detail: str = "Pipeline exceeded 300s limit"` (shared schema default)
- **Acceptance:** `grep -n "Pipeline exceeded" compression-service/` returns three occurrences, all `"300s limit"` ✓.

---

## 🧹 Backlog Polish — Medium / Low, opportunistic

### TD-015 · Low · XS — Compression sidecar: bound `asyncio.gather` parallelism on source fetch — ✅ SHIPPED 2026-04-21
- **Source:** `04-enhancements.md` PERF-007 · `03-architecture-diagrams.md` §9
- **Shipped in:** [compression-service/app/cloudinary_client.py](../../compression-service/app/cloudinary_client.py) — added `_FETCH_CONCURRENCY = 10` module-level constant and an `asyncio.Semaphore(_FETCH_CONCURRENCY)` created inside `fetch_source_pdfs`. Every call to the inner `_fetch_one` is now wrapped `async with semaphore:`, so a patient with hundreds of files can't swamp the httpx connection pool, starve the event loop, or trip Cloudinary per-IP rate limits. `asyncio.gather(*tasks)` left unchanged — order preservation matters for the merge step. Python `ast.parse` clean.

### TD-016 · Low · XS — Remove unused `datetime` import in `cover_page.py` — ✅ SHIPPED 2026-04-21
- **Source:** Compression service recon (Explore agent)
- **Shipped in:** [compression-service/app/compression/cover_page.py:14](../../compression-service/app/compression/cover_page.py) — deleted `from datetime import datetime, timezone` (no call sites in the file). `python3 -m ast` parse clean; no runtime change.

### TD-017 · Low · S — Strip control chars from PDF-rendered text
- **Source:** `04-enhancements.md` SEC-010
- **Migration plan:** In [pdf.service.js](../../backend/src/services/pdf.service.js), sanitize `patientName` and `fileName` via `.replace(/[\x00-\x1F\x7F]/g, '')` before `drawText`.
- **Dependencies:** None.

### TD-018 · Low · XS — Remove `animate-shimmer` from Tailwind config — ✅ SHIPPED 2026-04-21
- **Source:** `01-dead-code.md` §E
- **Shipped in:** [frontend/tailwind.config.js](../../frontend/tailwind.config.js) — removed three orphan entries (`backgroundImage.shimmer`, `animation.shimmer`, `keyframes.shimmer`). No component applied `animate-shimmer` / `bg-shimmer`; the only shimmer effects in the app (`globals.css:14-22`, `LoadingSpinners.tsx:282-400`) redeclare their own inline `@keyframes shimmer` and were left untouched. `npx tsc --noEmit` clean; `grep -rn "animate-shimmer\|bg-shimmer" frontend/src/` returns zero.

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

| Tier | Items | Shipped | Open | Total effort |
|---|---|---|---|---|
| 🔥 This Week | 5 | 4 (TD-001 / TD-002 / TD-004 / TD-005) | 1 (TD-003) | ~1 day remaining |
| 📅 This Quarter | 9 | 5 (TD-007 / TD-008 / TD-009 / TD-010 / TD-011 / TD-012 / TD-013 / TD-014) | 2 (TD-006 / TD-015+ is backlog) | ~1 week remaining |
| 🧹 Backlog Polish | 13 | 0 | 13 | opportunistic |
| 🤔 Discuss First | 5 | — | — | architecture decisions |

**Remaining This-Week item (High severity):**

- **TD-003** — delete dead `r2.service.js` + drop the `@aws-sdk/*` deps (~7 MB install shrink).

After TD-003 lands, the This-Week tier is clear. The This-Quarter tier still owes **TD-006** (real test coverage — the big one).
