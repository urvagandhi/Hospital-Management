# Enhancements — MediVault

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21

Each finding: **ID** · **Severity** (Critical/High/Medium/Low/Info) · **Effort** (XS/S/M/L/XL) · description, evidence, recommendation, risk.

---

## 5.1 Security Audit (OWASP Top 10 2021)

### A01 — Broken Access Control

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-001** | ✅ SHIPPED 2026-04-21 (TD-005) | — | ~~`GET /api/hospitals` returns all rows without pagination.~~ Cursor pagination + server-side search + first-page totals shipped. See [hospitals.controller.js](../../backend/src/controllers/hospitals.controller.js). |
| **SEC-002** | Info | — | Patient/folder/file endpoints correctly enforce `{ _id, hospitalId }` scope in [patient.service.js:150](../../backend/src/services/patient.service.js). No IDOR found. |
| **SEC-003** | Info | — | `/api/audits` properly forces `userId: req.hospital.id` server-side ([audit.controller.js:43](../../backend/src/controllers/audit.controller.js)); client-supplied `userId` ignored. |

### A02 — Cryptographic Failures

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-004** | ✅ SHIPPED 2026-04-21 (TD-002) | — | ~~Refresh tokens are not rotated.~~ Rotation + reuse detection shipped in [token.service.js](../../backend/src/services/token.service.js); replaying a rotated-out token revokes every active session for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) and emails the user. Unit coverage: [refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js). |
| **SEC-005** | Info | — | Bcrypt cost factor 10 ([hash.js:8](../../backend/src/utils/hash.js)). Industry standard. |
| **SEC-006** | ✅ SHIPPED 2026-04-25 (`09fae23`) | — | JWT verification is **pinned to HS256** via `algorithms: ["HS256"]` in [utils/jwt.js](../../backend/src/utils/jwt.js). Closes RS256-swap / `alg: none` exposure. |
| **SEC-007** | ✅ SHIPPED | — | ~~`.env.example` contains no hint that `JWT_SECRET` / `REFRESH_TOKEN_SECRET` must be different random strings.~~ Explicit comment + node `crypto` generator hint added to `.env.example`. |

### A03 — Injection

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-008** | Info | — | Search uses `$regex` with ReDoS-safe escape at [patient.service.js:90](../../backend/src/services/patient.service.js). |
| **SEC-009** | Info | — | Validation chains via `express-validator` across all POST/PUT endpoints; trims strings via `sanitizeRequest` at [validateRequest.js:32-50](../../backend/src/middleware/validateRequest.js). |
| **SEC-010** | Low | S | **PDF text not explicitly sanitised for control characters.** `patientName` rendered into PDF via `pdf-lib.drawText` at [pdf.service.js:110](../../backend/src/services/pdf.service.js). Name is truncated but not filtered for `\x00-\x1F`. Recommendation: strip control chars before `drawText`. Risk: low — PDF rendering treats control chars as glyphs, no code execution. |

### A04 — Insecure Design

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-011** | Medium | S | **Auth Code is immutable.** Per CLAUDE.md §5 — if compromised, the hospital has no way to rotate it (only admin `resend-welcome` regenerates it, and only if `mustChangePassword=true`). Recommendation: expose a `POST /api/hospitals/me/rotate-auth-code` (guarded by password + OTP). |
| **SEC-012** | Low | M | **Biometric challenge TTL 2 minutes** ([auth.controller.js biometric flow]) — adequate, but there is no rate limit on the `/biometric/verify` endpoint beyond `authLimiter` (5/15m). Recommendation: tighten to 10 per 15 minutes for verify specifically. |

### A05 — Security Misconfiguration

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-013** | ✅ SHIPPED | — | ~~Helmet uses default config (no customisation) — default CSP is fairly strict for an API but does not set `Cross-Origin-Opener-Policy`; acceptable for now.~~ Helmet config explicitly sets `Cross-Origin-Opener-Policy: same-origin` in [index.js](../../backend/src/index.js). |
| **SEC-014** | ✅ SHIPPED 2026-04-21 (TD-004) | — | ~~`.env.example` contains dead TOTP + SMS + legacy SMTP vars~~ — 13 dead vars removed, 11 undocumented vars added, `LOG_LEVEL` documented. `.env.example` and code are now in sync. |

### A06 — Vulnerable Components

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-015** | ✅ SHIPPED 2026-04-25 (`effaea1`) | — | ~~`bcryptjs 2.4.3` is old.~~ Bumped to `bcryptjs@^3.0`. |
| **SEC-016** | Low | S | `@aws-sdk/client-s3` 3.932.0 carries dependency only through dead `r2.service.js` — remove the dep (see dead-code §B). |

### A07 — Identification & Auth Failures

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-017** | Info | — | Account lockout after 5 failed attempts + email. Verified in controllers. |
| **SEC-018** | Info | — | Forgot-password init always returns 200 (enumeration-safe). Verified. |

### A08 — Software & Data Integrity

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-019** | ✅ SHIPPED 2026-04-25 (`cff1e3e`) | — | ~~No package-lock integrity verification in CI.~~ Dependabot enabled + dep-hardening commit. |

