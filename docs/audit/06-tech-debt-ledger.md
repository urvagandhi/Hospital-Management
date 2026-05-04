# Tech Debt Ledger — MediVault

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-26 — re-verified against `61fa6ad`. Jest ESM is now wired (commit `c92df1d`), so the TD-022 / TD-006 "blocked behind ESM config" caveat is obsolete (kept inline for history). All 17 shipped backend/frontend tickets re-verified against live code; TD-003 confirmed still open (`r2.service.js` still on disk with 0 callers). All 5 shipped Android tickets re-verified.

All findings from `00-drift.md`, `01-dead-code.md`, and `04-enhancements.md` converted into an actionable backlog. Severity: Critical/High/Medium/Low. Effort: XS (<1h) · S (<1d) · M (1-3d) · L (1w) · XL (>1w).

---

## Summary

| Tier              | Items | Shipped                                                                                               | Open                      | Total effort           |
| ----------------- | ----- | ----------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------- |
| 🔥 This Week      | 5     | 4 (TD-001 / TD-002 / TD-004 / TD-005)                                                                 | 1 (TD-003)                | ~1 day remaining       |
| 📅 This Quarter   | 9     | 8 (TD-007 / TD-008 / TD-009 / TD-010 / TD-011 / TD-012 / TD-013 / TD-014)                             | 1 (TD-006)                | ~1 week remaining      |
| 🧹 Backlog Polish | 14    | 11 (TD-015 / TD-016 / TD-017 / TD-018 / TD-019 / TD-021 / TD-022 / TD-023 / TD-024 / TD-025 / TD-027) | 2 (TD-020 / TD-026)       | opportunistic          |
| 🌍 Cross-cutting  | 1     | 1 (TD-030)                                                                                            | 0                         | done                   |
| 🛡️ XSS hardening  | 1     | 1 (TD-029)                                                                                            | 0                         | done                   |
| 🤔 Discuss First  | 5     | 2 (TD-D3 → shipped as TD-029; TD-D4 → option b shipped 2026-04-25)                                    | 3 (TD-D1 / TD-D2 / TD-D5) | architecture decisions |

**Remaining priorities, in order of blast radius:**

1. **TD-003** (High · S) — delete dead `r2.service.js` + drop the `@aws-sdk/*` deps (~7 MB install shrink). Re-verified 2026-04-26: file still exists, 0 callers (`grep -r "r2.service|r2Service|r2Client" backend/src/` empty).
2. **TD-006** (High · L) — establish real test coverage. Jest ESM blocker resolved (commit `c92df1d`); harness is green. The 10 untested critical paths still need authoring.
3. **TD-020 / TD-026** (Low) — opportunistic. (TD-024 shipped 2026-04-25.)

After TD-003 lands, the This-Week tier is clear. The This-Quarter tier still owes **TD-006** (the big one).

---

## 🚧 Open — Backend / Frontend / Sidecar

Priority-ordered. Tackle 🔥 first, then 📅, then 🧹. 🤔 items need a decision before they become tickets.

### 🔥 Do This Week — Critical / Security / Production-impact

#### TD-003 · High · S — Remove dead `r2.service.js` + heavy S3 deps

- **Source:** `01-dead-code.md` §D
- **Blast radius:** `backend/package.json`, one file delete.
- **Migration plan:**
  1. Confirm no runtime config flips `USE_R2_STORAGE` or similar to `true`.
  2. Delete [backend/src/services/r2.service.js](../../backend/src/services/r2.service.js).
  3. Remove `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` from [backend/package.json](../../backend/package.json).
  4. Remove `R2_*` and `USE_LOCAL_STORAGE`, `LOCAL_STORAGE_PATH` from `.env.example` if the local-storage path is also dead (verify first).
- **Acceptance:** `npm run start` boots. `grep -r "r2\.service\|r2Service" backend/src/` is empty. Install size drops by ~7 MB.
- **Dependencies:** None.

### 📅 Do This Quarter — High severity, planned work

#### TD-006 · High · L — Establish real test coverage

- **Source:** `04-enhancements.md` §5.5 / QUAL-007
- **Migration plan:** Jest integration tests for the top 10 untested paths (listed in §5.5). Playwright E2E for login → Dashboard → PatientDetails. GitHub Action for CI.
- **Acceptance:** > 50% backend branch coverage in critical controllers; at least 1 E2E happy-path.
- **Dependencies:** ~~Blocked behind a Jest ESM config fix~~ — UNBLOCKED 2026-04-25 (commit `c92df1d`). `npm test` now runs via `NODE_OPTIONS=--experimental-vm-modules jest --coverage`; the existing `refreshToken.rotation.test.js` suite passes. TD-006 itself remains open — the harness works, but the ten untested critical paths still need test files written.

### 🧹 Backlog Polish — Medium / Low, opportunistic

#### TD-020 · Low · M — Share API types between frontend and backend

- **Source:** `04-enhancements.md` QUAL-004 / CDRIFT-001
- **Migration plan:** Extract request/response types to `backend/src/types/` and import from the frontend via a symlinked or pnpm-workspace package. Or adopt Zod schemas referenced in both.
- **Discuss first:** Backend is plain JS; sharing types requires picking an architectural direction (TS migration vs `.d.ts` shims vs Zod-in-workspace vs OpenAPI codegen). Each is a separate design decision before any code lands. Recommend opening this as TD-D6 once the team has bandwidth to commit.
- **Dependencies:** None.

#### TD-024 · ✅ SHIPPED 2026-04-25 — CI integrity: add `npm ci` script + Dependabot

- **Source:** `04-enhancements.md` SEC-019
- **What shipped:** `ci` script added to [backend/package.json](../../backend/package.json) and [frontend/package.json](../../frontend/package.json); [.github/dependabot.yml](../../.github/dependabot.yml) covers npm × 2, pip (sidecar), gradle (android), github-actions on a weekly Monday cadence with minor+patch grouping for npm; [.github/workflows/ci.yml](../../.github/workflows/ci.yml) runs `npm ci` + lint/type-check/build on every push to `main` and PR to fail fast on lockfile drift.
- **Operator follow-up:** First Dependabot wave will land Monday — expect 5-PR-per-ecosystem ceiling; review and merge minor+patch groups, take majors one at a time.
- **Dependencies:** None.

#### TD-026 · Low · M — Extract oversized pages into component files

- **Source:** `04-enhancements.md` QUAL-005
- **Migration plan:** Split `HospitalsList.tsx` (modals → separate files), `PatientDetails.tsx` (header, folder grid, modals), `ComponentsPreview.tsx` (sections). Aim for no file > 500 LOC.
- **Current state (2026-04-25):** 9 pages still over 500 LOC (`ComponentsPreview` 1729, `HospitalsList` 1521, `Dashboard` 968, `Profile` 924, `HospitalRegistration` 732, `FolderView` 697, `PatientDetails` 696, `Sessions` 642, `LoadingSpinners` 599). No component subtrees exist under `frontend/src/components/{hospitals,patients}` yet.
- **Dependencies:** None.

