# Architecture Diagrams — Hospital Management System

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21

Every diagram below is derived from the actual code, not from the prose audit docs. Each section cites the source-of-truth files from which the diagram was generated.

---

## 1. System Context

Shows the trust boundaries and which clients/services talk to which external dependency. The backend is the only service with direct Mongo/Redis access; the Python sidecar shares Mongo read/write for cache + audit tables.

```mermaid
flowchart LR
  Web["React Web (Vite)"]
  Mobile["Android App (Kotlin)"]
  Backend["Node backend<br/>Express + Mongoose"]
  Sidecar["Python sidecar<br/>FastAPI"]
  Mongo[("MongoDB<br/>hospital-management DB")]
  Redis[("Upstash Redis<br/>OTP + biometric nonces")]
  Cloud["Cloudinary<br/>file storage + signed URLs"]
  Brevo["Brevo REST<br/>prod email"]
  Mailtrap["Mailtrap SMTP<br/>dev email"]
  FCM["Firebase FCM<br/>push"]
  GeoIP["ip-api.com<br/>45 req/min"]

  Web -- "HTTPS JSON<br/>(httpOnly refresh cookie)" --> Backend
  Mobile -- "HTTPS JSON<br/>Bearer access token" --> Backend
  Backend -- "Mongoose driver" --> Mongo
  Backend -- "REST (@upstash/redis)" --> Redis
  Backend -- "SDK upload/delete" --> Cloud
  Backend -- "REST API" --> Brevo
  Backend -- "SMTP dev only" --> Mailtrap
  Backend -- "firebase-admin SDK" --> FCM
  Backend -- "fetch (24h cache)" --> GeoIP
  Backend -- "POST X-Internal-Secret" --> Sidecar
  Sidecar -- "Motor async driver" --> Mongo
  Sidecar -- "SDK upload" --> Cloud
  Web -- "signed URL / iframe preview" --> Cloud
  Mobile -- "download/upload" --> Cloud
```

**Source of truth:** [backend/src/index.js](../../backend/src/index.js), [backend/src/services/](../../backend/src/services/), [compression-service/app/main.py](../../compression-service/app/main.py).

---

## 2. MongoDB ER Diagram

Five collections in the main `hospital-management` DB plus two shared with the Python sidecar. Most relationships are soft (hospitalId is a string FK in embedded docs).

```mermaid
erDiagram
  HOSPITAL ||--o{ PATIENT : "1:N via hospitalId"
  HOSPITAL ||--o{ SESSION : "1:N via hospitalId"
  HOSPITAL ||--o{ AUDITLOG : "1:N via userId (optional)"
  HOSPITAL ||--o{ BIOMETRIC_KEY : "1:N embedded"
  PATIENT ||--o{ FOLDER : "1:N embedded"
  FOLDER ||--o{ FILE : "1:N embedded"
  SESSION ||--|| LOCATION : "1:1 embedded (geoip)"

  HOSPITAL {
    ObjectId _id PK
    string hospitalName "required, >=3 chars"
    string email UK "unique lowercase"
    string phone UK "unique E.164"
    string authCode UK "immutable 6-digit"
    string passwordHash "bcrypt(10)"
    enum role "admin | hospital"
    bool isActive "default true"
    int failedLoginAttempts "default 0"
    Date lockUntil "optional"
    string logoUrl
    bool mustChangePassword "default false"
    int patientIdCounter "default 0; atomic $inc"
    object fcmToken "token + updatedAt"
    array biometricKeys "embedded"
    object notificationPrefs "nested"
    Date createdAt
    Date updatedAt
  }
  PATIENT {
    ObjectId _id PK
    ObjectId hospitalId FK
    string patientId "SH-000001 etc; unique per hospital"
    string patientName
    string remarks "max 500"
    array folders "embedded default 10"
    Date createdAt "indexed for auto-delete"
    Date updatedAt
  }
  FOLDER {
    string name
    array files "embedded"
    Date createdAt
  }
  FILE {
    string fileName
    string fileUrl "Cloudinary URL"
    int size
    string mimeType
    string cloudinaryPublicId "stripped from JSON"
    string thumbnailUrl "images only 120x120"
    enum resourceType "image | raw | video | auto"
    enum accessMode "public | signed"
    Date uploadedAt
  }
  SESSION {
    ObjectId _id PK
    ObjectId hospitalId FK
    string refreshToken UK
    string deviceId "SHA256 of UA"
    string ipAddress
    string userAgent
    Date expiresAt "TTL index"
    bool isActive "default true"
    bool isMobile "default false"
    enum platform "web | android | ios"
    Date lastSeenAt
    string lastSeenIp
    string revokedReason "USER_LOGOUT | ADMIN_REVOKE | SESSION_CONFLICT | ALL_OTHERS | ACCOUNT_DISABLED"
    Date lastAccessedAt
    Date authCodeVerifiedAt "mobile 7-day check"
  }
  LOCATION {
    string city
    string region
    string country
    string countryCode
    bool isPrivate
    string displayName
  }
  AUDITLOG {
    ObjectId _id PK
    ObjectId userId FK "nullable"
    string action "enum 40+"
    enum status "SUCCESS | FAILURE"
    string ipAddress
    string userAgent
    mixed details
    object metadata
    Date createdAt
  }
  APPVERSION {
    ObjectId _id PK
    enum platform "android | ios"
    string minVersion
    string latestVersion
    bool forceUpdate "default false"
    string updateUrl
    string releaseNotes
  }
  MERGED_PDF_CACHE {
    string content_hash PK "SHA256 of sources+target"
    int size_bytes
    int tier_used "-1 cache | 0..4"
    enum request_type "folder | patient"
    Date created_at
    Date updated_at
  }
```