### A09 — Security Logging & Monitoring

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-020** | ✅ SHIPPED 2026-04-21 (TD-001) | — | ~~Audit logging missing on 8 mutation endpoints.~~ All 8 mutation endpoints now emit an audit entry: `PATIENT_CREATED`, `PATIENT_UPDATED`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED`, `PROFILE_PATCHED`, `HOSPITAL_UPDATED`, `ORPHAN_CLEANUP`. The `AuditLog.action` enum was also extended with previously-rejected actions. See [patient.controller.js:341](../../backend/src/controllers/patient.controller.js) for the canonical fire-and-forget pattern. |

### A10 — SSRF

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-021** | Info | — | Only outbound HTTP is to fixed hosts (Cloudinary, Brevo, FCM, ip-api.com, configured sidecar URL). No user-supplied URL fetching. No SSRF risk observed. |

---

## 5.2 Performance & Scaling Hotspots

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **PERF-001** | ✅ SHIPPED 2026-04-21 (TD-005) | — | ~~No pagination on `GET /api/hospitals`~~ — see SEC-001. Cursor pagination + server-side search shipped. |
| **PERF-002** | ✅ SHIPPED 2026-04-25 (`d69f0be`, TD-D) | — | ~~`/api/patients` pagination is offset-based with no max cap.~~ Cursor pagination shipped: `limit` clamped 1–100 (default 20); opaque `cursor` token; `nextCursor` returned. Legacy `?skip=` shape still works as fallback. See [patient.controller.js:80-135](../../backend/src/controllers/patient.controller.js). |
| **PERF-003** | Medium | M | **PDF/ZIP downloads are buffered into memory before streaming in some paths.** [pdf.service.js](../../backend/src/services/pdf.service.js) and [zip.service.js](../../backend/src/services/zip.service.js) — archiver pipes correctly, but pdf-lib merges the whole doc set in heap. Large patient bundles will OOM. Compression sidecar is the correct mitigation — ensure `USE_COMPRESSION_SERVICE=true` in prod. |
| **PERF-004** | ✅ SHIPPED | — | Verified `bcrypt.compareSync` is NOT used; all verify paths are properly async in [hash.js](../../backend/src/utils/hash.js). |
| **PERF-005** | ✅ SHIPPED | — | Verified `geolocateIp` is properly fire-and-forget (not awaited) during session creation in `token.service.js`. It does not bottleneck login. |
| **PERF-006** | ✅ SHIPPED 2026-04-21 (TD-011) | — | `/components-preview` + `/spinners-preview` are now `React.lazy()` in [AppRoutes.tsx:30-31](../../frontend/src/routes/AppRoutes.tsx). `recharts` + `lucide-react` are isolated to the `ComponentsPreview-*.js` chunk (438 kB raw / 121 kB gz). Main `index-*.js` dropped from ~872 kB / ~231 kB gz → **434 kB raw / 110 kB gz** (−438 kB / −121 kB gz). Gallery deps **intentionally kept**. |
| **PERF-007** | ✅ SHIPPED 2026-04-21 (TD-015) | — | ~~Compression sidecar parallel fetches source PDFs with unbounded `asyncio.gather`.~~ Now capped at 10 concurrent downloads via `asyncio.Semaphore` (`_FETCH_CONCURRENCY = 10` in [cloudinary_client.py](../../compression-service/app/cloudinary_client.py)). |
| **PERF-008** | ✅ SHIPPED | — | ~~Sidecar cache hit ratio has no observability. Logs say `cache_hit` but no counter. Recommendation: emit a Prometheus counter when/if metrics server added.~~ Added `prometheus_client`, mounted `/metrics`, and emitting `sidecar_cache_hits_total` Counter in sidecar endpoints. |

---

## 5.3 Type Safety & Code Quality (Frontend)

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **QUAL-001** | Info | — | 32 occurrences of `: any` across `frontend/src/`, mostly in `catch (e: any)` blocks — acceptable pattern. |
| **QUAL-002** | Info | — | 9 occurrences of `as any`, all in error-narrowing or Axios-response-shape paths. |
| **QUAL-003** | Info | — | Zero `@ts-ignore` / `@ts-expect-error` directives. Good discipline. |
| **QUAL-004** | Medium | M | **No shared contract types between frontend and backend.** Each service re-declares response shapes. Recommendation: export types from `backend/src/types/` and share via a tiny `@hms/types` package OR generate from a Zod schema. See contract-drift §5.6. |
| **QUAL-005** | Medium | S | **Oversized pages.** [HospitalsList.tsx](../../frontend/src/pages/HospitalsList.tsx) ~1500 LOC, [PatientDetails.tsx](../../frontend/src/pages/PatientDetails.tsx) >700 LOC, [ComponentsPreview.tsx](../../frontend/src/pages/ComponentsPreview.tsx) >1600 LOC. Extract modals and grids into component files. |
| **QUAL-006** | Low | S | Long ternary Tailwind class strings across buttons/modals. Recommendation: introduce `clsx` + class-variance-authority. |

---

## 5.4 Error Handling & Observability

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **OBS-001** | ✅ SHIPPED | — | Verified `/api/health/deep` now probes Cloudinary, Brevo, FCM, and Sidecar with strict timeouts and `degraded` reporting via `probeAllExternals` in [health.service.js](../../backend/src/services/health.service.js). |
| **OBS-002** | ✅ SHIPPED | — | **Audit gaps on mutations** (dup SEC-020). Handled by SEC-020. |
| **OBS-003** | ✅ SHIPPED 2026-04-25 (`8fbab6a`) | — | ~~No route-level ErrorBoundary in the frontend.~~ [MainLayout.tsx](../../frontend/src/layouts/MainLayout.tsx) now wraps `<Outlet />` in a second `<ErrorBoundary key={location.pathname} fullScreen={false}>` so a render error on one authenticated route can't blank the whole shell. The inner boundary remounts on navigation (key=pathname) so navigating away clears the error. |
| **OBS-004** | ✅ DONE | — | ~~No structured logging in Node backend~~ — RESOLVED 2026-04-21 (TD-007). Pino + pino-http shipped: JSON in prod, pretty in dev, `LOG_LEVEL` env, per-request `X-Request-Id` + `req.log` child, redaction of Authorization/Cookie + password-like top-level + nested fields. Zero `console.*` remain in `backend/src/`. See [utils/logger.js](../../backend/src/utils/logger.js). |
| **OBS-005** | ✅ SHIPPED 2026-04-21 (TD-014) | — | ~~Sidecar timeout message said "100s limit" but real timeout is 300s.~~ [folder.py:285](../../compression-service/app/endpoints/folder.py), [patient.py:301](../../compression-service/app/endpoints/patient.py), [schemas.py:73](../../compression-service/app/schemas.py) all now read `"Pipeline exceeded 300s limit"`. |
| **OBS-006** | ✅ VERIFIED | — | Error responses properly differentiate prod/dev — no stack leaks ([errorHandler.js:54-58](../../backend/src/middleware/errorHandler.js)). |
| **OBS-007** | ✅ SHIPPED | — | ~~Sidecar cache-miss fallback silently downgrades `tier_used` to -1 ([folder.py:87-88](../../compression-service/app/endpoints/folder.py)). Good for availability, bad for ops visibility. Emit a log + counter on this path.~~ Added `CACHE_META_MISSING_TOTAL` Prometheus counter to track missing sidecar metadata. |

---

## 5.5 Test Coverage Map

Ground truth: one test file exists — [backend/src/__tests__/auth.controller.test.js](../../backend/src/__tests__/auth.controller.test.js). No frontend tests, no sidecar tests.

| Area | Covered? | Test file |
|---|---|---|
| auth.controller (login, refresh) | Partial | `auth.controller.test.js` |
| patient.controller (every CRUD path) | ❌ | — |
| hospitals.controller | ❌ | — |
| export.controller | ❌ | — |
| audit.controller | ❌ | — |
| admin.controller (force delete, orphans) | ❌ | — |
| compression.service | ❌ | — |
| pdf.service + zip.service | ❌ | — |
| mail.service | ❌ | — |
| push.service | ❌ | — |
| geoip.service | ❌ | — |
| storage.service (signed URL + upload) | ❌ | — |
| token.service (refresh, session conflict) | ❌ | — |
| jobs/autoDelete | ❌ | — |
| Frontend pages (all 20) | ❌ | — |
| Compression sidecar pipeline | ❌ | — |

### Top 10 critical untested paths

1. Force-delete hospital — audit-preserving data scrub; single point of accidental destruction.
2. Compression sidecar integration (backend side) — 502/504/413 fallback behaviour.
3. Patient ID atomic increment under contention.
4. Session-conflict eviction (3rd mobile device).
5. 7-day Auth Code re-verify middleware decision.
6. Forgot-password OTP flow including max-attempts lockout.
7. Auto-delete cron with cascade Cloudinary delete.
8. Signed URL generation + TTL honouring.
9. Rate-limit matrix (login, OTP verify, export).
10. PDF mode switch (merged vs per-folder) and ZIP size gate.

**QUAL-007** · **High** · **L** — Stand up a proper test pyramid: Jest integration tests for the top 10 above + Playwright E2E for the happy-path login → upload → download loop.

---

## 5.6 API Contract Drift (Frontend ↔ Backend)

Sample comparisons (5 endpoints):

| Endpoint | Request drift | Response drift |
|---|---|---|
| `POST /auth/login` | ✅ match (identifier + password) | ✅ match |
| `PATCH /hospitals/me` | ⚠️ backend accepts `logo` multipart; frontend sends `logoFile` name but multer's middleware is permissive. | ⚠️ frontend expects `{ hospital }` — backend returns the model doc directly. Verify |
| `POST /patients/:id/download/pdf` | ⚠️ body `{ mode }` documented but controller currently treats `mode==="per-folder"` as a ZIP path (frontend expects PDF). Verify branch. | varies |
| `GET /patients/:id/files/:folder/:fileId/signed-url` | ✅ match | ✅ match |
| `GET /audits` | ✅ match (cursor, limit, filters) | ✅ match |

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **CDRIFT-001** | Medium | M | No schema source-of-truth — drift is only caught by integration tests, of which there are very few. Recommendation: generate OpenAPI from `express-validator` chains or adopt Zod on both sides. |

---

## 5.7 Concurrency & Race Conditions

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **RACE-001** | Info | — | `Hospital.patientIdCounter` uses atomic `$inc` ([patient.service.js:22-26](../../backend/src/services/patient.service.js)). ✓ |
| **RACE-002** | Medium | M | **Session creation on simultaneous device logins** — no explicit lock on `(hospitalId, deviceId)` during creation. Compound unique index will reject the loser with duplicate-key error; need to handle 11000 gracefully. Check [token.service.js createSession](../../backend/src/services/token.service.js). |
| **RACE-003** | Low | S | **Token refresh mutex** is a module-level boolean ([frontend/src/services/api.ts](../../frontend/src/services/api.ts)) — works for a single tab; multiple tabs race. Recommendation: BroadcastChannel or `localStorage` lock. |
| **RACE-004** | Medium | M | **File upload + Cloudinary delete race** — if Android uploads while compression sidecar is mid-fetch, the original source could be deleted before download. Mitigation exists via signed URL TTL. Document the invariant. |
| **RACE-005** | Medium | S | **Auto-delete cron idempotency** — no lock on the `scheduleAutoDelete` job ([autoDelete.job.js](../../backend/src/jobs/autoDelete.job.js)). If two instances run (e.g., two backend replicas), the job runs twice. Recommendation: MongoDB-based distributed lock or single-instance deployment. |

---

## 5.8 Failure Mode Catalog

| Dependency | What breaks | User symptom | Fallback? | Time to notice | Alerting |
|---|---|---|---|---|---|
| **MongoDB** | All | 500 on every request | None | Immediate (first request) | None configured |
| **Upstash Redis** | OTP store, biometric nonces, rate limiter counters | OTPs fail to verify; rate limits reset | In-memory Map auto-fallback ([redis.service.js](../../backend/src/services/redis.service.js)) | Delayed — rate limits effectively disabled per-instance | None |
| **Cloudinary** | All file ops | Uploads 500, downloads 502 | None | Immediate | None |
| **Brevo REST** | Prod email | OTPs email fails, users can't login | Retry x2 then silent failure | Delayed | None |
| **Mailtrap SMTP** | Dev email | Dev OTPs fail | None | Immediate | N/A (dev) |
| **Firebase FCM** | Push alerts | Users don't get push | Silent fail-open | Never | None |
| **ip-api.com** | Geolocation display | Session shows "Unknown" | 24h cache + "Local network" fallback | Never | None |
| **Compression sidecar** | `/compressed` downloads, patient PDF mode=merged | Falls back to local pdf-lib merge (memory-heavy) | Yes — per [compression.service.js](../../backend/src/services/compression.service.js) | ~30s per request | None |

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **FAIL-001** | High | M | **No alerting on any external dependency.** Recommendation: at minimum, a `/api/health/deep` cron-hit from an external synthetic monitor (UptimeRobot, Pingdom). |
| **FAIL-002** | ✅ SHIPPED 2026-04-25 (`a1bd66e`) | — | ~~In-memory Redis fallback silently activates in prod.~~ Production now refuses to boot without Upstash credentials ([redis.service.js:81](../../backend/src/services/redis.service.js)). Mid-process latch to in-memory store remains (when Upstash becomes unreachable after boot) but is logged as `redis_fallback_memory`. |

---

## 5.9 Onboarding Friction — "If a new senior engineer joined Monday"

### Read order — the first 15 files, ordered for maximum context velocity

1. [CLAUDE.md](../../CLAUDE.md) — 10 minutes
2. [README.md](../../README.md) — 5 minutes
3. [docs/audit/features.md](features.md) — 15 minutes
4. [backend/src/index.js](../../backend/src/index.js) — wiring + middleware order
5. [backend/src/config/env.js](../../backend/src/config/env.js) — what's configurable
6. [backend/src/models/Hospital.js](../../backend/src/models/Hospital.js) + [Patient.js](../../backend/src/models/Patient.js) + [Session.js](../../backend/src/models/Session.js) — data model
7. [backend/src/routes/auth.routes.js](../../backend/src/routes/auth.routes.js) — auth surface
8. [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js) — the dense part of the system
9. [backend/src/middleware/auth.js](../../backend/src/middleware/auth.js) — how requests are authorized + 7-day check
10. [backend/src/services/token.service.js](../../backend/src/services/token.service.js) — session lifecycle
11. [frontend/src/hooks/useAuth.tsx](../../frontend/src/hooks/useAuth.tsx) — FE auth state
12. [frontend/src/services/api.ts](../../frontend/src/services/api.ts) — refresh-token interceptor
13. [frontend/src/routes/AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx) — route map
14. [backend/src/controllers/patient.controller.js](../../backend/src/controllers/patient.controller.js) — patient + file surface
15. [compression-service/app/endpoints/folder.py](../../compression-service/app/endpoints/folder.py) — sidecar pipeline

### Five most surprising behaviours a new dev would miss

1. **Mobile 7-day Auth Code re-verify** — every request after 7 days returns 401 `AUTH_CODE_REQUIRED`. Not standard refresh behaviour.
2. **`Patient.toJSON()` silently strips `cloudinaryPublicId`** — if you try to use it client-side (e.g., for signed URL generation), it's gone.
3. **Auto-delete is a HARD delete at day 90** — no soft-delete, no trash. Test data created on Jan 1 disappears Apr 1 without warning.
4. ~~In-memory Redis fallback activates silently in prod~~ — RESOLVED 2026-04-25 (`a1bd66e`). Production now refuses to boot without Upstash credentials.
5. ~~Refresh token is reused across refreshes~~ — RESOLVED 2026-04-21 (TD-002). Refresh tokens are rotated on every `/auth/refresh-token`; replay revokes every active session for the hospital.

### Three "here be dragons" zones

1. **`Patient.folders[].files[]` embedded document** — any mutation must use `$push`/`$pull` with the positional operator; direct replacement loses concurrent writes.
2. **Cloudinary `public_id` path structure** `HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{date_hash}` — slugs are irreversible; if a folder name changes the file path does NOT, leaving orphan mismatches.
3. **Session conflict eviction** — on a 3rd mobile login, the oldest session is revoked AND an email is sent. Bugs here cascade into user confusion about "who logged me out?".

---

## 5.10 Scaling Cliffs — What breaks first at 10x?

| Load dimension | 10x | 100x | First thing that breaks |
|---|---|---|---|
| **Users (hospitals)** | 1k | 10k | ~~`GET /api/hospitals` fetches all~~ — fixed 2026-04-21 (TD-005, cursor pagination + server-side search). Admin UI in-memory filter is now bounded per page. |
| **Patients per hospital** | 50k | 500k | ~~`/api/patients` offset pagination degrades beyond ~10k~~ — fixed 2026-04-25 (`d69f0be`, TD-D, cursor pagination shipped). |
| **Files uploaded / sec** | ~5/s | ~50/s | Multer memory buffers (`uploadDocument` middleware) — each concurrent upload holds full file in RAM until Cloudinary stream completes. Node heap. |
| **Concurrent downloads** | ~20 | ~200 | Pdf-lib local merge path (`USE_COMPRESSION_SERVICE=false` OR sidecar 502) buffers entire merged PDF in heap. Also compression sidecar's 300s timeout + unbounded `asyncio.gather` for source fetches (§PERF-007). |
| **Audit log writes** | ~100/s | ~1000/s | Fire-and-forget `AuditLog.create` — no write queue. Mongo primary write contention. |
| **Sessions** | 50k active | 500k | Compound index `(hospitalId, deviceId)` + TTL scan fine at this scale; the `/sessions` query `find({ hospitalId, isActive: true })` needs compound index on `(hospitalId, isActive, lastSeenAt)` for efficient sort. |
| **Cloudinary storage** | 100 GB | 1 TB | 100 MB hard-cap per patient ZIP; Cloudinary account quotas + egress pricing become real. |
| **GeoIP** | 50k/month | — | ~~ip-api.com unkeyed 45/min cap~~ — fixed 2026-04-25 (`22e5619`, TD-027). Provider chain now prefers keyed `ipinfo.io` (50k/month free tier when `IPINFO_TOKEN` is set) and falls back to `ip-api.com` (45/min keyless). |

---

*Proceed to `05-claude-md-update.md` for the CLAUDE.md delta, and `06-tech-debt-ledger.md` for the prioritised backlog.*

---

## 6. Android Enhancements

Added 2026-04-24 with first-pass Android audit. IDs prefixed `AND-` so they don't collide with SEC-/PERF-/OBS-/QUAL-/RACE-/FAIL- above. Every finding has **path:line** evidence against commit `1b3bf22`.

### 6.1 OWASP Mobile Top 10 (2024) mapping

#### M1 — Improper Credential Usage

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-001** | 🔴 Critical | XS | **Release signing uses the debug keystore with hardcoded `"android"` passwords.** Evidence: [app/build.gradle:36-41](../../android-app/app/build.gradle). Risk: Play Store rejects the APK; anyone with the debug keystore (anyone in the world — it's shared across all Android developers) can forge the signature. Recommendation: generate a fresh upload keystore, store password in `~/.gradle/gradle.properties` (user-level, **not** committed), use `signingConfigs.release.storeFile = file(System.getenv("HMS_UPLOAD_KEYSTORE"))` with credentials from the env. Tracked as `TD-A01`. |
| **AND-002** | 🔴 Critical | XS | **`release.keystore` is committed to the repo at the root** (confirmed via `git ls-files android-app/release.keystore`). Even if it's not the real live keystore today, keystores must never be in version control. Recommendation: `git rm --cached android-app/release.keystore`, rotate the key, add `*.keystore` to `.gitignore`. Tracked as `TD-A02`. |
| **AND-003** | 🟡 Medium | XS | Firebase `google-services.json` is present at [android-app/app/google-services.json](../../android-app/app/google-services.json) — `git ls-files` shows it is NOT tracked (good). Retained as a local-only file. No action. | |

#### M2 — Inadequate Supply Chain Security

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-004** | 🟠 High | S | **`androidx.security:security-crypto:1.1.0-alpha06`** ([app/build.gradle:79](../../android-app/app/build.gradle)) is alpha. Tokens + hospital IDs of every user depend on it. Recommendation: downgrade to stable `1.1.0-alpha06` → `1.0.0` (stable) if Keystore tampering protection isn't required, or accept the alpha risk explicitly. |
| **AND-005** | 🟡 Medium | S | **`com.google.android.gms:play-services-mlkit-document-scanner:16.0.0-beta1`** ([app/build.gradle:115](../../android-app/app/build.gradle)) is beta. Scanner is on the hot upload path. Recommendation: upgrade to GA once Google ships one. |
| **AND-006** | ✅ SHIPPED | — | ~~7 dead dependencies~~ All 7 removed: Compose (8 entries), CameraX (4), DataStore, Coil, iText7, Accompanist, Shimmer. Proguard rules and shimmer colour tokens also cleaned. Tracked as `TD-A06`. |

#### M3 — Insecure Authentication / Authorization

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-007** | ✅ SHIPPED | — | ~~401 classification relies on substring-matching the error body.~~ Every backend 401 now includes a stable `errorCode` JSON field. `AuthInterceptor.kt` uses `JSONObject(body).optString("errorCode")` with substring fallback for one release cycle. Tracked as `TD-A07`. |
| **AND-008** | 🟡 Medium | S | **No rate-limiter / anti-enumeration UX around `POST /auth/session/check-conflict`** ([LoginActivity.kt:130-188](../../android-app/app/src/main/java/com/hospital/management/ui/auth/LoginActivity.kt)). It's unauthenticated and the server response reveals whether an `identifier` has any active session. If backend responds identically for non-existent identifiers this is fine — **verify** (depends on [auth.controller.js:checkSessionConflict](../../backend/src/controllers/auth.controller.js) behaviour; not re-audited in this pass). |
| **AND-009** | ✅ Info | — | Biometric keypair is correctly `BIOMETRIC_STRONG` + `setUserAuthenticationRequired(true)` + `setInvalidatedByBiometricEnrollment(true)` ([BiometricHelper.kt:82-92](../../android-app/app/src/main/java/com/hospital/management/utils/BiometricHelper.kt)). Per-hospital alias scoping at [BiometricHelper.kt:37](../../android-app/app/src/main/java/com/hospital/management/utils/BiometricHelper.kt) means multi-account devices can't bleed. |

#### M4 — Insufficient Input/Output Validation

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-010** | 🟡 Medium | S | **Server-response Gson parsing is minimal.** Every DTO field is nullable with `= null` default (correct — Gson bypasses Kotlin null-checks), but there's no schema validation. A backend change that renames `data.tempToken` → `data.token` silently parses as `null`, caller shows "Invalid server response". Recommendation: contract tests or Moshi sealed-class DTOs. Tie to [TD-020](06-tech-debt-ledger.md) (shared API types). |
| **AND-011** | ✅ Info | — | No deep-link handling (`<intent-filter><data>` absent manifest-wide). No intent-redirection risk. |
| **AND-012** | ✅ Info | — | All exported components are `android:exported="false"` or `true` with intent but no data block. See [AndroidManifest.xml](../../android-app/app/src/main/AndroidManifest.xml). |

#### M5 — Insecure Communication

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-013** | ✅ Info | — | **`usesCleartextTraffic=false` globally** ([AndroidManifest.xml:36](../../android-app/app/src/main/AndroidManifest.xml)) with network_security_config carving cleartext only for `localhost` + `10.0.2.2`. ✓ |
| **AND-014** | 🟡 Medium | M | **No certificate pinning** — deliberately removed due to Render.com rotating Google Trust Services certs ([network_security_config.xml:11-13](../../android-app/app/src/main/res/xml/network_security_config.xml)). System-CA trust is the fallback. If the cert rotation policy gets pinned to a specific CA in the future, re-enable pinning via backup-pin strategy. |
| **AND-015** | 🟡 Medium | XS | **Base URL is hardcoded** in [RetrofitClient.kt:18](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt), [HospitalApplication.kt:69](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt), transitively in [OfflineLogoutWorker.kt:98](../../android-app/app/src/main/java/com/hospital/management/worker/OfflineLogoutWorker.kt). No `BuildConfig.BASE_URL`, no flavor, no `.env` equivalent. Staging + prod cannot be switched without rebuild. Tracked as `TD-A05`. |

#### M6 — Inadequate Privacy Controls

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-016** | ✅ SHIPPED | — | ~~FileLogger writes on-device logs in release builds with 7-day retention and unredacted X-Hospital-Id.~~ `X-Hospital-Id` now redacted in `RetrofitClient.kt`; retention shortened to 2 days; `FileLogger.rotate()` called on logout; D/I-level messages gated behind `verboseFileLog` (default off). Tracked as `TD-A08`. |
| **AND-017** | 🟡 Medium | XS | **No Play Data Safety disclosure for on-device logs** — when the app is published, the Data Safety section must declare "Crash logs / Diagnostics" if `FileLogger` stays. Tracked alongside `TD-A01` (Play Store prep). |

#### M7 — Insufficient Binary Protections

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-018** | ✅ Info | — | `minifyEnabled true` + `shrinkResources true` in release ([app/build.gradle:46-47](../../android-app/app/build.gradle)). R8 obfuscates + strips. Proguard rules are thorough (17 sections in [proguard-rules.pro](../../android-app/app/proguard-rules.pro)). |
| **AND-019** | 🟡 Medium | XS | **Root detection toasts a warning but doesn't block** ([HospitalApplication.kt:63-66](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) + [SecurityUtils.kt](../../android-app/app/src/main/java/com/hospital/management/utils/SecurityUtils.kt)). For a hospital app, policy should pick one: (a) block root outright, (b) block mutations but allow read, (c) warn-only (current). Recommendation: run the question by product + legal. Tracked as [`TD-A19`](06-tech-debt-ledger.md). |
| **AND-020** | 🟡 Medium | XS | **No debugger / emulator detection.** Low priority for a records app (not a banking app), but noted. |

#### M8 — Security Misconfiguration

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-021** | ✅ Info | — | **`allowBackup=false`** ([AndroidManifest.xml:31](../../android-app/app/src/main/AndroidManifest.xml)) + `backup_rules.xml` + `data_extraction_rules.xml` explicitly exclude `sharedpref`/`database`/`file`/`external`. Defensive in depth. |
| **AND-022** | ✅ Info | — | Only `SplashActivity` is `exported=true` (required for LAUNCHER). FileProvider, FCM service, DownloadActionReceiver all explicit `exported=false`. |
| **AND-023** | 🟡 Medium | XS | **`android.enableJetifier=true`** ([gradle.properties:3](../../android-app/gradle.properties)) is no longer needed — all deps are AndroidX. Costs incremental build time. Tracked as `TD-A04`. |

#### M9 — Insecure Data Storage

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-024** | ✅ Info | — | Tokens in `EncryptedSharedPreferences` (AES256-GCM values, SIV keys) — not plaintext. [TokenManager.kt:38-74](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt). |
| **AND-025** | 🟡 Medium | S | **Last-resort fallback to plain SharedPreferences** if EncryptedSharedPreferences init fails twice ([TokenManager.kt:69-72](../../android-app/app/src/main/java/com/hospital/management/data/local/TokenManager.kt)). This trades encryption for crash resistance — tokens would land unencrypted on a small population of devices with broken Keystores. Acceptable trade, but should be logged loudly + report as a Crashlytics custom key once Crashlytics is added (see `TD-A14`). |
| **AND-026** | ✅ Info | — | `fcm_prefs` is plain SharedPreferences but only stores an FCM registration token — medium sensitivity, not high. |
| **AND-027** | ✅ Info | — | Room DB is not encrypted (no SQLCipher). Contains patient list metadata + file URIs + idempotency keys. Recommendation: add SQLCipher only if compliance requires it — `allowBackup=false` already blocks the primary exfil path. |

#### M10 — Insufficient Cryptography

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-028** | ✅ Info | — | Biometric keypair: RSA-2048 + SHA-256 + PKCS#1 padding ([BiometricHelper.kt:86-89](../../android-app/app/src/main/java/com/hospital/management/utils/BiometricHelper.kt)). Industry standard. |
| **AND-029** | ✅ Info | — | `DownloadWorker.computeHash` uses SHA-256 ([DownloadWorker.kt:682-686](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt)). ✓ |

---

### 6.2 Performance & resource management (Android)

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-P01** | 🟡 Medium | S | **`NetworkMonitor` polls `GET /api/health` every 30 s when online, every 2 s when offline** ([NetworkMonitor.kt:102-118](../../android-app/app/src/main/java/com/hospital/management/utils/NetworkMonitor.kt)). Foregrounded battery drain + network traffic. Recommendation: rely on `ConnectivityManager.NetworkCallback` alone; only ping on transition or user action. |
| **AND-P02** | 🟡 Medium | S | **60 s session-validate heartbeat** ([HospitalApplication.kt:157-193](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt)) + 30 s NetworkMonitor ping combined = 2 network hits per minute while foregrounded. On a cellular link this is measurable. Extend heartbeat to 5 min when the app has been foregrounded for >10 min without user interaction. |
| **AND-P03** | 🟡 Medium | XS | **`Glide.with(this).load(logoUrl).circleCrop()`** ([DashboardActivity.kt:297](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt), [ProfileActivity.kt:146](../../android-app/app/src/main/java/com/hospital/management/ui/profile/ProfileActivity.kt), [FolderViewActivity](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderViewActivity.kt)) — no `.override(width, height)` call. Full-resolution logo bitmap loaded into heap, then circle-cropped to ~40 dp. On a large logo (Cloudinary delivers originals by default) this is tens of MB transient heap. Recommendation: `.override(120, 120)` or Cloudinary `c_fit,w_120,h_120` transformation URL. |
| **AND-P04** | 🟡 Medium | XS | **`GlobalScope.launch` in DashboardActivity.logout** ([DashboardActivity.kt:252](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt)). Deliberate (survives `finish()`) and annotated `@OptIn(DelicateCoroutinesApi)`, but worth knowing: if the `SessionManager.logoutUser` coroutine throws, the crash handler catches it — but if a descendent job escapes the supervisor tree, the process outlives the activity. Low risk, documented. |
| **AND-P05** | 🟡 Medium | S | **`SyncDocumentsWorker.getFileFromUri` copies every `content://` URI into `cacheDir` before uploading** ([SyncDocumentsWorker.kt:194-220](../../android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt)). For a 20 MB PDF this is a 20 MB double-write (copy + multipart upload reads again). Use `ContentResolver.openInputStream` + stream directly into `MultipartBody.Part.createFormData(...)` via `RequestBody.create(mediaType, byteStream)`. |
| **AND-P06** | 🟡 Medium | M | **`PatientViewModel` refetches from server on every `onResume`** (e.g. [DashboardActivity.kt:97-101](../../android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt), [FolderDetailsActivity.kt:99-100](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FolderDetailsActivity.kt)) plus on SwipeRefresh. No 30 s "recently fetched" short-circuit. A user who hits Back from a folder and comes back to the Dashboard fires a full `/api/patients` fetch. Moderate cellular impact. Recommendation: if `lastFetchedAt > now - 30s`, skip the server call. |
| **AND-P07** | 🟡 Medium | S | **Download cache cap 500 MB** ([DownloadWorker.kt:53](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt)). On low-end Android-26 devices this can be half of their free storage. Make it a percentage-of-free-space cap (e.g. `min(500MB, freeSpace * 0.25)`). |
| **AND-P08** | 🟡 Medium | XS | **`Dispatchers.IO` + `lifecycleScope.launch` pattern** used 83 places. All correctly scoped to `viewModelScope` or `lifecycleScope`. No leaks identified. ✓ |
| **AND-P09** | 🟡 Medium | S | **No `DiffUtil` on PatientAdapter / FolderAdapter / FileAdapter / SessionsAdapter.** Recycler lists `updateList(...)` calls `notifyDataSetChanged()` under the hood. At 1k patients this becomes visible. Recommendation: `ListAdapter<T, ViewHolder>` + `DiffUtil.ItemCallback`. |
| **AND-P10** | 🟡 Medium | M | **`fallbackToDestructiveMigration()` enabled on AppDatabase** ([AppDatabase.kt:120](../../android-app/app/src/main/java/com/hospital/management/data/local/AppDatabase.kt)). If a future release ships without adding a migration step, every user's pending uploads are silently destroyed. Recommendation: remove after confirming every version-bump has a corresponding migration entry, or keep but add a loud `logger.wtf("db migration fallback fired")` hook. |

