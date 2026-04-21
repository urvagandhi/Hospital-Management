# Enhancements — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21

Each finding: **ID** · **Severity** (Critical/High/Medium/Low/Info) · **Effort** (XS/S/M/L/XL) · description, evidence, recommendation, risk.

---

## 5.1 Security Audit (OWASP Top 10 2021)

### A01 — Broken Access Control

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-001** | Medium | S | **`GET /api/hospitals` returns all rows without pagination.** Evidence: [hospitals.controller.js:31](../../backend/src/controllers/hospitals.controller.js) — `Hospital.find().sort({ createdAt: -1 })`, no `.limit()`. Recommendation: cap at 100 + add cursor pagination. Risk: memory + response-time spike as hospital count grows; admin UI in-memory filter compounds the cost. |
| **SEC-002** | Info | — | Patient/folder/file endpoints correctly enforce `{ _id, hospitalId }` scope in [patient.service.js:150](../../backend/src/services/patient.service.js). No IDOR found. |
| **SEC-003** | Info | — | `/api/audits` properly forces `userId: req.hospital.id` server-side ([audit.controller.js:43](../../backend/src/controllers/audit.controller.js)); client-supplied `userId` ignored. |

### A02 — Cryptographic Failures

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-004** | High | M | **Refresh tokens are not rotated.** Evidence: [token.service.js:196-231](../../backend/src/services/token.service.js) — on refresh, the same `session.refreshToken` is returned. A stolen refresh token remains valid until `expiresAt` (up to 365 days). Recommendation: generate a new refresh token and update `Session.refreshToken` on each rotation; detect reuse → revoke all sessions for that hospital. Risk: prolonged session hijack undetectable. |
| **SEC-005** | Info | — | Bcrypt cost factor 10 ([hash.js:8](../../backend/src/utils/hash.js)). Industry standard. |
| **SEC-006** | Info | — | JWT uses HS256 via `jsonwebtoken`; `jwt.verify` call pins the library default (rejects `alg: none`). [jwt.js](../../backend/src/utils/jwt.js). |
| **SEC-007** | Low | S | `.env.example` contains no hint that `JWT_SECRET` / `REFRESH_TOKEN_SECRET` must be different random strings. Recommendation: add explicit comment + generator hint. |

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
| **SEC-013** | Low | XS | Helmet uses default config (no customisation) — default CSP is fairly strict for an API but does not set `Cross-Origin-Opener-Policy`; acceptable for now. [index.js:72](../../backend/src/index.js). |
| **SEC-014** | Medium | XS | **`.env.example` contains dead TOTP + SMS + legacy SMTP vars** (see 00-drift §5.2). Recommendation: prune to reduce surprise. Risk: new engineers believe these features work. |

### A06 — Vulnerable Components

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-015** | Medium | S | **`bcryptjs 2.4.3`** is old (2018). Recommendation: upgrade to `bcryptjs@^3` or migrate to `bcrypt` (native) for performance. Risk: slow password verify under load. |
| **SEC-016** | Low | S | `@aws-sdk/client-s3` 3.932.0 carries dependency only through dead `r2.service.js` — remove the dep (see dead-code §B). |

### A07 — Identification & Auth Failures

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-017** | Info | — | Account lockout after 5 failed attempts + email. Verified in controllers. |
| **SEC-018** | Info | — | Forgot-password init always returns 200 (enumeration-safe). Verified. |

### A08 — Software & Data Integrity

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-019** | Low | S | Backend has no package-lock integrity verification in CI (no `npm ci` script configured in `package.json` → `scripts`). Recommendation: add `ci` script and Dependabot. |

### A09 — Security Logging & Monitoring

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-020** | **High** | M | **Audit logging missing on 8 mutation endpoints** (see 00-drift §10). Violates explicit convention (CLAUDE.md §12). Recommendation: add `logAudit()` to `createPatient`, `updatePatient`, `createFolder`, `uploadFile`, `renameFile`, `patchMe`, `updateHospital`, `deleteOrphans`. Risk: compliance / forensic-blind on data mutations. |

### A10 — SSRF

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **SEC-021** | Info | — | Only outbound HTTP is to fixed hosts (Cloudinary, Brevo, FCM, ip-api.com, configured sidecar URL). No user-supplied URL fetching. No SSRF risk observed. |

---

## 5.2 Performance & Scaling Hotspots