**Source of truth:** [backend/src/models/Hospital.js](../../backend/src/models/Hospital.js), [Patient.js](../../backend/src/models/Patient.js), [Session.js](../../backend/src/models/Session.js), [AuditLog.js](../../backend/src/models/AuditLog.js), [AppVersion.js](../../backend/src/models/AppVersion.js), [compression-service/app/merged_cache.py](../../compression-service/app/merged_cache.py).

---

## 3. Backend Layered Architecture (Example: Login Flow)

Canonical request lifecycle from router through middleware, controller, service, and model layers. Drawn for the POST `/api/auth/login` path.

```mermaid
flowchart LR
  Req[HTTP POST /api/auth/login] --> Route[auth.routes.js]
  Route -->|authLimiter| MW1[rateLimiter.js]
  MW1 -->|validateRequest| MW2[express-validator chain]
  MW2 --> Ctrl[auth.controller.js :: login]
  Ctrl -->|findOne email| Model1[(Hospital model)]
  Ctrl -->|matchPassword| Util1[bcryptjs]
  Ctrl -->|generateTempToken| Svc1[token.service.js]
  Svc1 --> Util2[jwt.js sign]
  Ctrl -->|logAudit fire-and-forget| Model2[(AuditLog)]
  Ctrl -->|optional send| Svc2[push.service.js]
  Ctrl --> Resp[200 tempToken OR 423 locked]
```

**Source of truth:** [backend/src/routes/auth.routes.js:176](../../backend/src/routes/auth.routes.js), [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js), [backend/src/services/token.service.js](../../backend/src/services/token.service.js).

---

## 4. Frontend Route Tree

Routes grouped by guard. Routes inside `MainLayout` inherit the shared navbar + padding; standalone routes own their chrome.

```mermaid
flowchart TB
  Root["BrowserRouter"]
  Root --> Public["Public routes (no guard, no MainLayout)"]
  Root --> Outside["Standalone auth flows (no guard, no MainLayout)"]
  Root --> AdminOnly["AdminRoute (no MainLayout)"]
  Root --> Shell["ProtectedRoute → MainLayout"]
  Root --> CatchAll["* → NotFound"]

  Public --> P1["/ LandingPage"]
  Public --> P2["/terms Terms"]
  Public --> P3["/privacy Privacy"]
  Public --> P4["/components-preview ComponentsPreview"]
  Public --> P5["/spinners-preview LoadingSpinners"]

  Outside --> O1["/login Login"]
  Outside --> O2["/verify-auth-code VerifyAuthCode"]
  Outside --> O3["/change-password ChangePassword"]
  Outside --> O4["/forgot-password ForgotPassword"]

  AdminOnly --> A1["/register HospitalRegistration"]

  Shell --> S1["/dashboard Dashboard"]
  Shell --> S2["/profile Profile"]
  Shell --> S3["/password Password"]
  Shell --> S4["/sessions Sessions"]
  Shell --> S5["/notifications NotificationSettings"]
  Shell --> S6["/security → Navigate /sessions"]
  Shell --> S7["/patients/:id PatientDetails"]
  Shell --> S8["/patients/:id/folders/:name FolderView"]
  Shell --> S9["Nested AdminRoute"]
  S9 --> S9a["/hospitals HospitalsList"]
  S9 --> S9b["/activity ActivityLog"]
```