### 6.3 OOM risk map

Screens most likely to cause OutOfMemory on low-end (1 GB RAM) Android-26 devices:

1. **`FileViewerActivity` with a 40-page PDF** — [FileViewerActivity.kt:3,12,41](../../android-app/app/src/main/java/com/hospital/management/ui/folders/FileViewerActivity.kt) uses `android.graphics.pdf.PdfRenderer`. Each rendered page bitmap is held in memory while the user flips. 40 pages × ~2 MB bitmap = 80 MB heap.
2. **`ScannerActivity` → `UploadActivity` with 20 pages** — [ScannerActivity.kt:94 (`setPageLimit(20)`)](../../android-app/app/src/main/java/com/hospital/management/ui/scanner/ScannerActivity.kt). Uploaded PDF builder at [PdfUtils.kt](../../android-app/app/src/main/java/com/hospital/management/utils/PdfUtils.kt) draws 1654×2339 bitmaps (A4 200 DPI) — ~15 MB per page before compression. Sequential processing would help; current code does all pages in a single pass.
3. **`FolderDetailsActivity` with 200 files** — all `FileItem`s loaded into one `RecyclerView` via in-memory list. Thumbnails loaded via Glide (200 bitmaps in LRU). Low-end devices with many files per folder push Glide's memory cache.
4. **`DashboardActivity` with 10k patients** — `PatientAdapter.updateList(mutableListOf)` holds the full result set in memory + repaints. The backend's `/api/patients` offset-pagination cap isn't enforced client-side; a user with 10k patients hits the full set.