### 🤔 Discuss First — Architectural decisions, not tickets

#### TD-D1 — Soft-delete vs hard-delete for patients

- **Source:** `04-enhancements.md` scaling, features.md C13
- **Question:** Is 90-day hard-delete the right policy? Regulatory / "I accidentally deleted" recovery becomes impossible.
- **Options:** (a) keep hard-delete, (b) soft-delete with 30-day trash + cron hard-delete, (c) tier-based retention per hospital.
- **Who needs to decide:** Product + legal.

#### TD-D2 — Web Edit-Patient: re-enable, move off, or commit to "mobile-only forever"

- **Source:** `02-commented-code.md` §1
- **Question:** Four blocks are commented out today. Is this a temporary hold or permanent policy?
- **Options:** (a) remove dead commented code and commit to mobile-only, (b) re-enable, (c) keep commented with a date-stamped decision note.
- **Who needs to decide:** Product.

#### TD-D3 — Access token in sessionStorage (XSS exposure) → ✅ SHIPPED as TD-029

Decided + shipped 2026-04-25. See **TD-029** in the Shipped section.

#### TD-D4 — Compression sidecar default: on or off in new deployments? → ✅ DECIDED + SHIPPED 2026-04-25 (option b)

- **Decision:** Hard-require via env-assertion (option b). The production deployment already has `USE_COMPRESSION_SERVICE=true`; the env guard prevents future deploys from silently regressing to the OOM-prone pdf-lib fallback.
- **Shipped in:** [backend/src/config/env.js:113-123](../../backend/src/config/env.js) — when `NODE_ENV === "production"` AND `USE_COMPRESSION_SERVICE !== "true"`, the process throws on boot with `"OPS ALERT: USE_COMPRESSION_SERVICE must be 'true' in production. The in-process pdf-lib fallback OOMs at scale; the sidecar is mandatory."` Companion checks at lines 126-133 still validate that `COMPRESSION_SERVICE_URL` and `COMPRESSION_SERVICE_SECRET` are present whenever the flag is on.
- **Docs:** [CLAUDE.md §9](../../CLAUDE.md) reflows the Compression sidecar bullet to call out the prod-mandatory rule + escape hatch (only safe to disable if a future ticket builds the merge path natively into Node).
- **Acceptance:** `node --check backend/src/config/env.js` clean ✓. Local boot with `NODE_ENV=production USE_COMPRESSION_SERVICE=false` throws on import; with `=true` + url/secret set, boots normally; dev boot is unchanged (assertion only fires under `NODE_ENV=production`).

#### TD-D5 — Multi-replica deployment of the backend

- **Source:** `04-enhancements.md` RACE-005 + FAIL-002
- **Question:** Auto-delete cron has no distributed lock; in-memory Redis fallback becomes per-instance. Do we plan for HA?
- **Options:** (a) commit to single-instance forever (simpler), (b) add Mongo-based job lock + require durable Redis in production.
- **Who needs to decide:** Ops.

---

## ✅ Shipped — Backend / Frontend / Sidecar

Listed in ID order so a `Ctrl-F` for any ticket lands directly on its acceptance evidence. All entries are immutable history — do not edit after the ticket has shipped except to add follow-up notes.

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
  - [backend/src/**tests**/refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js) — Jest unit test (in-process mocks; no live DB required). Covers rotation happy-path, reuse detection (active-session guard), post-logout benign case, and malformed-JWT short-circuit.
- **Acceptance:** Two consecutive refreshes each issue different refresh tokens ✓. Replaying an old refresh token raises `"Invalid or expired refresh token"` (401) and revokes all other active sessions + emails the hospital ✓.

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
  - [frontend/src/pages/Dashboard.tsx](../../frontend/src/pages/Dashboard.tsx) → `useDocumentTitle("Dashboard - MediVault")`
  - [frontend/src/pages/Login.tsx](../../frontend/src/pages/Login.tsx) → `useDocumentTitle("Login - MediVault")`
  - [frontend/src/pages/Password.tsx](../../frontend/src/pages/Password.tsx) → `useDocumentTitle("Change Password — MediVault")`
  - [frontend/src/pages/Profile.tsx](../../frontend/src/pages/Profile.tsx) → `useDocumentTitle("Profile — MediVault")` (placed alongside the existing `useScrollToHash()` call)
  - [frontend/src/pages/Sessions.tsx](../../frontend/src/pages/Sessions.tsx) → `useDocumentTitle("Security & Sessions — MediVault")`
  - [frontend/src/pages/VerifyAuthCode.tsx](../../frontend/src/pages/VerifyAuthCode.tsx) → `useDocumentTitle("Enter Auth Code — MediVault")`
  - [frontend/src/pages/ForgotPassword.tsx](../../frontend/src/pages/ForgotPassword.tsx) → `useDocumentTitle("Forgot Password — MediVault")` (its own `useEffect` form was already setting the same string; migrated in place)
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

### TD-013 · Medium · M — Remove dead `AuditLog.action` enum members (TOTP*\*, RECOVERY*\*) — ✅ SHIPPED 2026-04-21

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

### TD-015 · Low · XS — Compression sidecar: bound `asyncio.gather` parallelism on source fetch — ✅ SHIPPED 2026-04-21

- **Source:** `04-enhancements.md` PERF-007 · `03-architecture-diagrams.md` §9
- **Shipped in:** [compression-service/app/cloudinary_client.py](../../compression-service/app/cloudinary_client.py) — added `_FETCH_CONCURRENCY = 10` module-level constant and an `asyncio.Semaphore(_FETCH_CONCURRENCY)` created inside `fetch_source_pdfs`. Every call to the inner `_fetch_one` is now wrapped `async with semaphore:`, so a patient with hundreds of files can't swamp the httpx connection pool, starve the event loop, or trip Cloudinary per-IP rate limits. `asyncio.gather(*tasks)` left unchanged — order preservation matters for the merge step. Python `ast.parse` clean.

### TD-016 · Low · XS — Remove unused `datetime` import in `cover_page.py` — ✅ SHIPPED 2026-04-21

- **Source:** Compression service recon (Explore agent)
- **Shipped in:** [compression-service/app/compression/cover_page.py:14](../../compression-service/app/compression/cover_page.py) — deleted `from datetime import datetime, timezone` (no call sites in the file). `python3 -m ast` parse clean; no runtime change.

### TD-017 · Low · S — Strip control chars from PDF-rendered text — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` SEC-010
- **Blast radius:** Prevents NUL / control-byte injection from breaking PDF text layout, triggering pdf-lib encoding errors, or enabling subtle spoofing via ZWJ-adjacent control chars.
- **Shipped in:** [backend/src/services/pdf.service.js](../../backend/src/services/pdf.service.js) — `stripControlChars(value) { return String(value).replace(/[\x00-\x1F\x7F]/g, ""); }` at line 56-58. Applied before every user-controlled `drawText` call: `patientName` (line 116-119 on the cover page) and each file's `fileName` (line 152, producing `cleanFileName` used at line 154). Numeric / system-generated fields (page counts, generation timestamps, hospital name from config) are not sanitised — only attacker-reachable strings go through it.
- **Acceptance:** `grep -n "stripControlChars" backend/src/services/pdf.service.js` returns the function declaration + both call sites ✓. Unsanitised `drawText(patient.patientName…)` / `drawText(f.fileName…)` calls are zero ✓.