**Source of truth:** [frontend/src/routes/AppRoutes.tsx](../../frontend/src/routes/AppRoutes.tsx).

---

## 5. Auth State Machine

All states a hospital account can be in, driven by endpoints. Biometric verify resets the 7-day mobile clock back to `Authenticated`.

```mermaid
stateDiagram-v2
  [*] --> LoggedOut
  LoggedOut --> AwaitingAuthCode : POST /auth/login (success, mustChangePassword=false)
  LoggedOut --> MustChangePassword : POST /auth/login (mustChangePassword=true)
  LoggedOut --> AwaitingPasswordReset : POST /auth/forgot-password/verify
  LoggedOut --> Locked : 5 failed attempts (423)
  Locked --> LoggedOut : lockUntil expired OR admin reset
  MustChangePassword --> AwaitingAuthCode : POST /auth/change-password
  AwaitingAuthCode --> Authenticated : POST /auth/login/verify-auth-code
  AwaitingPasswordReset --> LoggedOut : POST /auth/forgot-password/reset
  Authenticated --> Authenticated : POST /auth/refresh-token
  Authenticated --> AuthCodeStaleMobile : 7 days elapsed (mobile only)
  AuthCodeStaleMobile --> Authenticated : POST /auth/session/reverify-auth-code
  AuthCodeStaleMobile --> Authenticated : biometric verify
  Authenticated --> LoggedOut : POST /auth/logout
  Authenticated --> SessionConflict : second mobile login on same deviceId
  SessionConflict --> LoggedOut : session revoked (email sent)
  Authenticated --> AccountDisabled : admin toggles isActive=false
  AccountDisabled --> LoggedOut : next request returns 401 reason=ACCOUNT_DISABLED
```

**Source of truth:** [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js), [backend/src/middleware/auth.js](../../backend/src/middleware/auth.js).

---

## 6. Login Sequence (Web + Mobile)

Two-step login. Mobile path enforces the 7-day Auth Code re-verify on subsequent requests; web path does not.

```mermaid
sequenceDiagram
  participant C as Client (Web/Mobile)
  participant API as Backend /api/auth
  participant H as Hospital model
  participant S as Session model
  participant R as Redis/Upstash
  participant E as Brevo/Mailtrap
  participant A as AuditLog

  C->>API: POST /login { identifier, password }
  API->>H: findOne(email or phone)
  H-->>API: hospital doc
  API->>API: bcrypt compare
  alt invalid
    API->>A: LOGIN_FAILED (fire-forget)
    API-->>C: 401 / 423 if locked
  else valid
    API->>A: LOGIN_ATTEMPT → LOGIN_SUCCESS
    API->>API: generate tempToken (purpose=AUTH_CODE, 10m)
    alt mustChangePassword
      API-->>C: { requirePasswordChange: true, tempToken }
    else normal
      API-->>C: { tempToken, requireAuthCode: true }
    end
  end
  C->>API: POST /login/verify-auth-code { authCode } Bearer tempToken
  API->>H: compare authCode (immutable)
  API->>S: create Session(hospitalId, deviceId=SHA256(UA), platform, authCodeVerifiedAt=now)
  S-->>API: session._id
  API->>API: sign accessToken (24h) + refreshToken (365d)
  API->>E: sendNewLoginAlert (if notificationPrefs.newLoginAlert)
  API-->>C: { accessToken, refreshToken (httpOnly cookie) }
  Note over S: mobile: if 3rd device, evict oldest with SESSION_CONFLICT
```

