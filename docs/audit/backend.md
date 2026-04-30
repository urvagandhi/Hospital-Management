# Hospital Management Backend — Comprehensive Audit Report (Refreshed)

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-26 — re-verified against `61fa6ad`. Adds: idle-sweep job (mobile-exempt), `getClientIp` Cloudflare helper, JWT HS256 pinning, `/api/patients` cursor pagination, in-memory access token (TD-029), sidecar mandatory in prod (TD-D4), env-var surface for `IPINFO_TOKEN` / `TRUST_PROXY_HOPS` / `LOG_LEVEL` / `LOG_PRETTY` / `GEOIP_DEV_OVERRIDE_IP` / `FIREBASE_SERVICE_ACCOUNT_*`. TD-007/008/009/011/014/015/016/018/019/021/022/023/024/025/027/029/030 + TD-D4 all shipped. Sections below marked 🛠️ where the code has moved on since the initial drift capture.
**Audit Scope:** Backend at `/backend/src/` + Compression Service at `/compression-service/`

---

## 0. Changes Since Previous Audit (2026-04-20)

| Area               | Change                                                                                                                                     | Pointer                            |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------- |
| Endpoint counts    | Total **64** (was 59 pre-TD-030; previous prior audit said 54). Auth 24, patients 20 (16+4), hospitals 12, export 1, audits 2, admin 2, version 1, health 2. TD-030 dropped 7 dead routes (`/api/notifications/*` × 3, `/api/export/sample-cover`, `/api/export/archive`, `/api/patients/.../stream`, `/api/auth/login/resend-auth-code`).                                              | `00-drift.md` §2                   |
| Hospital endpoints | `POST /api/hospitals/me/change-contact/resend` previously not listed                                                                       | §4 hospitals table                 |
| Session model      | `location` embedded sub-doc (city, region, country, countryCode, isPrivate, displayName) added for GeoIP display — absent from prior audit | §3 Session                         |
| AuditLog model     | 🛠️ ~~`TOTP_*` + `RECOVERY_*` enum values are dead~~ — RESOLVED 2026-04-21 (TD-013, commit `e1a02fd`); 10 dead enum members removed.                                                                      | §3 AuditLog + `01-dead-code.md` §G |
| Services           | `r2.service.js` still has **zero callers** — entire file is dead; `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` are unused deps. TD-003 still open as of 2026-04-26.          | `01-dead-code.md` §D               |
| Services           | `token.service.js:cleanupExpiredSessions` was orphaned — ✅ deleted 2026-04-25. (`mail.service.js:sendLogoutConfirmationEmail` was a prior false positive; still in use at [auth.controller.js:1265](../../backend/src/controllers/auth.controller.js#L1265).) | `01-dead-code.md` §D               |
| Env vars           | 🛠️ ~~`.env.example` missing 9 referenced vars; contains 13 dead vars~~ — RESOLVED 2026-04-21 (TD-004). Diff against code is now zero.                                            | `00-drift.md` §5                   |
| Env vars           | 🛠️ ~~`.env.example` sets `REFRESH_TOKEN_EXPIRY=7d`~~ — RESOLVED 2026-04-21 (TD-004): pinned to `365d`.                                                                    | `00-drift.md` §9                   |
| Audit coverage     | 🛠️ ~~8 mutation endpoints do not audit-log~~ — RESOLVED 2026-04-21 (TD-001, commit `a118b0a`); every mutation handler emits `logAudit()`.                                                              | `00-drift.md` §10                  |
| Security           | 🛠️ ~~Refresh token is NOT rotated~~ — RESOLVED 2026-04-21 (TD-002, commit `9f993db`); rotation + reuse detection shipped. JWT verify pinned to HS256 (TD-023, `09fae23`). bcryptjs 2.4 → 3.0 (TD-022, `effaea1`).                                                                                | `04-enhancements.md` §5.1 SEC-004  |
| Unused deps        | 🛠️ ~~`@getbrevo/brevo`, `axios` have zero imports~~ — RESOLVED 2026-04-21 (TD-012, commit `91217cb`); both removed.                                                                             | `01-dead-code.md` §B               |
| Sessions / IP      | NEW 2026-04-25: server-side idle sweep (`jobs/idleSweep.job.js`, 60-min cutoff, web-only — mobile exempt per `61fa6ad`). Cloudflare-aware `utils/clientIp.js` honours `CF-Connecting-IP` → `True-Client-IP` → `XFF[0]` → `req.ip`. Session model gained `lastSeenIp` field (re-set on IP change in `middleware/auth.js`).                                            | `d554a4a` / `7377d76` / `61fa6ad`  |
| Storage / patients | NEW 2026-04-25: `GET /api/patients` accepts `?cursor` keyset paging (TD-025, `d69f0be`); falls back to `?skip` for legacy clients.                                                                                | `04-enhancements.md` PERF-002      |
| Compression / prod | NEW 2026-04-25: backend refuses to boot when `NODE_ENV=production` AND `USE_COMPRESSION_SERVICE !== "true"` (TD-D4, commit `173db5a`).                                                                              | `06-tech-debt-ledger.md` TD-D4     |
| Logging            | 🛠️ NEW 2026-04-21: pino + pino-http + redaction + request-id shipped (TD-007, `efa5d92`); 0 `console.*` left in `backend/src/`.                                                                                | `04-enhancements.md` OBS-004       |
| Health probes      | 🛠️ NEW 2026-04-21: `/api/health/deep` probes DB + Redis + Cloudinary + Brevo + FCM + sidecar with per-dep 3 s timeout (TD-008, `efa5d92`).                                                                          | `04-enhancements.md` OBS-001       |

---

## 1. Tech Stack

### Backend (Node.js)

Identical to [backend/package.json](../../backend/package.json). Key deps:

| Component      | Version                                                                             | Purpose                                |
| -------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| Runtime        | Node.js (ES Modules, `"type": "module"`)                                            |                                        |
| Framework      | Express `^4.18.2`                                                                   | HTTP                                   |
| ODM            | Mongoose `^7.5.0`                                                                   | MongoDB                                |
| Redis          | `@upstash/redis ^1.37.0`                                                            | OTP / rate counters / biometric nonces |
| JWT            | `jsonwebtoken ^9.0.2`                                                               |                                        |
| bcrypt         | `bcryptjs ^3.0.3` (TD-022, 2026-04-25)                                              | cost=10                                |
| Upload         | `multer ^2.0.2` + `multer-storage-cloudinary ^2.2.1`                                |                                        |
| Storage        | `cloudinary ^2.9.0`                                                                 | primary                                |
| Email prod     | ~~`@getbrevo/brevo ^5.0.3`~~ — removed 2026-04-21 (TD-012)                          |                                        |
| Email dev/prod | `nodemailer ^8.0.5`                                                                 | actual mail transport                  |
| Push           | `firebase-admin ^13.0.0`                                                            | FCM                                    |
| PDF            | `pdfkit ^0.17.2`, `pdf-lib ^1.17.1`                                                 |                                        |
| ZIP            | `archiver ^7.0.1`                                                                   |                                        |
| Cron           | `node-cron ^4.2.1`                                                                  |                                        |
| Legacy S3      | `@aws-sdk/client-s3 ^3.932.0` + presigner **(unused — dead code in r2.service.js)** |                                        |
| Validation     | `express-validator ^7.0.0`                                                          |                                        |
| Security       | `helmet ^7.0.0`, `express-rate-limit ^6.10.0`, `cors ^2.8.5`                        |                                        |

Dev: `jest ^29.7.0` + pino logging (`pino`, `pino-http`, `pino-pretty` — added by TD-007), `nodemon ^3.0.1` (devDep — `npm start` runs `node src/index.js` directly, commit `ea5fd05`), `supertest ^6.3.3` (only one test file — see §12 Coverage). Jest ESM is now wired (`NODE_OPTIONS=--experimental-vm-modules` per commit `c92df1d`); the historical "TD-006 blocked behind ESM" note is obsolete.

### Compression sidecar (Python 3.12)

Per [compression-service/requirements.txt](../../compression-service/requirements.txt). Key: `fastapi 0.115.12`, `uvicorn[standard] 0.34.3`, `pikepdf 9.7.0`, `pypdfium2 4.30.1`, `fpdf2 2.8.3`, `cloudinary 1.41.0`, `motor 3.7.1`, `httpx 0.28.1`, `python-multipart 0.0.20`.

---

## 2. Project Structure

```
backend/src/
├── config/           # db.js, env.js, firebase.js
├── controllers/      # admin, appVersion, audit, auth, export, hospitals, notifications, patient (8)
├── middleware/       # auth, errorHandler, rateLimiter, upload, validateRequest (5)
├── models/           # AppVersion, AuditLog, Hospital, Patient, Session (5)
├── routes/           # 8 route files matching controllers
├── services/         # compression, mail, patient, pdf, push, r2(DEAD), redis, storage, token, zip, geoip, health (11 live + 1 dead)
├── jobs/             # autoDelete.job.js, idleSweep.job.js (2 — idleSweep added 2026-04-25)
├── utils/            # hash.js, jwt.js, logger.js (pino), clientIp.js (Cloudflare-aware)
├── __tests__/        # auth.controller.test.js (only file)
├── index.js
└── seed.js

compression-service/app/
├── main.py                    # FastAPI app, lifespan, secret middleware
├── config.py                  # env validation, DB name append
├── schemas.py                 # Pydantic DTOs
├── logging_config.py          # JSON logs
├── cloudinary_client.py       # SDK wrapper + signed URL + parallel fetch
├── audit.py                   # compression_audits write
├── merged_cache.py            # merged_pdf_cache upsert + read
├── endpoints/                 # health, folder-download, patient-download (3)
└── compression/               # classifier, tier_ladder, ghostscript, hasher, cover_page (5)
```

---

## 3. Database Schema

### Hospital (`hospitals`)

Fields as previously documented. Additional observations:

- **Pre-validate hook** ([Hospital.js:189-198](../../backend/src/models/Hospital.js)) auto-generates unique 6-digit `authCode` if unset.
- Indexes: `email` unique, `phone` unique, `authCode` unique.
- Virtual: `fullAddress`. Methods: `matchPassword`, `getInitials`. Statics: `generateAuthCode`, `generateUniqueAuthCode`.

### Patient (`patients`)

Fields + embedded `folders[].files[]` as previously documented. `Patient.toJSON()` strips `cloudinaryPublicId`, `resourceType`, `accessMode`.

Indexes: `hospitalId`, `createdAt`, compound `(hospitalId, createdAt)`, compound-unique `(hospitalId, patientId)`. Default 11 folders on create.

### Session (`sessions`)

Fields as previously documented, **plus** ([Session.js:58-65](../../backend/src/models/Session.js)):

| Field                  | Type    | Purpose            |
| ---------------------- | ------- | ------------------ |
| `location.city`        | String  | Geo city           |
| `location.region`      | String  | Geo region/state   |
| `location.country`     | String  | Geo country        |
| `location.countryCode` | String  | ISO code           |
| `location.isPrivate`   | Boolean | Private IP?        |
| `location.displayName` | String  | Human label for UI |

Indexes: TTL on `expiresAt`, compound `(hospitalId, deviceId)`.

### AuditLog (`auditlogs`)

As previously documented. 🛠️ Dead `TOTP_*` + `RECOVERY_*` enum values pruned 2026-04-21 (TD-013, commit `e1a02fd`). New emit values added by TD-001 (2026-04-21): `PATIENT_CREATED`, `PATIENT_UPDATED`, `PATIENT_FILE_DELETE`, `FOLDER_CREATED`, `FILE_UPLOADED`, `FILE_RENAMED`, `HOSPITAL_UPDATED`, `HOSPITAL_RESEND_WELCOME`, `CONTACT_CHANGE_RESEND`, `AUTH_CODE_RESEND`, `BIOMETRIC_REGISTERED`, `ORPHAN_CLEANUP`. New since TD-D2 (2026-04-25): `SESSION_IDLE_REVOKED` (emitted by `jobs/idleSweep.job.js`).

### AppVersion (`appversions`)

As previously documented. Managed via manual script `scripts/manage-app-version.js`.

### Sidecar collections

- `merged_pdf_cache`: `{ content_hash, size_bytes, tier_used, request_type, created_at, updated_at }`.
- `compression_audits`: one doc per request with input/output sizes, tier, duration, cache_hit, error_reason.

---

## 4. API Endpoints (Corrected)

**Total: 64 endpoints** (verified 2026-04-26 via `grep -E "^router\.(get|post|put|patch|delete)" backend/src/routes/*.js` + the 2 inline `/api/health*` routes in `index.js`). TD-030 removed 7 dead endpoints on 2026-04-25 (`/api/notifications/*` × 3, `/api/export/sample-cover`, `/api/export/archive`, `/api/patients/.../stream`, `/api/auth/login/resend-auth-code`). Corrections vs prior audit shown in **bold**. CLAUDE.md §7 was updated 2026-04-26 to match this figure.

### Auth — 24 endpoints ([routes/auth.routes.js](../../backend/src/routes/auth.routes.js))

| Method | Path                                   | Middleware                                                          | Auth                      |
| ------ | -------------------------------------- | ------------------------------------------------------------------- | ------------------------- |
| POST   | `/api/auth/register`                   | authLimiter, uploadSingle, validate                                 | public                    |
| POST   | `/api/auth/register/verify-otp`        | otpLimiter, validate                                                | public                    |
| POST   | `/api/auth/register/resend-otp`        | otpLimiter, validate                                                | public                    |
| POST   | `/api/auth/register-hospital`          | authLimiter, verifyAccessToken, verifyAdmin, uploadSingle, validate | admin                     |
| POST   | `/api/auth/login`                      | authLimiter, validate                                               | public                    |
| POST   | `/api/auth/change-password`            | authLimiter, custom temp-token, validate                            | tempToken PASSWORD_CHANGE |
| POST   | `/api/auth/login/verify-auth-code`     | otpLimiter, verifyTempToken, validate                               | tempToken AUTH_CODE       |
| POST   | `/api/auth/refresh-token`              | cookie parser                                                       | refresh cookie            |
| POST   | `/api/auth/logout`                     | cookie parser                                                       | refresh cookie            |
| POST   | `/api/auth/biometric/register`         | verifyAccessToken                                                   | access                    |
| POST   | `/api/auth/biometric/challenge`        | authLimiter                                                         | public                    |
| POST   | `/api/auth/biometric/verify`           | authLimiter                                                         | public                    |
| POST   | `/api/auth/session/check-conflict`     | authLimiter                                                         | public                    |
| GET    | `/api/auth/session/validate`           | verifyAccessToken                                                   | access                    |
| POST   | `/api/auth/session/force-logout`       | verifyAccessToken                                                   | access                    |
| GET    | `/api/auth/session/list`               | verifyAccessToken                                                   | access                    |
| POST   | `/api/auth/session/revoke/:id`         | verifyAccessToken                                                   | access                    |
| POST   | `/api/auth/session/revoke-all-others`  | verifyAccessToken                                                   | access                    |
| POST   | `/api/auth/session/reverify-auth-code` | otpLimiter, verifyAccessToken, validate                             | access                    |
| POST   | `/api/auth/forgot-password/init`       | authLimiter, validate                                               | public                    |
| POST   | `/api/auth/forgot-password/verify`     | otpLimiter, validate                                                | public                    |
| POST   | `/api/auth/forgot-password/reset`      | authLimiter, validate                                               | tempToken PASSWORD_RESET  |
| POST   | `/api/auth/password/change`            | authLimiter, verifyAccessToken, validate                            | access                    |
| POST   | `/api/auth/fcm-token`                  | verifyAccessToken, validate                                         | access                    |

### Patients — 20 endpoints (16 primary + 4 legacy) ([routes/patient.routes.js](../../backend/src/routes/patient.routes.js))

All routes require `verifyAccessToken + verifyHospitalActive`. Download routes additionally use `patientLimiter`.

| Method | Path                                                            | Notes                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/patients`                                                 | validate                                                                                                                                                                                                                                                                                                                                                                                                  |
| GET    | `/api/patients`                                                 | supports search + dual pagination. Params: `?limit` (default 20, cap 100), `?skip` (legacy offset mode), optional `?cursor=<base64url>` (new keyset mode using `createdAt+_id`). Response includes `{ patients, total, limit, skip, hasMore, nextCursor, cursor }`. If `cursor` is present and valid, keyset pagination is used; otherwise endpoint falls back to offset mode for backward compatibility. |
| GET    | `/api/patients/:patientId`                                      | validate                                                                                                                                                                                                                                                                                                                                                                                                  |
| PUT    | `/api/patients/:patientId`                                      | validate                                                                                                                                                                                                                                                                                                                                                                                                  |
| POST   | `/api/patients/:patientId/folders`                              |                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/api/patients/:patientId/files/:folderName`                    |                                                                                                                                                                                                                                                                                                                                                                                                           |
| POST   | `/api/patients/:patientId/files/:folderName`                    | uploadIdempotencyGuard + uploadDocument                                                                                                                                                                                                                                                                                                                                                                   |
| PATCH  | `/api/patients/:patientId/files/:folderName/:fileId/rename`     |                                                                                                                                                                                                                                                                                                                                                                                                           |
| DELETE | `/api/patients/:patientId/files/:folderName/:fileId`            |                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/api/patients/:patientId/files/:folderName/:fileId/signed-url` |                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/api/patients/:patientId/files/:folderName/:fileId/compressed` | via sidecar                                                                                                                                                                                                                                                                                                                                                                                               |
| GET    | `/api/patients/:patientId/download/zip/size-check`              | 413 if >100 MB                                                                                                                                                                                                                                                                                                                                                                                            |
| POST   | `/api/patients/:patientId/download/zip`                         | body `{ selectedFolders? }`                                                                                                                                                                                                                                                                                                                                                                               |
| POST   | `/api/patients/:patientId/download/pdf`                         | body `{ mode: "merged" \| "per-folder" }`                                                                                                                                                                                                                                                                                                                                                                 |
| GET    | `/api/patients/:patientId/folders/:folderName/download/pdf`     |                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/api/patients/:patientId/folders/:folderName/download/zip`     |                                                                                                                                                                                                                                                                                                                                                                                                           |
| GET    | `/api/patients/:patientId/download/pdf`                         | **legacy** alias                                                                                                                                                                                                                                                                                                                                                                                          |
| GET    | `/api/patients/:patientId/download/zip`                         | **legacy** alias                                                                                                                                                                                                                                                                                                                                                                                          |
| GET    | `/api/patients/:patientId/folders/:folderName/pdf`              | **legacy** alias                                                                                                                                                                                                                                                                                                                                                                                          |
| GET    | `/api/patients/:patientId/folders/:folderName/zip`              | **legacy** alias                                                                                                                                                                                                                                                                                                                                                                                          |

### Hospitals — 12 endpoints ([routes/hospitals.routes.js](../../backend/src/routes/hospitals.routes.js))

| Method   | Path                                          | Guard                                                                                                                                                                                                                                       |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET      | `/api/hospitals/me`                           | access                                                                                                                                                                                                                                      |
| PATCH    | `/api/hospitals/me`                           | access + uploadSingle                                                                                                                                                                                                                       |
| POST     | `/api/hospitals/me/change-contact/init`       | access + authLimiter                                                                                                                                                                                                                        |
| **POST** | **`/api/hospitals/me/change-contact/resend`** | access + otpLimiter (missing from prior audit)                                                                                                                                                                                              |
| POST     | `/api/hospitals/me/change-contact/verify`     | access + otpLimiter                                                                                                                                                                                                                         |
| GET      | `/api/hospitals/me/notification-preferences`  | access                                                                                                                                                                                                                                      |
| PUT      | `/api/hospitals/me/notification-preferences`  | access                                                                                                                                                                                                                                      |
| GET      | `/api/hospitals`                              | admin — 🛠️ now cursor-paginated with server-side search (TD-005). Params: `?limit` (default 50, cap 100), `?cursor=<_id>`, `?search=<string>`. First-page response includes `{ totals: { total, active, recentWeek }, nextCursor, limit }`. |
| GET      | `/api/hospitals/:id`                          | admin or self                                                                                                                                                                                                                               |
| PUT      | `/api/hospitals/:id`                          | admin or self + uploadSingle                                                                                                                                                                                                                |
| POST     | `/api/hospitals/:id/resend-welcome`           | admin                                                                                                                                                                                                                                       |
| DELETE   | `/api/hospitals/:id`                          | admin + authLimiter                                                                                                                                                                                                                         |

### Export — 1, Audit — 2, Admin — 2, Version — 1, Health — 2

**TD-030 (2026-04-25) — 7 endpoints removed:** `GET /api/export/sample-cover`, `POST /api/export/archive`, `GET /api/patients/:patientId/files/:folderName/:fileId/stream`, `POST /api/auth/login/resend-auth-code`, and the entire `/api/notifications` mount (`GET /sample`, `GET /preview`, `POST /test`). Remaining `export` surface: only `GET /api/export/patients/pdf`. See [routes/](../../backend/src/routes/) for exact lines.

---

## 5. Authentication & Authorization

### Login flow

Identical to prior audit: two-step (password → Auth Code), rate-limited (5/15m on login; 3/1m on verify), account lock after 5 failed attempts.

### Token types

| Token        | Payload                            | Secret               | TTL                                                                             | Storage (client)                              |
| ------------ | ---------------------------------- | -------------------- | ------------------------------------------------------------------------------- | --------------------------------------------- |
| accessToken  | `{ id, sessionId, type:"access" }` | JWT_SECRET           | 24h                                                                             | **module-scoped memory in `services/api.ts`** (web, TD-029, 2026-04-25) / Keystore (mobile)      |
| refreshToken | `{ id, type:"refresh" }`           | REFRESH_TOKEN_SECRET | 365d (`.env.example` pinned to 365d post-TD-004)                                | httpOnly cookie (web) / TokenManager (mobile) |
| tempToken    | `{ id, type:"temp", purpose }`     | JWT_SECRET           | 10m AUTH_CODE / 15m PASSWORD_RESET                                              | sessionStorage (web — short-lived, mid-flow)  |

🛠️ **Refresh IS now rotated** as of TD-002 (2026-04-21). [token.service.js `refreshAccessToken`](../../backend/src/services/token.service.js) issues a fresh refresh token on every call, persists it on the session doc, and returns `hospitalId` so [auth.controller.js `refreshToken`](../../backend/src/controllers/auth.controller.js) can overwrite the httpOnly cookie. Reuse detection: presenting a rotated-out token that still decodes calls `handlePossibleRefreshReuse` → revokes every active session for the hospital (`revokedReason: "REFRESH_TOKEN_REUSE"`) + sends a security email. Guarded against post-logout false positives by requiring at least one other active session before escalating. Unit coverage in [refreshToken.rotation.test.js](../../backend/src/__tests__/refreshToken.rotation.test.js).

### Middleware chain

| Middleware             | Sets                                  | Purpose                                                    |
| ---------------------- | ------------------------------------- | ---------------------------------------------------------- |
| `verifyAccessToken`    | `req.hospital.id`, `req.sessionId`    | JWT + session active + mobile 7-day Auth Code freshness    |
| `verifyHospitalActive` | `req.hospital`                        | enforces `isActive=true`, 401 `ACCOUNT_DISABLED` otherwise |
| `attachHospitalData`   | `req.hospital` full doc               | convenience                                                |
| `verifyAdmin`          | —                                     | requires `role === "admin"`                                |
| `verifyAdminOrSelf`    | `req.isSelf`                          | admin OR resource owner                                    |
| `verifyTempToken`      | `req.hospital.id`, `req.tokenPurpose` | purpose-matched temp token                                 |

### Mobile-specific rules

Single-device enforcement, 7-day Auth Code re-verify, biometric login — as documented in prior audit. Additionally: **on the 3rd mobile login across all devices for a hospital, the oldest session is evicted with reason `SESSION_CONFLICT`** (per CLAUDE.md §5).

### Server-side idle revoke (added 2026-04-25)

[jobs/idleSweep.job.js](../../backend/src/jobs/idleSweep.job.js) runs every 5 min and revokes sessions whose `lastSeenAt` is older than **60 min** with `revokedReason: "IDLE_TIMEOUT"` + emits a `SESSION_IDLE_REVOKED` audit row. **Mobile sessions (`isMobile: true`) are exempt** (commit `61fa6ad`) — backgrounded apps stop heartbeating and would log out staff between rounds; mobile security comes from the 7-day Auth Code re-verify + 3-device limit, not idle revoke. Threshold was 15 min initially but was lifted to 60 min for hospital workflow. Don't drop below 30 min without a heartbeat strategy on web.

### Real-client-IP behind Cloudflare (added 2026-04-25)

[utils/clientIp.js](../../backend/src/utils/clientIp.js) `getClientIp(req)` reads `CF-Connecting-IP` → `True-Client-IP` → `X-Forwarded-For[0]` → `req.ip` → `req.connection.remoteAddress`. Without it, geoip resolved to Cloudflare-edge IPs (e.g. Singapore PoP for India traffic). `middleware/auth.js` re-runs geoip when `lastSeenIp` changes (mobile WiFi↔cellular roaming); `lastSeenIp` is rendered alongside `ipAddress` on `/sessions`.

### JWT verification pinning (added 2026-04-25)

[utils/jwt.js](../../backend/src/utils/jwt.js) — both `jwt.verify` call sites pass `{ algorithms: ["HS256"] }` (TD-023, commit `09fae23`). Belt-and-braces against alg-confusion / RS256-swap attacks; `jsonwebtoken@9` already rejected `alg: none` by default but explicit pinning makes intent auditable.

### Password policy

8+ chars, upper + lower + digit + special; bcrypt cost 10.

### OTP flows

Registration / forgot-password / contact-change. 6-digit, 10-min TTL (env `OTP_EXPIRY_MINUTES`), default 3 attempts (env `MAX_OTP_ATTEMPTS` — defaults to `3` in `config/env.js:50`; `.env.example` ships `5` for ergonomic dev). Stored in Redis with hash; **production refuses to boot without Upstash credentials** (TD-019, commit `a1bd66e` — `redis.service.js:77-92`). Dev still falls back to an in-memory Map. The `/login/resend-auth-code` endpoint was removed in TD-030 (2026-04-25).

---

## 6. Business Logic

### Patient ID generation

`{INITIALS}-{000001}` per hospital. Atomic increment via `Hospital.findByIdAndUpdate({ $inc: { patientIdCounter: 1 } }, { new: true })` at [patient.service.js:22-26](../../backend/src/services/patient.service.js). ✓ No race.

### Auto-delete (daily 00:00 UTC)

`cron.schedule("0 0 * * *", ...)` in [autoDelete.job.js:12](../../backend/src/jobs/autoDelete.job.js) → `deleteOldPatients(90)` at [patient.service.js:442-490](../../backend/src/services/patient.service.js). Cascade deletes all Cloudinary files, emits one aggregate `AUTO_DELETE` audit row. **Hard delete.**

### Compression sidecar integration

Backend calls `POST {COMPRESSION_SERVICE_URL}/api/folder-download` or `/api/patient-download` with `X-Internal-Secret: $COMPRESSION_SERVICE_SECRET`. Errors 502 (fetch), 504 (timeout), 413 (size floor) fall back to local `pdf-lib` merge. Sidecar 300s hard timeout. **Sidecar is mandatory in prod (TD-D4, commit `173db5a`):** `config/env.js:127-133` throws on boot when `NODE_ENV=production` AND `USE_COMPRESSION_SERVICE !== "true"` (the in-process `pdf-lib` fallback OOMs at scale).

### Email dispatch

`mail.service.js` selects Brevo REST (prod, with retry x2) or Mailtrap SMTP (dev). Gated by `notificationPrefs`.

### Push dispatch

`push.service.js` (firebase-admin) sends to `hospital.fcmToken.token` if present and pref allows. Silent if token absent.

---

## 7. External Integrations — same as prior audit

Cloudinary, Brevo, Mailtrap, Firebase FCM, Upstash Redis (**prod refuses in-memory fallback** post-TD-019), Compression Sidecar (**prod-mandatory** post-TD-D4), GeoIP (**two-provider chain post-TD-027**: keyed `ipinfo.io` if `IPINFO_TOKEN` set → keyless `ip-api.com` fallback), R2/S3 (**configured but unused — dead code**, TD-003 still open).

---

## 8. Environment Variables

### 🛠️ Resolved 2026-04-21 (TD-004)

All 11 previously-missing vars are now in `.env.example`, and all 13 dead vars (TOTP × 5, SMS × 2, legacy SMTP × 6) have been removed. `REFRESH_TOKEN_EXPIRY` is pinned to `365d`. Current `.env.example` diffs zero against code `process.env.X` references.

### Live vars (re-verified 2026-04-26 against `process.env.X` references in `backend/src/`)

`NODE_ENV`, `PORT`, `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRY`, `REFRESH_TOKEN_SECRET`, `REFRESH_TOKEN_EXPIRY` (365d), `OTP_EXPIRY_MINUTES`, `OTP_LENGTH`, `MAX_OTP_ATTEMPTS`, `BREVO_API_KEY`, `BREVO_SENDER_EMAIL`, `BREVO_SENDER_NAME`, `MAILTRAP_*` (4), `SMTP_*` (6 — legacy fallback, kept), `CLOUDINARY_*` (3), `SIGNED_UPLOADS_ENABLED`, `UPSTASH_REDIS_*` (2 — **mandatory in prod** post-TD-019), `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_SERVICE_ACCOUNT_PATH`, `USE_COMPRESSION_SERVICE` (**must be `true` in prod** per TD-D4), `COMPRESSION_SERVICE_URL`, `COMPRESSION_SERVICE_SECRET`, `TRUST_PROXY_HOPS` (default 2 — must be a specific integer, `true` is rejected by `express-rate-limit`), `IPINFO_TOKEN` (optional; activates the keyed primary geoip provider), `GEOIP_DEV_OVERRIDE_IP` (dev-only override for localhost lookups), `LOG_LEVEL`, `LOG_PRETTY`, `R2_*` (4 — currently unused; TD-003), `USE_LOCAL_STORAGE`, `LOCAL_STORAGE_PATH`, `FRONTEND_URL`, `RATE_LIMIT_WINDOW_MS`, `RATE_LIMIT_MAX_REQUESTS`.

### Compression sidecar

`MONGO_URI` (DB name auto-appended if missing — `config.py:33`), `INTERNAL_API_SECRET`, `CLOUDINARY_*`, `PORT`.

---

## 9. Compression Sidecar — see diagram #9 in `03-architecture-diagrams.md`

Endpoints: `GET /api/health`, `POST /api/folder-download`, `POST /api/patient-download`. All protected by `X-Internal-Secret` HMAC-safe compare. 300s pipeline timeout (`asyncio.wait_for`), 60s per source fetch, 10s HEAD for cache check. Signed URLs expire in 300s.

**~~Known gotcha~~ — RESOLVED 2026-04-21 (TD-014, commit `73b2ea2`):** timeout error body now reads `"Pipeline exceeded 300s limit"` at `folder.py:285`, `patient.py:301`, `schemas.py:73`.

**Cache key:** `SHA256(sorted public_ids + uploaded_at + target_mb)`. Means re-upload of same content with new timestamp invalidates the cache.

---

## 10. Known Gotchas (expanded)

(All from prior audit plus items surfaced in this re-audit.)

1. 7-day mobile Auth Code re-verify.
2. Single-device mobile enforcement (3rd device evicts oldest).
3. 365-day refresh tokens — 🛠️ **now rotated on every refresh** (TD-002). Replay of a rotated-out token revokes all active sessions + sends a security email.
4. 🛠️ ~~Silent in-memory Redis fallback~~ — TD-019 (2026-04-25): prod refuses to boot without Upstash creds; dev still falls back loudly.
5. Auto-generated immutable authCode (with undocumented pre-save hook).
6. bcrypt for passwords (`bcryptjs ^3.0.3`); SHA256 used for OTP hash compare.
7. Sidecar synchronous call with 300s timeout + shared secret. **Sidecar mandatory in prod** (TD-D4).
8. Hard-delete of patients at day 90.
9. Brevo REST in prod, Mailtrap SMTP in dev — 🛠️ ~~`@getbrevo/brevo` SDK installed but unused~~ removed in TD-012.
10. Audit writes are fire-and-forget — never block.
11. 🛠️ ~~300s compression hard limit (but error message wrong — says 100s)~~ — fixed in TD-014.
12. No automatic Cloudinary orphan cleanup; admin endpoint required.
13. Folder names slugified for Cloudinary path irreversibly.
14. `scripts/manage-app-version.js` must be manually run to update version records.
15. 🛠️ ~~Audit logging is inconsistent~~ — TD-001 shipped 2026-04-21; every mutation endpoint emits `logAudit()`.
16. Session `location` sub-document populated fire-and-forget during login. Failures are silently swallowed (fine by design).
17. **`r2.service.js` is still a ~260-line dead file with two heavy deps.** TD-003 — open as of 2026-04-26.
18. **NEW (2026-04-25):** Idle-sweep job (`jobs/idleSweep.job.js`) revokes web sessions idle >60 min. Mobile is exempt — don't reduce the threshold below 30 min without a heartbeat strategy.
19. **NEW (2026-04-25):** Always call `getClientIp(req)` (not `req.ip`) for any IP captured for audit/session/email. Render is behind Cloudflare; raw `req.ip` resolves to a Cloudflare PoP.
20. **NEW (2026-04-21):** All `console.*` migrated to pino (TD-007); use `req.log.*` inside handlers, module-level `logger` elsewhere. `backend/scripts/` intentionally still uses raw `console.*`.

---

## 11. Endpoint Count Summary

Verified 2026-04-26 against `backend/src/routes/*.js` + `backend/src/index.js`.

| Group         | Count                      |
| ------------- | -------------------------- |
| auth          | 24                         |
| patients      | 20 (16 primary + 4 legacy) |
| hospitals     | 12                         |
| export        | 1                          |
| audit         | 2                          |
| admin         | 2                          |
| version       | 1                          |
| ~~notifications~~ | 0 (TD-030 removed mount)  |
| health        | 2                          |
| **Total**     | **64**                     |

---

## 12. Test Coverage

**Backend:** 1 test file — [**tests**/auth.controller.test.js](../../backend/src/__tests__/auth.controller.test.js). No integration tests of session flow, patient CRUD, export, compression, or admin force-delete.

**Sidecar:** No tests in `compression-service/`.

See `04-enhancements.md` §5.5 for the top-10 critical untested paths.

---

**Report Refreshed:** 2026-04-21
**Audit Completeness:** Endpoints verified one-to-one against `backend/src/routes/`. Models verified field-by-field. Every factual claim carries a `path:line` citation either here or in `00-drift.md`.