---

### 6.4 Scaling cliffs (Android)

| Load dimension | 10× | 100× | First thing that breaks |
|---|---|---|---|
| **Patients per hospital** | 1 000 | 10 000 | `DashboardActivity` in-memory list + no DiffUtil (P09) → jank; Room cache write takes seconds (`insertPatients(all)`). |
| **Files per patient** | 500 | 5 000 | `FolderViewActivity` folders grid OK; but per-folder `FolderDetailsActivity` at 1k files = 1k Glide thumbnails. |
| **Pages per scan** | 20 | 100 | PDF builder OOM at 1654×2339 bitmap × 100; current ML Kit `setPageLimit(20)` is the safety valve. |
| **Offline-queue depth** | 50 | 500 | `SyncDocumentsWorker` iterates sequentially ([SyncDocumentsWorker.kt:88-148](../../android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt)) — 500 docs × 2 s each = 17 min of foreground work. Result.retry for any retryable failure restarts from the top with a 30 s backoff. |
| **Download cache churn** | 1 GB/day | 10 GB/day | LRU eviction under the 500 MB cap handles it, but `totalCacheBytes()` is scanned on every finalize. At 10 GB/day churn this is noticeable. |
| **Concurrent downloads** | 2 | 10 | Each `DownloadWorker` is a foreground service. Android caps per-app concurrent foreground services implicitly by the OS; bulk downloads would queue in WorkManager. |