**Source of truth:** [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js), [backend/src/services/token.service.js](../../backend/src/services/token.service.js).

---

## 7. Token Refresh Interceptor (Frontend)

Frontend Axios handles 401s by serialising refresh attempts behind a mutex so parallel in-flight requests don't trigger multiple refreshes.

```mermaid
sequenceDiagram
  participant UI as React component
  participant AX as axios client
  participant Q as refresh subscriber queue
  participant API as backend /auth/refresh-token

  UI->>AX: GET /patients (expired accessToken)
  AX->>API: request + old token
  API-->>AX: 401
  alt refreshInProgress == false
    AX->>AX: set refreshInProgress = true
    AX->>API: POST /auth/refresh-token (httpOnly cookie)
    alt refresh success
      API-->>AX: { accessToken }
      AX->>Q: resolve all subscribers with new token
      AX->>AX: retry original + queued requests
      AX-->>UI: original 200 response
    else refresh failure (401 or ACCOUNT_DISABLED)
      AX->>AX: clear sessionStorage
      AX->>UI: redirect /login
    end
    AX->>AX: set refreshInProgress = false
  else refreshInProgress == true
    AX->>Q: push { resolve, reject }
    Note over AX,Q: wait for refresh to finish
    Q-->>AX: new token fires subscribers
    AX-->>UI: retry → 200
  end
```

**Source of truth:** [frontend/src/services/api.ts](../../frontend/src/services/api.ts).

---

## 8. File Upload Pipeline (Mobile)

Multer streams into Cloudinary; the controller updates the embedded `folders[].files[]` array and fires an audit write (currently MISSING per §00-drift §10).

```mermaid
sequenceDiagram
  participant M as Android app
  participant API as backend
  participant IG as uploadIdempotencyGuard
  participant MU as multer-storage-cloudinary
  participant CL as Cloudinary
  participant PT as Patient model
  participant A as AuditLog

  M->>API: POST /patients/:id/files/:folder<br/>multipart + Idempotency-Key
  API->>IG: verify key not seen (Redis)
  IG-->>API: ok OR replay → 200 cached response
  API->>MU: parse body
  MU->>CL: upload stream (public_id=HospitALL/h_X/p_Y/slug/YYYYMMDD_hash)
  CL-->>MU: fileUrl + publicId + thumbnailUrl
  MU-->>API: req.file
  API->>PT: findOneAndUpdate { _id, hospitalId } $push folders.$.files
  PT-->>API: updated patient
  API-->>M: { file }
  Note right of A: GAP — uploadFile does NOT log to AuditLog today (see 00-drift §10)
```

**Source of truth:** [backend/src/routes/patient.routes.js:115-120](../../backend/src/routes/patient.routes.js), [backend/src/middleware/upload.js](../../backend/src/middleware/upload.js), [backend/src/controllers/patient.controller.js](../../backend/src/controllers/patient.controller.js).

---

## 9. Compression Sidecar Pipeline

The sidecar handles cache short-circuit first, then runs the tier ladder. Timeouts and error branches shown explicitly.

```mermaid
flowchart TD
  In["POST /api/folder-download or /api/patient-download<br/>X-Internal-Secret"] --> Auth{"HMAC secret valid?"}
  Auth -->|no| Reject["401 auth_rejected"]
  Auth -->|yes| Hash["compute content_hash = SHA256(sorted public_ids + uploaded_at + target_mb)"]
  Hash --> CacheHead["HEAD merged_pdf_cache URL on Cloudinary"]
  CacheHead -->|200| Meta["get_meta(content_hash) from Mongo"]
  Meta -->|found| Audit1["audit cache_hit=true"] --> Out1["200 merged_url + tier_used"]
  Meta -->|missing| CloudinaryFB["Cloudinary Admin API resource() fallback (tier_used=-1)"] --> Audit1
  CacheHead -->|404| Pipe["pipeline (asyncio.wait_for timeout=300s)"]
  Pipe --> Fetch["fetch source PDFs (60s each, parallel)"]
  Fetch -->|HTTPError| Err502["502 source_fetch_failed"]
  Fetch --> Classify["classify: DIGITAL if 80% pages have ≥200 text chars else SCANNED"]
  Classify --> Cover["optional fpdf2 cover page"]
  Cover --> Merge["pikepdf merge"]
  Merge --> Branch{"digital?"}
  Branch -->|yes| T0["Tier 0 pikepdf: compress_streams"]
  T0 --> Upload
  Branch -->|no| Ladder["Tier 1→2→3→4 (ghostscript dpi 300/150/100/72/36 + grayscale from T3)"]
  Ladder -->|fits| Upload["cloudinary.uploader.upload"]
  Ladder -->|all exceed target| Err413["413 size_floor_breached"]
  Pipe -->|elapsed > 300s| Err504["504 processing_timeout"]
  Upload --> Meta2["upsert merged_pdf_cache"]
  Meta2 --> Audit2["audit cache_hit=false"]
  Audit2 --> Out2["200 merged_url + tier_used"]
```

