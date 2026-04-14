# Hospital Management System

A full-stack, multi-tenant hospital management platform with a Node.js/Express backend, React frontend, and native Android app. Built for secure patient record management with enterprise-grade authentication, TOTP 2FA, and Cloudflare R2 file storage.

---

## System Architecture

```mermaid
graph TB
    subgraph Clients
        WEB[React Web App<br/>Vite + Tailwind]
        ANDROID[Android App<br/>Kotlin + MVVM]
    end

    subgraph Infrastructure
        NGINX[Nginx Reverse Proxy<br/>Port 80]
        API[Express.js API<br/>Port 5000]
        MONGO[(MongoDB 7<br/>Port 27017)]
        REDIS[(Redis 7<br/>Port 6379)]
        R2[Cloudflare R2<br/>Object Storage]
        SMTP[SMTP Server<br/>Email Delivery]
    end

    WEB -->|HTTP/S| NGINX
    NGINX -->|/api/*| API
    NGINX -->|Static Assets| WEB
    ANDROID -->|HTTPS + Cert Pinning| API
    API --> MONGO
    API --> REDIS
    API --> R2
    API --> SMTP
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client (Web/Android)
    participant S as Backend API
    participant DB as MongoDB
    participant R as Redis

    U->>C: Enter email/phone + password
    C->>S: POST /api/auth/login
    S->>DB: Verify credentials
    S->>DB: Check TOTP status

    alt TOTP Enabled
        S-->>C: 200 { requireTotp: true, tempToken }
        U->>C: Enter 6-digit TOTP code
        C->>S: POST /api/auth/login/totp
        S->>DB: Verify TOTP token
    end

    alt First Login (mustChangePassword)
        S-->>C: 200 { requirePasswordChange: true, tempToken }
        U->>C: Enter new password
        C->>S: POST /api/auth/change-password
    end

    alt TOTP Not Set Up
        S-->>C: 200 { requireTotpSetup: true }
        C->>S: POST /api/auth/2fa/setup
        S-->>C: QR code + secret
        U->>C: Scan QR, enter code
        C->>S: POST /api/auth/2fa/verify
        S-->>C: Backup codes (10)
    end

    S->>DB: Create Session
    S->>R: Cache session data
    S-->>C: accessToken + refreshToken (httpOnly cookies)
    C->>U: Redirect to Dashboard
```

---

## Session Management

```mermaid
flowchart LR
    subgraph Mobile["Mobile (Android)"]
        M1[Device A] -->|Login| SESSION_CHECK{Active session<br/>exists?}
        SESSION_CHECK -->|Yes| REVOKE[Revoke old session<br/>Notify via email]
        SESSION_CHECK -->|No| CREATE1[Create session]
        REVOKE --> CREATE1
    end

    subgraph Web["Web Browser"]
        W1[Browser 1] --> CREATE2[Create session]
        W2[Browser 2] --> CREATE3[Create session]
        W3[Browser 3] --> CREATE4[Create session]
    end

    CREATE1 --> DB[(Sessions Collection<br/>TTL: 7 days)]
    CREATE2 --> DB
    CREATE3 --> DB
    CREATE4 --> DB

    style Mobile fill:#fee2e2
    style Web fill:#e0f2fe
```

> **Mobile:** Single device policy - new login revokes the previous session.
> **Web:** Multiple concurrent sessions allowed (read-only multi-session).

---

## Project Structure

```
Hospital-Management/
├── backend/                # Node.js + Express REST API
│   ├── src/
│   │   ├── config/         # Database, Redis, environment
│   │   ├── controllers/    # Route handlers
│   │   ├── middleware/      # Auth, rate limiting, validation
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # Express routers
│   │   ├── services/        # Business logic (TOTP, email, R2, PDF)
│   │   ├── jobs/            # Cron jobs (auto-delete)
│   │   └── index.js         # Entry point
│   ├── Dockerfile
│   └── package.json
│
├── frontend/               # React + TypeScript SPA
│   ├── src/
│   │   ├── components/     # Reusable UI (OtpInput, Navbar, etc.)
│   │   ├── pages/          # Route pages (Login, Dashboard, etc.)
│   │   ├── hooks/          # useAuth context
│   │   ├── services/       # API clients
│   │   ├── layouts/        # MainLayout with Navbar
│   │   └── App.tsx         # Router setup
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
│
├── android-app/            # Kotlin native Android app
│   └── app/src/main/java/com/hospital/management/
│       ├── data/           # API, repositories, models, Room DB
│       ├── domain/         # Use cases
│       ├── ui/             # Activities, ViewModels, adapters
│       └── utils/          # Network, session, biometric, security
│
├── docker-compose.yml      # Full-stack orchestration
├── .env.example            # Environment variable template
└── BUILD                   # Build automation script
```