| ID | Sev | Eff | Finding |
|---|---|---|---|
| **PERF-001** | High | S | **No pagination on `GET /api/hospitals`** (dup of SEC-001). Memory grows linearly with hospital count; list page renders them all at once. |
| **PERF-002** | Medium | M | **`/api/patients` pagination is offset-based with no max cap.** [patient.service.js](../../backend/src/services/patient.service.js). `skip+limit` degrades beyond ~10k patients per hospital. Recommendation: cursor-based with `_id` or `createdAt`. |
| **PERF-003** | Medium | M | **PDF/ZIP downloads are buffered into memory before streaming in some paths.** [pdf.service.js](../../backend/src/services/pdf.service.js) and [zip.service.js](../../backend/src/services/zip.service.js) — archiver pipes correctly, but pdf-lib merges the whole doc set in heap. Large patient bundles will OOM. Compression sidecar is the correct mitigation — ensure `USE_COMPRESSION_SERVICE=true` in prod. |
| **PERF-004** | Low | XS | `bcrypt.compareSync` NOT used; all verify paths are async ([hash.js](../../backend/src/utils/hash.js)). ✓ |
| **PERF-005** | Medium | S | **GeoIP synchronous lookup on session create could bottleneck login.** [geoip.service.js](../../backend/src/services/geoip.service.js) uses fire-and-forget per CLAUDE.md claim; verify: if called with `await`, it adds ~80-300ms per login. If already fire-and-forget, no action. |
| **PERF-006** | Low | S | Frontend bundle includes `recharts` + `lucide-react` used only by `/components-preview`. Route-split that route to avoid pulling them into the main bundle. [vite.config.ts](../../frontend/vite.config.ts). Est savings: ~200-400 kB gzipped. |
| **PERF-007** | Low | XS | Compression sidecar parallel fetches source PDFs with unbounded `asyncio.gather` ([cloudinary_client.py:169](../../compression-service/app/cloudinary_client.py)). Not a problem today (usually <10 sources), but cap at e.g. 10 concurrent fetches to protect the Cloudinary connection pool. |
| **PERF-008** | Low | XS | Sidecar cache hit ratio has no observability. Logs say `cache_hit` but no counter. Recommendation: emit a Prometheus counter when/if metrics server added. |

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
| **OBS-001** | Medium | S | **`/api/health/deep` does not probe Cloudinary / Brevo / FCM / Sidecar.** [index.js:140-177](../../backend/src/index.js) checks Mongo, Redis, server only. Recommendation: add probe functions with 2-3s timeout each and degraded-if-any-fail reporting. |
| **OBS-002** | Medium | S | **Audit gaps on mutations** (dup SEC-020). |
| **OBS-003** | Low | XS | No route-level ErrorBoundary in the frontend; only top-level ([App.tsx](../../frontend/src/App.tsx)). If a page crashes, the whole shell unmounts. Add boundaries around Dashboard and PatientDetails. |
| **OBS-004** | ✅ DONE | M | ~~No structured logging in Node backend~~ — RESOLVED 2026-04-21 (TD-007). Pino + pino-http shipped: JSON in prod, pretty in dev, `LOG_LEVEL` env, per-request `X-Request-Id` + `req.log` child, redaction of Authorization/Cookie + password-like top-level + nested fields. Zero `console.*` remain in `backend/src/`. See [utils/logger.js](../../backend/src/utils/logger.js). |
| **OBS-005** | Low | XS | Compression sidecar timeout error message says "100s limit" but real timeout is 300s. [folder.py:274](../../compression-service/app/endpoints/folder.py), [patient.py:288](../../compression-service/app/endpoints/patient.py). Fix the string. |
| **OBS-006** | Info | — | Error responses properly differentiate prod/dev — no stack leaks ([errorHandler.js:54-58](../../backend/src/middleware/errorHandler.js)). |
| **OBS-007** | Medium | S | **Sidecar cache-miss fallback silently downgrades `tier_used` to -1** ([folder.py:87-88](../../compression-service/app/endpoints/folder.py)). Good for availability, bad for ops visibility. Emit a log + counter on this path. |

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
| **FAIL-002** | Medium | S | **In-memory Redis fallback is dev-only but silently activates in prod** ([redis.service.js](../../backend/src/services/redis.service.js)). If Upstash keys are missing in prod, rate limits become per-instance instead of global. Log loudly + refuse to boot in prod if fallback engaged. |

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
4. **In-memory Redis fallback activates silently** in prod if Upstash credentials are absent. Rate limits effectively disabled. No log shout.
5. **Refresh token is reused across refreshes** — not rotated. Contrary to common pattern.

### Three "here be dragons" zones

1. **`Patient.folders[].files[]` embedded document** — any mutation must use `$push`/`$pull` with the positional operator; direct replacement loses concurrent writes.
2. **Cloudinary `public_id` path structure** `HospitALL/h_{hospitalId}/p_{patientMongoId}/{folder_slug}/{date_hash}` — slugs are irreversible; if a folder name changes the file path does NOT, leaving orphan mismatches.
3. **Session conflict eviction** — on a 3rd mobile login, the oldest session is revoked AND an email is sent. Bugs here cascade into user confusion about "who logged me out?".

---

## 5.10 Scaling Cliffs — What breaks first at 10x?

| Load dimension | 10x | 100x | First thing that breaks |
|---|---|---|---|
| **Users (hospitals)** | 1k | 10k | `GET /api/hospitals` fetches all (§SEC-001); also admin UI renders them all in memory. |
| **Patients per hospital** | 50k | 500k | Dashboard `/api/patients` offset pagination degrades beyond ~10k; Mongo `sort + skip` scans the index. |
| **Files uploaded / sec** | ~5/s | ~50/s | Multer memory buffers (`uploadDocument` middleware) — each concurrent upload holds full file in RAM until Cloudinary stream completes. Node heap. |
| **Concurrent downloads** | ~20 | ~200 | Pdf-lib local merge path (`USE_COMPRESSION_SERVICE=false` OR sidecar 502) buffers entire merged PDF in heap. Also compression sidecar's 300s timeout + unbounded `asyncio.gather` for source fetches (§PERF-007). |
| **Audit log writes** | ~100/s | ~1000/s | Fire-and-forget `AuditLog.create` — no write queue. Mongo primary write contention. |
| **Sessions** | 50k active | 500k | Compound index `(hospitalId, deviceId)` + TTL scan fine at this scale; the `/sessions` query `find({ hospitalId, isActive: true })` needs compound index on `(hospitalId, isActive, lastSeenAt)` for efficient sort. |
| **Cloudinary storage** | 100 GB | 1 TB | 100 MB hard-cap per patient ZIP; Cloudinary account quotas + egress pricing become real. |
| **GeoIP** | 45 req/min | — | ip-api.com free tier rate-limits at 45/min — a 10x login spike blows the budget immediately. Switch to `ipinfo.io` with a token. |

---

*Proceed to `05-claude-md-update.md` for the CLAUDE.md delta, and `06-tech-debt-ledger.md` for the prioritised backlog.*