**Source of truth:** [compression-service/app/endpoints/folder.py](../../compression-service/app/endpoints/folder.py), [tier_ladder.py](../../compression-service/app/compression/tier_ladder.py), [cloudinary_client.py](../../compression-service/app/cloudinary_client.py), [merged_cache.py](../../compression-service/app/merged_cache.py).

---

## 10. Patient Download Orchestration

Node's `patient.controller.js` branches between ZIP vs PDF, merged vs per-folder, sidecar vs local, and emits streaming responses.

```mermaid
flowchart TD
  Req["GET /download/zip/size-check OR POST /download/zip|pdf"] --> Auth[verifyAccessToken + verifyHospitalActive + patientLimiter]
  Auth --> Branch{which}
  Branch -->|zip/size-check| SZ["sum folder.files.size"]
  SZ -->|"> 100 MB hard"| ZipBlock["413 ZIP_TOO_LARGE"]
  SZ -->|"<= 100 MB"| SZOut["200 { totalSize, folders }"]
  Branch -->|POST zip| ZipGate{"size gate"}
  ZipGate -->|ok| Archive["archiver .zip stream"]
  Archive --> ZipOut["200 application/zip"]
  Branch -->|POST pdf mode=merged| Sidecar{"USE_COMPRESSION_SERVICE?"}
  Sidecar -->|yes| Proxy["POST /api/patient-download to sidecar with X-Internal-Secret"]
  Proxy -->|200| Stream["302 redirect OR proxy stream merged_url"]
  Proxy -->|502/504/413| Fallback["local pdf-lib merge"]
  Sidecar -->|no| Fallback
  Fallback --> PDFOut["200 application/pdf"]
  Branch -->|POST pdf mode=per-folder| PerF["for each folder: build PDF"] --> ZipPerF["archiver wrap PDFs"]
  ZipPerF --> ZipOut
```

**Source of truth:** [backend/src/controllers/patient.controller.js](../../backend/src/controllers/patient.controller.js), [backend/src/services/compression.service.js](../../backend/src/services/compression.service.js), [backend/src/services/zip.service.js](../../backend/src/services/zip.service.js), [backend/src/services/pdf.service.js](../../backend/src/services/pdf.service.js).

---

## 11. Auto-Delete Cron Flow

Nightly job; hard delete with cascade to Cloudinary, audit-logged once with aggregate counts.

```mermaid
flowchart TD
  Cron["node-cron schedule '0 0 * * *' (UTC)"] --> Q["Patient.find({ createdAt < now - 90d })"]
  Q --> For["for each patient"]
  For --> Files["for each folder.files"]
  Files --> Del["deleteFile(cloudinaryPublicId) ← Cloudinary SDK"]
  Del --> Rm["Patient.deleteOne(_id)"]
  Rm --> Tally["increment counters"]
  Tally -->|more| For
  Tally -->|done| OK["AuditLog.create action=AUTO_DELETE status=SUCCESS details={ deletedPatients, deletedFiles }"]
  Q -->|throws| Err["AuditLog.create action=AUTO_DELETE status=FAILURE details={ error }"]
```

**Source of truth:** [backend/src/jobs/autoDelete.job.js](../../backend/src/jobs/autoDelete.job.js), [backend/src/services/patient.service.js:442-490](../../backend/src/services/patient.service.js).