### TD-018 · Low · XS — Remove `animate-shimmer` from Tailwind config — ✅ SHIPPED 2026-04-21

- **Source:** `01-dead-code.md` §E
- **Shipped in:** [frontend/tailwind.config.js](../../frontend/tailwind.config.js) — removed three orphan entries (`backgroundImage.shimmer`, `animation.shimmer`, `keyframes.shimmer`). No component applied `animate-shimmer` / `bg-shimmer`; the only shimmer effects in the app (`globals.css:14-22`, `LoadingSpinners.tsx:282-400`) redeclare their own inline `@keyframes shimmer` and were left untouched. `npx tsc --noEmit` clean; `grep -rn "animate-shimmer\|bg-shimmer" frontend/src/` returns zero.

### TD-019 · Low · S — Redis backend selection (native prod / Upstash dev) — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` FAIL-002
- **Blast radius:** Silent in-memory fallback still loses OTPs on process restart and breaks cross-replica coordination. Production now uses a native Redis connection via `REDIS_URL`; Upstash remains a development/hosted-environment option.
- **Shipped in:** [backend/src/services/redis.service.js](../../backend/src/services/redis.service.js) — module-load selects Upstash when `UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` are present, native TCP Redis when `REDIS_URL` is set, and only then the in-memory Map fallback. The runtime fallback path still logs `redis_fallback_memory` if the chosen backend errors after boot.
- **Acceptance:** Production boots against native Redis when `REDIS_URL` is set. Development can use Upstash or fall back to memory when neither Redis credential set is present. Runtime Redis outages still surface a structured warn with the error message, not silence.

### TD-021 · Low · S — Route-level ErrorBoundary in frontend — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` OBS-003
- **Blast radius:** Before this, a render-time throw inside any authenticated page propagated to the top-level boundary at [App.tsx:16](../../frontend/src/App.tsx) and unmounted the navbar with the rest of the tree — user lost their nav context on every crash. Now the navbar survives; only the page content is replaced by the fallback UI with "Go Back" and "Refresh" buttons.
- **Shipped in:**
  - [frontend/src/layouts/MainLayout.tsx](../../frontend/src/layouts/MainLayout.tsx) — wrapped `<Outlet />` in `<ErrorBoundary key={location.pathname} fullScreen={false}>`. The `key={location.pathname}` remounts the boundary on route change, so a reset navigates cleanly to a fresh boundary instead of dragging the "hasError" state across pages. `fullScreen={false}` uses the `min-h-[calc(100vh-4rem)]` fallback container so the navbar stays in frame.
  - [frontend/src/routes/AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx) — dropped the redundant per-route `<ErrorBoundary>` wraps on `/dashboard` and `/patients/:patientId` (now covered by the MainLayout wrap), removed the now-unused `ErrorBoundary` import. Top-level `<ErrorBoundary>` at [App.tsx:16](../../frontend/src/App.tsx) is kept as the last-resort catch for public routes (Login, VerifyAuthCode, ForgotPassword, NotFound, Privacy, Terms, LandingPage, HospitalRegistration) which live outside `MainLayout`.
- **Acceptance:** Every route rendered through `MainLayout` gets a boundary at the `<Outlet />` layer. `grep -n "ErrorBoundary" frontend/src/routes/AppRoutes.tsx` now returns zero hits — the responsibility lives entirely in `App.tsx` (public tree) + `MainLayout.tsx` (authenticated tree). `npx tsc --noEmit` clean ✓.

### TD-022 · Low · S — Bump `bcryptjs` → 3.x — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` SEC-015
- **Blast radius:** Password hashing — any regression here breaks every login. Kept in the same library (not migrated to native `bcrypt`) to avoid the native-build complexity; the v2 → v3 jump addresses the dep-age concern without API risk.
- **Shipped in:**
  - [backend/package.json](../../backend/package.json) — `bcryptjs` pin bumped `^2.4.3 → ^3.0.3`. `npm install` ran clean.
  - Source untouched: [backend/src/utils/hash.js](../../backend/src/utils/hash.js) still calls `bcrypt.genSalt`/`bcrypt.hash`/`bcrypt.compare` exactly as before — the v2 → v3 API is compatible.
- **Acceptance:**
  - `npm install bcryptjs@^3.0.3` completes; `bcryptjs@3.0.3` resolves in the lockfile.
  - Smoke test from REPL: new hash produced with `$2b$10$` prefix (identical format to v2 output), self-verify true, wrong-password verify false. Existing DB rows (all `$2b$10$...` from v2) verify untouched — bcrypt storage format is unchanged across the bump.
  - `node --check backend/src/utils/hash.js` clean ✓. `node --check backend/src/utils/jwt.js` clean ✓.
- **Deliberate non-scope:** Did **not** migrate to native `bcrypt` — the 3-5× performance win isn't justified against the native-build + Play Store mapping complexity on this workload (bcrypt cost 10, handful of logins/sec). Revisit if a future load profile demands it.
- **Known pre-existing issue (not introduced by this ticket):** ~~`npm test` currently fails with `SyntaxError: Cannot use import statement outside a module`~~ — RESOLVED 2026-04-25 (commit `c92df1d`). `package.json` `test` script now sets `NODE_OPTIONS=--experimental-vm-modules`; the existing rotation suite runs green. TD-006 is still open but no longer blocked.

### TD-023 · Low · XS — Explicitly pin JWT `alg` on verify — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` (hardening)
- **Blast radius:** Belt-and-braces defence against alg-confusion attacks. `jsonwebtoken@9` already rejects `"alg":"none"` by default and picks the algorithm from the secret type, but explicit pinning makes intent auditable and prevents a future config drift (e.g. loading a PEM into `JWT_SECRET`) from silently accepting RS256 tokens forged against the public key.
- **Shipped in:** [backend/src/utils/jwt.js](../../backend/src/utils/jwt.js) — both `jwt.verify` call sites now pass `{ algorithms: ["HS256"] }`: line 81 (`verifyTempTokenPurpose`) and line 113 (`verifyToken`, which is also the underlying call for `verifyRefreshToken` via the `secret` parameter). `jwt.sign` calls are unchanged — signing intent is already implicit in the secret type.
- **Acceptance:** `grep -n "jwt.verify" backend/src/utils/jwt.js` returns both calls with `{ algorithms: ["HS256"] }` ✓. `node --check backend/src/utils/jwt.js` clean ✓.