---

### 6.5 Error handling & observability (Android)

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **AND-O01** | 🟠 High | M | **No crash reporter**. Firebase Analytics is in the BoM ([app/build.gradle:143](../../android-app/app/build.gradle)) but Crashlytics is **not**. Only [FileLogger.kt:56-61](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) catches `Thread.defaultUncaughtExceptionHandler` and writes to disk — the on-device log is the only post-mortem, pullable only via `adb pull`. The release-login crash in April 2026 took days to diagnose because of this. Recommendation: add `firebase-crashlytics-ktx`, enable in release only (disabled in debug). Tracked as `TD-A14`. |
| **AND-O02** | 🟡 Medium | S | **No analytics events fired**. Firebase Analytics BoM is paid-for but `logEvent` call count = 0. Core flows (`login_success`, `upload_success`, `download_*`) are un-tracked. |
| **AND-O03** | 🟡 Medium | S | **Empty `catch (_: Throwable) {}`** in several hot paths (e.g. [SessionManager.kt:137, 148, 156](../../android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt), [AuthRepository.kt:80](../../android-app/app/src/main/java/com/hospital/management/data/repository/AuthRepository.kt)). Deliberate for best-effort work during logout; the dropped exception is invisible. Recommendation: at minimum log via FileLogger so the teardown path is auditable. |
| **AND-O04** | ✅ Info | — | `FileLogger.e` is used consistently at error sites with `Throwable` + `.javaClass.name` — release APK is debuggable via `adb pull logs/`. |
| **AND-O05** | 🟡 Medium | XS | **Retrofit / OkHttp timeouts**: `connect=30s, read=30s, write=30s` for the main client ([RetrofitClient.kt:59-61](../../android-app/app/src/main/java/com/hospital/management/data/api/RetrofitClient.kt)). Refresh-token client has `15s` ([AuthInterceptor.kt:70-76](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt)). Downloads use `60s` read inside `DownloadWorker.kt:232-233`. All reasonable; 30 s read is fine for Render.com cold starts but aggressive for a 100 MB ZIP — `DownloadWorker`'s 60 s is the better choice. No action. |
| **AND-O06** | 🟡 Medium | S | **No "last sync time" surfaced to the user**. Offline UX is good (`"You are offline"` + `"Viewing saved data"` snackbars via `BaseActivity.observeNetworkStatus`) but no indication of cache freshness. On a patient record shown offline, the user can't tell if it's 1 hour or 1 week stale. |