---

## 12. Session Lifecycle

States plus revocation reasons. TTL index on `expiresAt` auto-prunes expired docs; `cleanupExpiredSessions()` is dead code (see dead-code §D).

```mermaid
stateDiagram-v2
  [*] --> Active : createSession on login / biometric
  Active --> Active : refresh (lastAccessedAt++)
  Active --> AuthCodeStale : 7d elapsed (mobile only)
  AuthCodeStale --> Active : reverify-auth-code OR biometric
  Active --> Revoked_User : user POST /logout
  Active --> Revoked_Admin : admin toggles isActive / force-delete
  Active --> Revoked_Conflict : 3rd mobile device login (SESSION_CONFLICT)
  Active --> Revoked_AllOthers : user POST /revoke-all-others
  Active --> Revoked_Disabled : account isActive=false
  Revoked_User --> Expired : expiresAt reached → TTL delete
  Revoked_Admin --> Expired
  Revoked_Conflict --> Expired
  Revoked_AllOthers --> Expired
  Revoked_Disabled --> Expired
  Active --> Expired : refreshToken expires at 365d
  Expired --> [*]
```

**Source of truth:** [backend/src/models/Session.js](../../backend/src/models/Session.js), [backend/src/services/token.service.js](../../backend/src/services/token.service.js), [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js).

---

## 13. Notification Dispatch Decision Tree

Both channels gated by `notificationPrefs`; FCM only fires if `hospital.fcmToken.token` is set.

```mermaid
flowchart TD
  Evt["Event: NEW_LOGIN | PASSWORD_CHANGED | SESSION_REVOKED | ACCOUNT_LOCKED | ACCOUNT_DISABLED"] --> Load["load Hospital + notificationPrefs"]
  Load --> Email{"email gating"}
  Email -->|NEW_LOGIN & newLoginAlert| E1
  Email -->|SECURITY & securityAlerts| E1
  Email -->|always-on: locked/disabled/OTP| E1
  E1{"NODE_ENV prod?"} -->|yes| Brevo["Brevo REST with retry x2"]
  E1 -->|no| Mailtrap["Mailtrap SMTP"]
  Load --> Push{"push gating"}
  Push -->|fcmToken.token present| Pg{"pref match?"}
  Pg -->|yes| FCM["firebase-admin send"]
  Pg -->|no| Skip
  Push -->|no token| Skip["no push"]
  FCM --> Audit["AuditLog not written for push (logged inline)"]
  Brevo --> Audit
  Mailtrap --> Audit
```

**Source of truth:** [backend/src/services/mail.service.js](../../backend/src/services/mail.service.js), [backend/src/services/push.service.js](../../backend/src/services/push.service.js), [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js).

---

## 14. Forgot Password Flow

Three-step flow with explicit "always return 200" on step 1 to prevent account enumeration.

```mermaid
sequenceDiagram
  participant C as Client
  participant API as /auth/forgot-password
  participant H as Hospital
  participant R as Redis
  participant M as Mailer
  participant A as AuditLog

  C->>API: POST /init { identifier }
  API->>H: findOne(email/phone)
  alt found
    API->>R: SET otp:{email} = { hash, attempts:0 } TTL 10m
    API->>M: sendOTPEmail (Brevo or Mailtrap)
    API->>A: PASSWORD_RESET_INIT SUCCESS
  else not found
    API->>A: PASSWORD_RESET_INIT SUCCESS (no leak)
  end
  API-->>C: 200 generic { success: true }

  C->>API: POST /verify { identifier, otp }
  API->>R: GET otp:{email}
  alt match
    API->>R: DEL otp:{email}
    API->>API: tempToken purpose=PASSWORD_RESET (15m)
    API-->>C: 200 { tempToken }
    API->>A: PASSWORD_RESET_VERIFIED SUCCESS
  else mismatch or max attempts (5)
    API-->>C: 401 invalid or exhausted
    API->>A: PASSWORD_RESET_VERIFIED FAILURE
  end

  C->>API: POST /reset { newPassword } Bearer tempToken
  API->>API: bcrypt hash
  API->>H: update passwordHash, clear mustChangePassword
  API->>M: sendPasswordChangedEmail
  API->>A: PASSWORD_RESET_COMPLETED
  API-->>C: 200
```