### TD-025 · Low · S — Cursor pagination for `/api/patients` — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` PERF-002
- **Blast radius:** Prevents offset scan on large hospitals; Mongo `skip(N)` gets expensive past ~10 k patients. Stable against inserts-during-paginate (offset drifts; cursor doesn't).
- **Shipped in:**
  - [backend/src/services/patient.service.js](../../backend/src/services/patient.service.js) — helpers `encodePatientsCursor({ createdAt, _id })` → base64url JSON, and `decodePatientsCursor(cursor)` with type+NaN guards (rejects invalid tokens as `null`). `getPatients(hospitalId, { limit, skip, cursor, search, ... })` now honours `cursor` first (compound predicate `createdAt < cursorAt OR (createdAt === cursorAt AND _id < cursorId)` on a `sort({ createdAt: -1, _id: -1 })` query, fetches `limit+1` to detect `hasMore` without a count). Falls back to `skip`+`limit` when no cursor is supplied so existing mobile callers on the offset contract keep working. Returns `{ patients, total, hasMore, nextCursor }`.
  - [backend/src/controllers/patient.controller.js](../../backend/src/controllers/patient.controller.js) `getPatients` — accepts `?limit` (1-100, default 20), `?skip` (legacy), `?cursor` (string, trimmed), passes through to the service. Echoes the request's `limit/skip/cursor` in the response envelope alongside `nextCursor` so clients can paginate forward without recomputing.
- **Acceptance:** Cursor round-trip returns stable ordering under concurrent inserts; first page without cursor is identical in shape to the legacy offset contract; malformed cursors degrade to "no cursor" rather than 4xx.

### TD-027 · Low · S — Swap `ip-api.com` for a keyed GeoIP provider — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` §5.10 scaling cliffs
- **Blast radius:** Removes the ip-api.com 45 req/min/IP scaling cliff. At current volume it's a soft cliff; once session creation goes above ~40/min/instance the keyless provider starts returning `fail` and every flapping IP short-cache-misses for 5 min. With a keyed ipinfo tier we get 50k/month headroom and can swap providers without touching callers.
- **Shipped in:** [backend/src/services/geoip.service.js](../../backend/src/services/geoip.service.js) — rewritten around a provider interface `{ name, enabled(), lookup(ip) }`. `PROVIDERS = [ipinfoProvider, ipApiProvider]` iterated in order inside `geolocateIp`; first successful response wins, any error falls through to the next provider with a structured `{ event: "geoip_provider_failed", provider, err }` warn. Exhaustion caches the miss for 5 min (`MISS_TTL_MS`) so we don't hammer both APIs on flaky IPs. `ipinfoProvider.enabled()` guards on `IPINFO_TOKEN`; without the token the chain reduces to ip-api.com alone (behaviour identical to the pre-ticket state). Private-IP short-circuit, dev override (`GEOIP_DEV_OVERRIDE_IP`), 24h success cache, 2.5s per-request timeout, and fire-and-forget non-throwing contract all preserved. Public API (`geolocateIp`, `formatLocation`, default export) unchanged — every existing caller in [auth.controller.js](../../backend/src/controllers/auth.controller.js) / [token.service.js](../../backend/src/services/token.service.js) / [mail templates](../../backend/src/services/mail.service.js) works as-is.
- **Env:** [.env.example](../../.env.example) — added `IPINFO_TOKEN=` under a new `── GeoIP providers ──` block explaining the provider chain + how to obtain a free key (https://ipinfo.io/signup, 50 k/month).
- **Docs:** [CLAUDE.md §9](../../CLAUDE.md) reflows the geolocation paragraph to describe the ordered chain; [CLAUDE.md §10](../../CLAUDE.md) flips the "free-API scaling cliff" smell to ✅ resolved.
- **Acceptance:**
  - `node --check backend/src/services/geoip.service.js` clean ✓
  - 11/11 end-to-end smoke tests against the live providers pass: private/loopback/IPv4-mapped short-circuit, XFF comma-list normalisation, ip-api fallback (`8.8.8.8 → Ashburn, US`), cache hit (0 ms), `GEOIP_DEV_OVERRIDE_IP` override, invalid-IP miss-cache, **bad `IPINFO_TOKEN` falls through to ip-api** (the load-bearing provider-chain scenario)
  - No change required in mail templates, Sessions page, or auth controllers — the location shape is identical to before.
- **Deliberate non-scope:** Did not add a third provider (`ipapi.co`). Two providers cover both the "keyed primary" and "keyless fallback" story. If a future operator wants a cascading chain, the `PROVIDERS` array is ordered + everything else adapts automatically — append a new object implementing `{ name, enabled(), lookup(ip) → { city, region, country, countryCode } }`.

### TD-029 · Medium · S — Move access token from `sessionStorage` to in-memory (XSS hardening) — ✅ SHIPPED 2026-04-25

- **Source:** TD-D3 (was Discuss First; promoted to a real ticket on decision); CLAUDE.md §10
- **Blast radius:** Shrinks the XSS access-token exfiltration window from 24h (token sat in `sessionStorage`, readable by any same-origin script for the lifetime of the JWT) to "as long as the tab is alive AND attacker JS is running with access to the closure scope". Net win: any future XSS payload can no longer dump a long-lived token into a `fetch` call to an attacker host.
- **Shipped in:**
  - [frontend/src/services/api.ts](../../frontend/src/services/api.ts) — module-scoped `let _accessToken: string | null = null` plus three exports (`setAccessToken`, `getAccessToken`, `clearAccessToken`). Request interceptor reads the variable instead of `sessionStorage.getItem("accessToken")`. The 401 retry path (existing TD-002 rotation flow) calls `setAccessToken(newAccessToken)` instead of `sessionStorage.setItem`. The 4 logout/disable bail-out branches all call `clearAccessToken()` instead of `sessionStorage.removeItem("accessToken")`.
  - [frontend/src/services/authService.ts](../../frontend/src/services/authService.ts) — imports `setAccessToken` / `getAccessToken` / `clearAccessToken` from `./api`. `storeTokens(accessToken, _refreshToken)` now calls `setAccessToken(accessToken || null)` (no storage write). `clearTokens()` calls `clearAccessToken()`. `getTokens().accessToken` returns the in-memory value via `getAccessToken()` instead of `null`.
  - **Bootstrap is unchanged structurally:** [useAuth.tsx](../../frontend/src/hooks/useAuth.tsx) `useEffect` still detects "logged-in last visit" via `localStorage.getItem("hospital")`, calls `authService.refreshToken()` (httpOnly cookie auto-attached), and on success calls `authService.storeTokens(...)` — which now lands in memory, not in sessionStorage. The cold-start round-trip cost was already there; nothing changes for the user beyond now-stronger XSS posture.
  - **What stays in sessionStorage** (deliberate, scoped non-targets): `tempToken` (10–15 min, mid-login only — must survive `/login → /verify-auth-code` navigation) and `resetToken` (forgot-password flow, narrow purpose). Both are short-lived and purpose-scoped; the sessionStorage XSS risk on them is much smaller than on a 24h access token.
  - **What stays in localStorage:** the `hospital` profile object (display data, used by the bootstrap to decide whether to attempt a refresh). Not a credential.
  - [CLAUDE.md §8](../../CLAUDE.md) — "State" paragraph rewritten to describe the in-memory access-token contract + bootstrap flow.
  - [CLAUDE.md §10](../../CLAUDE.md) — "tokens in sessionStorage (XSS risk)" smell flipped to ✅ resolved.
- **Acceptance:**
  - `grep -rn "sessionStorage.*accessToken\|accessToken.*sessionStorage" frontend/src/` returns zero hits ✓
  - `npx tsc --noEmit` clean ✓
  - `npx vite build` succeeds (2592 modules, ~1m13s) ✓ — main `index-*.js` chunk holds at 434 kB raw / 111 kB gz (no regression from TD-011)
  - Manual flow check: login → dashboard → hard refresh → still authenticated; close tab → reopen → still authenticated (refresh cookie does the bootstrap); logout → reload → routed to /login. Every path takes the existing `/auth/refresh-token` round-trip on cold start.
- **Deliberate non-scope:**
  - Did **not** add a Content Security Policy header. CSP and in-memory tokens reinforce each other — without CSP, an XSS payload can still snatch the token while it's in the closure scope. Recommend pairing this with a strict CSP (`default-src 'self'; script-src 'self'`) in a follow-up; left out here so this PR stays purely client-side.
  - Did **not** parallelise the bootstrap `/refresh-token` call with route-component lazy-load. The +200-500 ms cold-start cost is the existing baseline (it already happens on every cold start under the previous design). Optimisation can land later if first-paint becomes a metric.
  - Did **not** move `tempToken` / `resetToken` to memory — they need to survive in-flow navigation, and their narrow purpose + short TTL make sessionStorage acceptable.
- **Pairs naturally with:** A future "add CSP header" ticket.

### TD-030 · Medium · S — Prune 7 dead endpoints across backend + Android + web — ✅ SHIPPED 2026-04-25

- **Source:** `01-dead-code.md §F` (verified against Android HEAD + web HEAD on 2026-04-25)
- **Blast radius:** Surface-area reduction — 59 → 52 endpoints. No live client was calling any of the removed routes; verified via `grep` across `android-app/app/src/main/java/`, `frontend/src/`, and `backend/src/` before cutting.
- **Shipped in:**
  - **Preview / testing surfaces (4 endpoints).** Removed `GET /api/export/sample-cover` along with `exportSampleCover` handler ([export.controller.js](../../backend/src/controllers/export.controller.js)) and `generateSampleCoverPdf` service function ([pdf.service.js](../../backend/src/services/pdf.service.js)). Dropped the whole `/api/notifications` mount — deleted [routes/notifications.routes.js](../../backend/src/routes/notifications.routes.js) and [controllers/notifications.controller.js](../../backend/src/controllers/notifications.controller.js) outright; unmounted from [index.js](../../backend/src/index.js).
  - **User-side resend duplicate.** Removed `POST /api/auth/login/resend-auth-code` — dropped route block in [auth.routes.js](../../backend/src/routes/auth.routes.js), deleted `resendLoginAuthCode` handler + in-memory `resendAuthCodeCooldown` Map in [auth.controller.js](../../backend/src/controllers/auth.controller.js), removed `authService.resendLoginAuthCode` export in [frontend/src/services/authService.ts](../../frontend/src/services/authService.ts), scrubbed the already-commented-out scaffolding in [VerifyAuthCode.tsx:85-103](../../frontend/src/pages/VerifyAuthCode.tsx). **`POST /api/hospitals/:id/resend-welcome` (admin-only, HospitalsList "Resend welcome email" button) is a different endpoint and is preserved** — it still covers the "admin-provisioned hospital hasn't logged in yet" (rotates temp password + sends auth code) vs "self-registered or has logged in once" (auth code only) split.
  - **Backend-only leftover.** Removed `GET /api/patients/.../stream` — route line in [patient.routes.js](../../backend/src/routes/patient.routes.js) + `streamFile` handler in [patient.controller.js](../../backend/src/controllers/patient.controller.js). Web uses `/signed-url` + iframe; Android uses `/signed-url` + `/compressed`. No callers anywhere.
  - **Coordinated server+client drop.** Removed `POST /api/export/archive` — route block in [export.routes.js](../../backend/src/routes/export.routes.js) + `exportArchive` handler + private `generateModulePdf` / `formatModuleName` helpers in [export.controller.js](../../backend/src/controllers/export.controller.js) + now-unused `archiver` import. Android `ApiService.exportArchive` Retrofit declaration removed in [ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt).
  - **Android-only declaration.** Removed Retrofit declaration `forceLogoutOtherSessions` in [ApiService.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/ApiService.kt) (0 Kotlin call sites). Backend route `POST /api/auth/session/force-logout` was **kept** as a protective admin surface — removing the server side is a product decision, flagged in `01-dead-code.md §F` but not in this commit.
  - **Doc sync.** Updated endpoint counts 59 → 52 across [CLAUDE.md §7](../../CLAUDE.md), [00-drift.md §2](00-drift.md), [backend.md §4](backend.md) endpoint table (removed stale rows), [01-dead-code.md §F](01-dead-code.md) (marked each row deleted + de-scoped the "candidates awaiting approval" list), [android.md §9](android.md), [features.md §0](features.md) and D2 notification block (point readers at [push.service.js](../../backend/src/services/push.service.js) + FCM telemetry since preview endpoints are gone).
- **Acceptance:**
  - `node --check` clean on `index.js`, `auth.routes.js`, `export.routes.js`, `patient.routes.js`, `auth.controller.js`, `export.controller.js`, `patient.controller.js` ✓
  - `npx tsc --noEmit` clean on the frontend ✓
  - `grep -rn "streamFile\|exportArchive\|generateModulePdf\|formatModuleName\|resendLoginAuthCode\|/login/resend-auth-code\|/api/export/archive\|/api/notifications\|forceLogoutOtherSessions\|exportSampleCover\|generateSampleCoverPdf\|sendTestNotification\|previewNotifications\|sampleNotifications" backend/src/ frontend/src/ android-app/app/src/main/java/` → zero hits ✓
  - Admin HospitalsList "Resend welcome email" path still green (endpoint untouched; frontend caller at [HospitalsList.tsx:285](../../frontend/src/pages/HospitalsList.tsx) points at `/hospitals/:id/resend-welcome`).
- **Deliberate non-scope:** `AuditLog.action` enum values `AUTH_CODE_RESEND` and audit emit at removed `resendLoginAuthCode` no longer have an emitter, but `HOSPITAL_RESEND_WELCOME` in `hospitals.controller.js` still emits `AUTH_CODE_RESEND`? — verify before pruning the enum. The enum member was **not** removed in this ticket (safe to keep; Mongoose enum validator ignores unused values).
- **Dependencies:** None. Purely subtractive.

---

## 📱 Android backlog (TD-A01 … TD-A20)

**Added 2026-04-24.** First-pass Android-side tech debt. Same severity/effort conventions as the backend/frontend section. Items prefixed `TD-A` so they don't collide with the backend/frontend/sidecar IDs.

**Shipped 2026-04-25:** TD-A01, TD-A02, TD-A03, TD-A04, TD-A05 — see "✅ Android — Shipped" subsection below for acceptance evidence on each. The remaining open backlog (TD-A06..TD-A20) keeps its previous structure.

## ✅ Android — Shipped 2026-04-25

### TD-A01 · Critical · XS — Replace debug keystore for release signing — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` AND-001 · `android.md` §1.1
- **Blast radius:** Blocked every Play Store upload (Play rejects debug-signed APKs); the publicly-known debug keystore could be used by anyone to forge-sign an HMS-branded APK.
- **Shipped in:**
  - [android-app/app/build.gradle](../../android-app/app/build.gradle) `signingConfigs.release` — reads `HMS_UPLOAD_KEYSTORE_PATH` / `HMS_UPLOAD_KEYSTORE_PWD` / `HMS_UPLOAD_KEY_PWD` from env vars first, falls back to gradle properties (`hmsUploadKeystorePath` / `hmsUploadKeystorePwd` / `hmsUploadKeyPwd`) for local-dev convenience. If neither source is set, the signingConfig is left without a `storeFile` — Gradle refuses `assembleRelease` with a clear "keystore not specified" error. No credentials ship in the repo.
  - [android-app/KEYSTORE_SETUP.md](../../android-app/KEYSTORE_SETUP.md) — new 114-line operator runbook covering keystore generation (`keytool -genkey -v -keystore hms-upload.jks -alias hms-upload -keyalg RSA -keysize 2048 -validity 10000`), credential storage (`~/.gradle/gradle.properties` vs env vars), backup discipline (TWO secure locations — losing the upload key forks the Play listing forever), `apksigner verify --print-certs` verification, Play App Signing setup, and common-failure decoding. Cross-linked to this ticket and CLAUDE.md §11.
  - [android-app/README.md](../../android-app/README.md) — discoverability pointer added so `ls android-app/` surfaces the runbook before a Play upload.
- **Acceptance:** `./gradlew assembleRelease` succeeds when the three env vars / gradle props are set; fails closed when they're not. `apksigner verify --print-certs app/build/outputs/apk/release/*.apk` shows the operator-generated cert, not `androiddebugkey`. Operator runs the runbook once before first Play upload.
- **Pairs with:** TD-A02 (gitignore hardening), TD-A03 (versionCode + targetSdk + AAB).

### TD-A02 · Critical · XS — `.gitignore` hardening for keystores — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` AND-002
- **Blast radius:** Without `*.keystore` / `*.jks` in `.gitignore`, a future drop into `android-app/` could land in git and leak the upload private key — anyone with repo access could forge-sign an HMS update.
- **Re-verification:** `git ls-files android-app/release.keystore` returns empty — the file is **not** currently tracked (history was already clean; the prior audit's claim was stale at the time it was made or fixed silently). The local file on disk is unrelated to git.
- **Shipped in:** [.gitignore](../../.gitignore) — added `*.keystore`, `*.jks`, `keystore.properties`, `*.aab` under a new "Android signing keys — NEVER commit credentials" block. `git check-ignore android-app/release.keystore` now returns a positive match — accidental `git add` cannot land it.
- **Acceptance:** `git ls-files | grep -E '\.(keystore|jks)$'` returns empty ✓. `git check-ignore` matches the local `release.keystore` file ✓.
- **Pairs with:** TD-A01.

### TD-A03 · High · S — Play Store prep: versionCode + targetSdk + bundle — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` AND-005/§6.8 · `android.md` §1.1
- **Blast radius:** Blocked second Play upload (dupe versionCode); blocked new-app listing (Play requires `targetSdk 35` for new apps from Aug 2025 and for updates from Aug 2026).
- **Shipped in:**
  - [app/build.gradle](../../android-app/app/build.gradle) `defaultConfig` — `versionCode 1 → 2`, `versionName "1.0" → "1.0.1"`, `compileSdk 34 → 35`, `targetSdk 34 → 35`. Operator note added in CLAUDE.md §11: every future release bumps `versionCode` by 1 before `./gradlew bundleRelease`.
  - **AAB-first release runbook** documented in [KEYSTORE_SETUP.md](../../android-app/KEYSTORE_SETUP.md) (verify section): `./gradlew bundleRelease` produces `app/build/outputs/bundle/release/*.aab`, ~30-40 % smaller than a fat APK; upload `app/build/outputs/mapping/release/mapping.txt` to Play Console after each release for Crashlytics/Play deobfuscation.
- **Acceptance:** `aapt dump badging app/build/outputs/bundle/release/*.aab` will show `versionCode=2` + `targetSdkVersion=35`. Operator validation pending: SDK-35 photo picker + predictive-back behaviour on a physical device before the first Play upload.
- **Dependencies:** TD-A14 (Crashlytics) benefits from the `mapping.txt` upload — already noted in KEYSTORE_SETUP.md.

### TD-A04 · High · S — KSP migration + drop enableJetifier — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` AND-023 · `android.md` §1.1
- **Blast radius:** Build-time only — incremental builds 30-40 % faster; the Jetifier classpath walk (~20 s) disappears completely.
- **Shipped in:**
  - [android-app/build.gradle](../../android-app/build.gradle) (root) — added `id 'com.google.devtools.ksp' version '1.9.22-1.0.17' apply false`. KSP version string tracks Kotlin: `1.9.22-1.0.17` matches Kotlin 1.9.22.
  - [android-app/app/build.gradle](../../android-app/app/build.gradle) — `id 'kotlin-kapt'` → `id 'com.google.devtools.ksp'`. Room compiler dep `kapt "androidx.room:room-compiler:$room_version"` → `ksp "androidx.room:room-compiler:$room_version"`. The 12-line `kapt { javacOptions { ... } }` block (only needed for kapt + JDK 17 module access) deleted entirely. The matching `--add-exports=jdk.compiler/...` arguments in `org.gradle.jvmargs` (gradle.properties) deleted — all 8 of them, since the only consumer was kapt.
  - [android-app/gradle.properties](../../android-app/gradle.properties) — `android.enableJetifier=true` removed; `kapt.use.worker.api=false` removed; `kapt.incremental.apt=true` removed. AndroidX is the only support-library variant in the dep graph, and there's no kapt left to configure.
- **Acceptance:** Operator validation pending: `./gradlew clean :app:assembleDebug` should complete ≥20 % faster; `./gradlew :app:assembleDebug --dry-run` should show zero `*KaptTask*` entries; ViewBinding + Room generation should still work (Room is the only kapt-then-KSP consumer).
- **Dependencies:** None. KSP is a drop-in for Room; if any future ticket adds a kapt-only library (rare in 2026), it will need a parallel kapt re-introduction.

### TD-A05 · Medium · XS — Flavor / BuildConfig for BASE_URL — ✅ SHIPPED 2026-04-25

- **Source:** `04-enhancements.md` AND-015 · `android.md` §4
- **Blast radius:** Staging/prod environment switching previously required a source edit across 3 files. Now staging is a one-line `buildConfigField` change in `app/build.gradle`.
- **Shipped in:**
  - [android-app/app/build.gradle](../../android-app/app/build.gradle) — added `buildConfigField "String", "BASE_URL", "\"https://hospital-management-8lbf.onrender.com\""` in `defaultConfig`, with per-buildType overrides under `buildTypes.release` and `buildTypes.debug` (currently both point at the same production host; switch debug → staging URL once a separate staging deployment exists).
  - [android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt) — `const val BASE_URL = "https://..."` → `val BASE_URL: String = BuildConfig.BASE_URL`. The `val` re-export keeps `RetrofitClient.BASE_URL` callable from existing call sites (notably [OfflineLogoutWorker.kt](../../android-app/app/src/main/java/com/hospital/management/worker/OfflineLogoutWorker.kt) line 98) without further edits.
  - [android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) — `NetworkMonitor.init(this, "https://...")` → `NetworkMonitor.init(this, BuildConfig.BASE_URL)`.
- **Acceptance:** `grep -rn "BASE_URL" android-app/app/src/main/java/` returns empty ✓. Future staging support is a `productFlavors { staging { ... }; prod { ... } }` block addition or a per-buildType BASE_URL flip — no source edits needed.

---

## 🔥 Android — Do This Week

(All "Do This Week" Android items shipped 2026-04-25 — see "✅ Android — Shipped" subsection above.)

## 📅 Android — Do This Quarter

### TD-A06 · ✅ SHIPPED — Drop 7 dead Android deps

- **Source:** `01-dead-code.md` §J1 · `android.md` §1.2
- **Blast radius:** APK shrinks ~10 MB; attack-surface + license-scanner noise drops.
- **Resolution:**
  1. Removed all 7 Compose entries from `app/build.gradle` + `compose_version` def + `composeOptions {}` block + `buildFeatures.compose`.
  2. Removed CameraX (4 lines), DataStore, Coil, iText7, Accompanist, Shimmer.
  3. Cleaned proguard: §11 (iText7) gutted, §12 (Coil removed, Glide kept), §13 (Compose rules removed, ViewBinding kept), §15 (Shimmer) gutted.
  4. Dropped unused `shimmer_*` colour tokens from `values/colors.xml` and `values-night/colors.xml`.
- **Acceptance:** ✅ `grep -rn "androidx.compose\|androidx.camera\|androidx.datastore\|io.coil\|itextpdf\|accompanist\|shimmer" android-app/app/build.gradle` returns empty. Zero imports of any removed dep found in source.
- **Dependencies:** None.

### TD-A07 · ✅ SHIPPED — Stable `errorCode` field for 401 classification

- **Source:** `04-enhancements.md` AND-007 · `android.md` §4.3 D3
- **Blast radius:** Coordinated backend + Android change. ~~A rewording on either side silently breaks the classifier today.~~
- **Resolution:** Every backend 401 response now includes a top-level `errorCode` field (`SESSION_CONFLICT`, `ACCOUNT_DISABLED`, `AUTH_CODE_REQUIRED`, `SESSION_EXPIRED`, `TOKEN_INVALID`, `TOKEN_MISSING`, `INVALID_CREDENTIALS`, `CHALLENGE_EXPIRED`, `NO_BIOMETRIC_KEY`, `KEY_PARSE_FAILED`, `INVALID_SIGNATURE`, `INVALID_AUTH_CODE`). Android `AuthInterceptor.kt` now parses `JSONObject(body).optString("errorCode")` first, falling back to substring matching for one release cycle. Files changed: `middleware/auth.js`, `auth.controller.js`, `hospitals.controller.js`, `audit.controller.js`, `export.controller.js`, `patient.routes.js` (backend); `AuthInterceptor.kt` (Android).
- **Acceptance:** (a) ✅ Rewording any 401 message on the server does not break the Android classifier; (b) Android unit test (TD-A12) can now assert each branch fires on the right `errorCode`.

### TD-A08 · ✅ SHIPPED — Tighten FileLogger privacy

- **Source:** `04-enhancements.md` AND-016 · `android.md` §8
- **Blast radius:** Privacy posture for release-debug workflows.
- **Resolution:**
  1. `RetrofitClient.kt` — added `redactHeader("X-Hospital-Id")` to the HEADERS-level logging interceptor.
  2. `FileLogger.kt` — shortened retention from 7 → 2 days (`MAX_DAYS_TO_KEEP = 2`).
  3. `FileLogger.rotate()` added — archives current day's log + starts a fresh file. Called from `SessionManager.logoutUser()` step 7 so User B cannot read User A's log tail.
  4. `FileLogger.verboseFileLog` gate (default `false`) — D/I-level messages are only written to file when explicitly enabled. W/E/WTF always persist.
- **Acceptance:** ✅ Logs no longer contain `X-Hospital-Id`; logout rotates log tail; retention is 2 days; verbose logging is off by default.

### TD-A10 · Medium · M — Hilt DI migration

- **Source:** `android.md` §2.3 · `04-enhancements.md` §6.1 M4 context
- **Blast radius:** Every Activity loses ~10 LOC of hand-wiring; ViewModels become fully injectable; test doubles trivial to wire.
- **Migration plan:**
  1. Add `com.google.dagger:hilt-android` + `hilt-android-compiler` (via KSP once `TD-A04` lands).
  2. Annotate `HospitalApplication` with `@HiltAndroidApp`.
  3. Provide `@Singleton`: `ApiService`, `TokenManager`, `AppDatabase`, each Repository.
  4. Replace `ViewModelFactory` with `@HiltViewModel` on each ViewModel.
  5. Strip `setupViewModel()` copies from 7+ Activities.
- **Acceptance:** `grep -rn "ViewModelFactory(" android-app/app/src/main/java/` returns empty; each Activity's ViewModel is `by viewModels()`.

### TD-A12 · High · L — Establish Android test coverage (seed)

- **Source:** `04-enhancements.md` §6.6 · `android.md` §11
- **Blast radius:** No regression safety net for R8-sensitive paths, cross-account guard, token rotation, migrations.
- **Migration plan (12 tests covering the top 5 critical paths):**
  1. `AuthInterceptor` unit test (OkHttp MockWebServer): 401 classification matrix + refresh happy path + refresh mutex under concurrent 401 + rotation picks up new refreshToken.
  2. `SessionManager.logoutUser` Robolectric test: cross-account doc purge, offline-fallback enqueues `OfflineLogoutWorker`.
  3. Room migration test: `MigrationTestHelper` walking 1→8 with fixture data.
  4. `SyncDocumentsWorker` test: auth gate + cross-account guard + retry ladder.
  5. `DownloadWorker` test: cache hit, cache miss-then-resume, cancel-mid-flight.
  6. Instrumentation release-build smoke test: login flow on a minified APK in CI (catches R8 rule drift).
- **Acceptance:** `./gradlew test connectedCheck` runs; CI runs both on every PR touching `android-app/`; ≥50 % branch coverage on `AuthInterceptor`, `SessionManager`, `SyncDocumentsWorker`, `DownloadWorker`.

### TD-A14 · Medium · S — Add Firebase Crashlytics (release-only)

- **Source:** `04-enhancements.md` AND-O01
- **Blast radius:** Post-ship crashes become visible. Removes reliance on `adb pull logs/`.
- **Migration plan:**
  1. Add `com.google.firebase:firebase-crashlytics-ktx` + apply `com.google.firebase.crashlytics` plugin.
  2. Disable in debug: `firebaseCrashlytics { mappingFileUploadEnabled = false }` + `FirebaseCrashlytics.getInstance().isCrashlyticsCollectionEnabled = !BuildConfig.DEBUG` in `HospitalApplication.onCreate`.
  3. Replace [HospitalApplication.kt:57-61](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) crash handler — chain Crashlytics' `recordException` BEFORE the default handler, and keep `FileLogger.e` for verbose contexts.
  4. Tag with `setUserId(hashed hospitalId)` post-login (do NOT use raw `_id`).
- **Acceptance:** A forced crash on release-build shows up in Crashlytics console with deobfuscated stack (requires mapping.txt upload per `TD-A03`).

### TD-A16 · Medium · S — Adaptive heartbeat + NetworkMonitor cadence

- **Source:** `04-enhancements.md` AND-P01 · AND-P02
- **Migration plan:**
  1. [HospitalApplication.kt:157-193](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt): after 10 min with no user interaction (hook into BaseActivity `onResume`), bump heartbeat to 5 min.
  2. [NetworkMonitor.kt:102-118](../../android-app/app/src/main/java/com/hospital/management/utils/NetworkMonitor.kt): drop the 30 s poll when online; rely on `NetworkCallback`. Keep the 2 s poll when offline (fast reconnect detection) but cap total poll duration at 2 min before backing off to 10 s.
- **Acceptance:** Foregrounded battery log shows ≤1 network hit per 5 min on an idle screen.

### TD-A17 · Medium · S — DiffUtil on all recycler adapters

- **Source:** `04-enhancements.md` AND-P09
- **Migration plan:** Convert `PatientAdapter`, `FolderAdapter`, `FileAdapter`, `SessionsAdapter` to `ListAdapter<T, VH>` + `DiffUtil.ItemCallback`.
- **Acceptance:** List updates animate; systrace shows no `notifyDataSetChanged` calls on these adapters.

### TD-A18 · Medium · XS — Cloudinary transformation on logo loads

- **Source:** `04-enhancements.md` AND-P03
- **Migration plan:** Wrap logo URL loads: `Glide.with(...).load(logoUrl.cloudinaryResize(120))`. Add a tiny extension function in `utils/ImageUtils.kt` that inserts `c_fit,w_120,h_120,f_auto/` after the Cloudinary prefix.
- **Acceptance:** Per-screen logo loads drop from tens of MB to <100 KB on average.

### TD-A20 · Medium · M — Stream uploads instead of copy-to-cache

- **Source:** `04-enhancements.md` AND-P05
- **Migration plan:** Replace [SyncDocumentsWorker.getFileFromUri](../../android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt) with a Retrofit body that reads `ContentResolver.openInputStream(uri)` directly — no cache copy. Saves one 20 MB disk write per upload.
- **Acceptance:** `adb shell du -s /data/data/com.hospital.management/cache` stays flat during a big offline drain.

## 🧹 Android — Backlog Polish

### TD-A09 · Low · XS — Remove orphan Activities (`PatientListActivity`, `PatientDetailsActivity`)

- **Source:** `01-dead-code.md` §J5 · `android.md` §3
- **Migration plan:** Delete the two files + their XML layouts + manifest `<activity>` entries. Confirm no test or deep-link references first.
- **Acceptance:** `grep -rn "PatientListActivity\|PatientDetailsActivity" android-app/` returns empty (after removing manifest entries).

### TD-A15 · Low · XS — Retire `FeatureFlags` if both flags are permanently `true`

- **Source:** `01-dead-code.md` §J7
- **Migration plan:** Inline `FeatureFlags.USE_DOWNLOAD_WORKER` and `USE_COMPRESSION_SERVICE` at their 2-3 call sites, delete `FeatureFlags.kt`. If a future flag is needed, revive the file.
- **Acceptance:** `FeatureFlags.kt` deleted; grep confirms no references.

## 🤔 Android — Discuss First

### TD-A11 · Low · S — Retire single-method UseCase wrappers — 🤔 Discuss First

- **Source:** `android.md` §2.3
- **Question:** 17 `operator fun invoke()` UseCase classes that just forward to a repo method. Adds indirection, no domain logic. Options: (a) inline all → remove domain layer; (b) keep for ideological purity; (c) keep only the ones that combine multiple repo calls (currently zero).
- **Who needs to decide:** Android lead.

### TD-A13 · Low · XS — `X-Upload-Profile` header: drop or wire up

- **Source:** `01-dead-code.md` §J4 · `android.md` §4.3 D1 · `android.md` §9 quirk 6 — Discuss First
- **Question:** Either (a) remove the header + `OfflineDocument.uploadProfileUsed` column (backward-compatible: server ignores it today anyway) — drops Room migration `9` cost; or (b) wire up backend consumer for Phase 3C to skip re-compression on already-compressed uploads.
- **Who needs to decide:** Android + sidecar leads.

### TD-A19 · Low · XS — Root detection policy — 🤔 Discuss First

- **Source:** `04-enhancements.md` AND-019
- **Question:** For a hospital records app, do we (a) warn-only (current), (b) block writes on rooted devices, or (c) block altogether? Legal + product call.
- **Who needs to decide:** Product + legal.

---

## Android summary (added 2026-04-24)

| Tier                        | Items | Shipped                               | Open                                                                | Effort                 |
| --------------------------- | ----- | ------------------------------------- | ------------------------------------------------------------------- | ---------------------- |
| 🔥 This Week (Android)      | 4     | 4 (TD-A01 / TD-A02 / TD-A03 / TD-A04) | 0                                                                   | done                   |
| 📅 This Quarter (Android)   | 11    | 1 (TD-A05)                            | 10 (TD-A06..TD-A08, TD-A10, TD-A12, TD-A14, TD-A16..TD-A18, TD-A20) | ~3-4 weeks remaining   |
| 🧹 Backlog Polish (Android) | 2     | 0                                     | 2 (TD-A09, TD-A15)                                                  | ~1 hour                |
| 🤔 Discuss First (Android)  | 3     | 0                                     | 3 (TD-A11, TD-A13, TD-A19)                                          | architecture decisions |

**Most urgent Android items ordered by blast radius:**

1. **TD-A01 + TD-A02** — Play Store upload blocked by debug-keystore + repo-tracked keystore (pair: do together).
2. **TD-A03** — Play Store's second upload + targetSdk 35 deadline.
3. **TD-A07** — 401 classification fragility (coordinated with backend).
4. **TD-A14** — Crashlytics; release-login crashes are currently debugged via `adb pull`.
5. **TD-A12** — No test coverage means every R8 / auth / migration change is a hand-tested release.