---

### 6.6 Android test coverage map

| Component | Covered? | Test file |
|---|---|---|
| `AuthViewModel` (login, verify-auth-code, change-password, biometric branches) | ❌ | — |
| `AuthInterceptor.intercept` (401 classification + refresh mutex + rotation) | ❌ | — |
| `SessionManager.logoutUser` (cross-account guard, offline fallback) | ❌ | — |
| `SyncDocumentsWorker` (auth gate, cross-account purge, idempotency) | ❌ | — |
| `DownloadWorker` (cache hit, Range resume, cancel, retry) | ❌ | — |
| `TokenManager` (corruption-recovery path) | ❌ | — |
| `BiometricHelper` (key invalidation) | ❌ | — |
| Room migrations (1→8) | ❌ | — |
| `PdfUtils.buildPdf` compression profiles | ❌ | — |
| ANY UI flow | ❌ | — |

**Zero test files under `android-app/app/src/test/` or `android-app/app/src/androidTest/`.** The `testImplementation junit:4.13.2` + `androidTestImplementation espresso-core` declarations at [app/build.gradle:146-148](../../android-app/app/build.gradle) are dormant.

**Top 5 critical untested paths** (most likely to regress silently):

1. **`AuthInterceptor.performRefresh` after TD-002** — the rotation branch that saves `newRefresh`. If this ever reverts to "keep old refresh" the next refresh kills every session (TD-002 reuse detection). Test: Mockito + MockWebServer round-trip.
2. **`SessionManager.logoutUser` cross-account guard** — the `deleteAllForHospital` + `deleteAllNotOwnedBy` dance. If broken, patient docs from user A leak into user B's account. Compliance-critical.
3. **Room migration chain (1→8)** — `fallbackToDestructiveMigration()` currently masks bugs here. One test that creates a v1 DB + runs all 7 migrations would catch any future break.
4. **R8-sensitive path**: login + auth-code verify + change-password via a release-like build. The April 2026 release-login crash could have been caught by an instrumentation test run against the minified APK.
5. **`SyncDocumentsWorker` auth gate** — on a logout-offline-login-as-different-user sequence, no doc should upload under the new account.