**Source of truth:** [backend/src/controllers/auth.controller.js](../../backend/src/controllers/auth.controller.js) (forgot-password group), [backend/src/services/mail.service.js](../../backend/src/services/mail.service.js).

---

## 15. MainLayout Component Hierarchy

Composition inside the shell, including where portaled modals attach (body root, not layout).

```mermaid
flowchart TB
  Body["document.body"]
  App["App.tsx"] --> EB["ErrorBoundary"]
  EB --> NS["NetworkStatusProvider"]
  NS --> Auth["AuthProvider"]
  Auth --> Router["BrowserRouter"]
  Router --> ML["MainLayout (protected)"]
  ML --> NB["Navbar fixed z-50"]
  NB --> LC["LeftCluster: Logo + HospitALL wordmark → /dashboard"]
  NB --> CN["CenterNav: Dashboard (always), Hospitals (admin-gated)"]
  NB --> RC["RightCluster"]
  RC --> Chip["HospitalChip + online dot → HospitalProfileModal"]
  RC --> Gear["settings gear → Menu (Account / Security / Sign out)"]
  RC --> Av["Avatar → HospitalProfileModal"]
  ML --> NSB["NetworkStatusBanner"]
  ML --> Main["Outlet / Page"]
  Main -.portal z-[100].-> Body
  NB -.logout modal portal.-> Body
```

**Source of truth:** [frontend/src/layouts/MainLayout.tsx](../../frontend/src/layouts/MainLayout.tsx), [frontend/src/components/Navbar.tsx](../../frontend/src/components/Navbar.tsx).

---

## 16. Service Dependency Graph (High-Coupling Services)

Services imported by 3+ controllers are highlighted; they're the natural bus-factor hotspots.

```mermaid
flowchart LR
  auth["auth.controller"] --> token["token.service"]
  auth --> mail["mail.service"]
  auth --> push["push.service"]
  auth --> redis["redis.service"]
  auth --> storage["storage.service"]
  auth --> geoip["geoip.service"]
  patient["patient.controller"] --> patientSvc["patient.service"]
  patient --> storage
  patient --> compression["compression.service"]
  patient --> zip["zip.service"]
  patient --> pdf["pdf.service"]
  hospital["hospitals.controller"] --> mail
  hospital --> redis
  hospital --> storage
  export["export.controller"] --> pdf
  export --> zip
  export --> compression
  admin["admin.controller"] --> storage
  notifications["notifications.controller"] --> push
  subgraph hot["High-fanin services"]
    mail
    storage
    push
  end
```

**Source of truth:** [backend/src/controllers/](../../backend/src/controllers/) + [backend/src/services/](../../backend/src/services/) — grep of `import ... from`.

---

## 17. Patient ID Generation

Atomic `$inc` via `findByIdAndUpdate` guarantees serialisation. Initials come from hospital name.

```mermaid
flowchart TD
  Call["POST /api/patients { patientName, remarks? }"] --> HospAtomic["Hospital.findByIdAndUpdate(hospitalId, $inc: patientIdCounter 1, new:true)"]
  HospAtomic --> H[("hospital with new counter")]
  H --> Init["hospital.getInitials()"]
  Init --> Multi{"name has space?"}
  Multi -->|yes| TwoW["first-letter-of-first-two-words → e.g. SH"]
  Multi -->|no| OneW["first-two-letters-uppercase → e.g. AP"]
  TwoW --> Fmt
  OneW --> Fmt["sprintf(INITIALS-%06d, counter) → SH-000001"]
  Fmt --> Ins["Patient.create hospitalId, patientId, default folders"]
  Ins --> OK["201 { patient }"]
  Ins -.compound unique index collision.-> Retry["retry (rare) or surface 409"]
```

**Source of truth:** [backend/src/services/patient.service.js:22-26](../../backend/src/services/patient.service.js), [backend/src/models/Hospital.js](../../backend/src/models/Hospital.js) (getInitials method).

---

*17 diagrams, all derived from live code. Proceed to `04-enhancements.md` for the findings feed.*