---

## Data Model

```mermaid
erDiagram
    Hospital ||--o{ Session : "has sessions"
    Hospital ||--o{ Patient : "manages"
    Hospital ||--o{ BackupCode : "has recovery codes"
    Hospital ||--o{ AuditLog : "generates"
    Patient ||--o{ Folder : "contains"
    Folder ||--o{ File : "stores"

    Hospital {
        ObjectId _id
        String hospitalName
        String email UK
        String phone UK
        String username UK
        String passwordHash
        String role "admin | hospital"
        Boolean totpEnabled
        String totpSecretEncrypted "AES-256-GCM"
        Boolean mustChangePassword
        Boolean isActive
    }

    Session {
        ObjectId _id
        ObjectId hospitalId FK
        String refreshToken UK
        String deviceId
        Boolean isMobile
        String platform "web | android | ios"
        Date expiresAt "TTL: 7 days"
        Boolean isActive
    }

    Patient {
        ObjectId _id
        ObjectId hospitalId FK
        String patientId "auto [INITIALS]-[NNN] e.g. SH-001"
        String patientName
        String remarks "optional, max 500 chars"
    }

    Folder {
        String name "id | reports | consent | ..."
        Array files
    }

    File {
        String fileName
        String fileUrl "R2 signed URL"
        Number size
        String mimeType
        Date uploadedAt
    }

    BackupCode {
        ObjectId hospitalId FK
        String codeHash "bcrypt"
        Boolean isUsed
    }

    AuditLog {
        ObjectId userId FK
        String action "LOGIN_SUCCESS | TOTP_VERIFIED | ..."
        String status "SUCCESS | FAILURE"
        String ipAddress
        Date createdAt
    }
```

---

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (recommended) OR
- **Node.js 20+**, **MongoDB 7**, **Redis 7**
- **Android Studio** (for mobile app development)

### 1. Clone & Configure

```bash
git clone <repo-url>
cd Hospital-Management
cp .env.example .env
# Edit .env with your secrets (JWT, TOTP key, SMTP, etc.)
```

### 2. Start with Docker (Recommended)

```bash
docker-compose up --build
```

This starts all services:

| Service  | URL                    |
|----------|------------------------|
| Frontend | http://localhost       |
| Backend  | http://localhost:5000  |
| MongoDB  | localhost:27017        |
| Redis    | localhost:6379         |

### 3. Seed Demo Data

```bash
cd backend
node src/seed.js
```

Creates 5 hospitals and 54 patients with test data.

**Demo Login:** `admin@citymedical.com` / `Test@1234`

### 4. Start Without Docker (Development)

```bash
# Terminal 1 - Backend
cd backend
npm install
npm run dev

# Terminal 2 - Frontend
cd frontend
npm install
npm run dev
```

### 5. Build Android APK

Open `android-app/` in Android Studio, sync Gradle, and run on device/emulator.

---

## Security Architecture

```mermaid
flowchart TD
    A[Request] --> B{Rate Limiter}
    B -->|Exceeded| X1[429 Too Many Requests]
    B -->|OK| C{JWT Verification}
    C -->|Invalid| X2[401 Unauthorized]
    C -->|Valid| D{Session Active?}
    D -->|Revoked| X3[401 Session Conflict]
    D -->|Active| E{Account Active?}
    E -->|Locked| X4[423 Account Locked]
    E -->|Active| F[Process Request]

    style X1 fill:#fca5a5
    style X2 fill:#fca5a5
    style X3 fill:#fca5a5
    style X4 fill:#fca5a5
    style F fill:#86efac
```