Tracked as `TD-A12` (test seed, ~1–2 weeks effort).

---

### 6.7 Android onboarding friction — "if a new senior Android engineer joined Monday"

**The first 12 files, in order** (cross-referenced to [android.md §10](android.md) — canonical list):

See [`android.md` §10](android.md). Key callout for this section: the three "here be dragons" zones — (a) `proguard-rules.pro` §17 R8 rules, (b) `SessionManager.logoutUser` cross-account guard, (c) `AuthInterceptor` 401-body-substring classification.

**Five most surprising Android-only behaviours:**

1. **Release APK login is R8-load-bearing.** Remove any of the four rules in `proguard-rules.pro:210-242` and `POST /auth/login` throws `ClassCastException` — not in debug.
2. **`OfflineLogoutWorker` uses a bare OkHttp client intentionally** ([OfflineLogoutWorker.kt:129-135](../../android-app/app/src/main/java/com/hospital/management/worker/OfflineLogoutWorker.kt)). Adding it to `RetrofitClient` would recurse the 401 flow on a logout worker that runs AFTER local tokens are cleared.
3. **`DownloadWorker.KEY_STATUS_URL` branch is dormant but intentional** (Phase 3C hold). Don't delete it during a "dead code" sweep.
4. **`X-Upload-Profile` header is ignored server-side** but sent anyway (see `§4.3 D1` in [android.md](android.md)).
5. **`HospitalApplication.heartbeatJob` runs on `Dispatchers.IO`** inside a `SupervisorJob() + Dispatchers.Main` scope. The `launch(Dispatchers.IO)` at [HospitalApplication.kt:161](../../android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt) is what keeps the 60 s loop off the main thread. Changing this to `Dispatchers.Main` (to match the parent scope's dispatcher) would freeze the UI every 60 s.

**Three "here be dragons" zones:** (a) `proguard-rules.pro` §17 — entire release-build login; (b) `SessionManager.logoutUser` order-of-operations — compliance-critical; (c) `AuthInterceptor` body-substring 401 classification — silently breaks on any server message reword.

---

### 6.8 Play Store compliance (Android) — pre-first-upload checklist

| Item | Status | Notes |
|---|---|---|
| Replace debug keystore (AND-001) | ❌ | Tracked `TD-A01`. |
| Remove tracked `release.keystore` + rotate (AND-002) | ❌ | Tracked `TD-A02`. |
| Bump `versionCode` on every upload | ❌ (stuck at `1`) | Tracked `TD-A03`. |
| `targetSdk 35` | ❌ (on 34) | Play requires 35 for new apps (Aug 2025). Tracked `TD-A03`. |
| Enable Play App Signing | ❌ (not on store) | Action when listing is created. |
| Upload `mapping.txt` to Play Console after each release | ❌ | Action after first upload. |
| `.aab` bundle instead of fat APK | ❌ | `./gradlew bundleRelease` — tracked in `TD-A03`. |
| Data Safety declaration for `FOREGROUND_SERVICE_DATA_SYNC` + on-device logs + FCM token | ❌ | Tracked `TD-A03` + `TD-A08`. |
| Privacy Policy URL | ⚠️ (lives at [frontend Privacy page](../../frontend/src/pages/Privacy.tsx)) — confirm reachable URL. |
| Crashlytics (AND-O01) | ❌ | Tracked `TD-A14`. Required for post-ship debugging. |

---

*Proceed to `06-tech-debt-ledger.md` for the prioritised Android backlog (section "Android backlog — `TD-A01`..`TD-A15`").*