| Layer | Implementation |
|-------|----------------|
| **Password Hashing** | bcrypt with salt rounds |
| **2FA** | TOTP (RFC 6238) via speakeasy, AES-256-GCM encrypted secrets |
| **Recovery** | 10 single-use backup codes (bcrypt hashed) |
| **Sessions** | JWT + DB-backed sessions with TTL auto-expiry |
| **Rate Limiting** | Per-endpoint limits (5 auth/15min, 3 OTP/min) |
| **Account Lockout** | 5 failed TOTP attempts = 5-minute lock |
| **Headers** | Helmet.js security headers |
| **CORS** | Origin-validated cross-origin policy |
| **Android** | Certificate pinning, encrypted storage, root detection |
| **Audit Trail** | All auth events logged (HIPAA compliance) |

---

## Deployment Architecture

```mermaid
graph TB
    subgraph Docker Compose
        direction TB
        FE[Frontend Container<br/>Nginx 1.25 Alpine<br/>Port 80]
        BE[Backend Container<br/>Node 20 Alpine<br/>Port 5000]
        MG[MongoDB 7<br/>Port 27017]
        RD[Redis 7 Alpine<br/>Port 6379]
    end

    FE -->|/api/* proxy| BE
    BE -->|mongoose| MG
    BE -->|ioredis| RD

    MG --- V1[(mongo_data<br/>volume)]
    RD --- V2[(redis_data<br/>volume)]

    USER[Browser] -->|HTTP :80| FE
    MOBILE[Android] -->|HTTPS :5000| BE

    style FE fill:#bfdbfe
    style BE fill:#bbf7d0
    style MG fill:#fde68a
    style RD fill:#fecaca
```

---

## API Overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/login` | Login with email/phone/username |
| `POST` | `/api/auth/login/totp` | Verify TOTP during login |
| `POST` | `/api/auth/login/recovery` | Login with backup code |
| `POST` | `/api/auth/2fa/setup` | Generate TOTP QR code |
| `POST` | `/api/auth/2fa/verify` | Complete TOTP setup |
| `POST` | `/api/auth/change-password` | Change password |
| `POST` | `/api/auth/refresh-token` | Refresh access token |
| `POST` | `/api/auth/logout` | End session |
| `POST` | `/api/auth/register-hospital` | Admin: create hospital |
| `GET`  | `/api/patients` | List patients (paginated) |
| `POST` | `/api/patients` | Create patient |
| `GET`  | `/api/patients/:id` | Get patient details |
| `POST` | `/api/patients/:id/files/:folder` | Upload file |
| `GET`  | `/api/patients/:id/download/pdf` | Download all as PDF |
| `GET`  | `/api/patients/:id/download/zip` | Download all as ZIP |
| `GET`  | `/api/hospitals/me` | Get current hospital |
| `POST` | `/api/export/archive` | Export modules as ZIP |

> See [backend/README.md](backend/README.md) for full endpoint documentation.

---

## Environment Variables

See [.env.example](.env.example) for the full list. Critical variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `JWT_SECRET` | Yes | 64+ char secret for access tokens |
| `REFRESH_TOKEN_SECRET` | Yes | 64+ char secret for refresh tokens |
| `TOTP_ENCRYPTION_KEY` | Yes | 64-char hex string (32-byte AES key) |
| `MONGODB_URI` | Yes (prod) | MongoDB connection string |
| `SMTP_HOST/USER/PASS` | Yes | Email delivery configuration |
| `R2_*` | Optional | Cloudflare R2 for file storage |
| `REDIS_URL` | Optional | Redis (falls back to in-memory) |

---

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Backend** | Node.js, Express, Mongoose, JWT, speakeasy |
| **Frontend** | React 18, TypeScript, Vite, Tailwind CSS |
| **Android** | Kotlin, Retrofit, Room, WorkManager, ML Kit |
| **Database** | MongoDB 7 |
| **Cache** | Redis 7 |
| **File Storage** | Cloudflare R2 (S3-compatible) |
| **Deployment** | Docker Compose, Nginx |

---

## Documentation

| Module | README |
|--------|--------|
| Backend API | [backend/README.md](backend/README.md) |
| Frontend Web | [frontend/README.md](frontend/README.md) |
| Android App | [android-app/README.md](android-app/README.md) |

---

## License

This project is proprietary software. All rights reserved.
