# 🏥 Hospital Management System - Comprehensive Audit Report

**Report Date:** December 30, 2025
**Version:** 1.1 (Updated after security fixes)
**Auditor:** System Analysis
**Last Updated:** December 30, 2025 21:05 IST

---

## 📋 Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Technology Stack Analysis](#technology-stack-analysis)
4. [Frontend Audit](#frontend-audit)
5. [Backend Audit](#backend-audit)
6. [Security Audit](#security-audit)
7. [Database Schema Analysis](#database-schema-analysis)
8. [API Endpoints Audit](#api-endpoints-audit)
9. [User Workflow Diagrams](#user-workflow-diagrams)
10. [Performance Analysis](#performance-analysis)
11. [Recommendations](#recommendations)
12. [Compliance Assessment](#compliance-assessment)

---

## 1. Executive Summary

### Project Overview
The Hospital Management System is a full-stack web application designed for hospital record management with multi-tenant architecture, patient file management, and enterprise-grade security features including TOTP-based Two-Factor Authentication.

### Key Metrics

| Metric | Value |
|--------|-------|
| **Frontend Pages** | 14 |
| **Frontend Components** | 16 |
| **Backend API Routes** | 3 Route Files |
| **Total API Endpoints** | 25+ |
| **Database Models** | 7 |
| **Backend Services** | 9 |
| **Middleware Layers** | 5 |

### Overall Assessment

| Category | Rating | Status |
|----------|--------|--------|
| Security | ⭐⭐⭐⭐ | Good |
| Code Quality | ⭐⭐⭐⭐ | Good |
| Architecture | ⭐⭐⭐⭐⭐ | Excellent |
| Documentation | ⭐⭐⭐⭐ | Good |
| Performance | ⭐⭐⭐⭐ | Good |
| Scalability | ⭐⭐⭐⭐ | Good |

---

## 2. System Architecture Overview

### High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    React SPA (Vite + TypeScript)                 │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │   │
│  │  │  Pages   │ │Components│ │  Hooks   │ │    Services      │   │   │
│  │  │  (14)    │ │  (16)    │ │ useAuth  │ │ api, authService │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ HTTPS (REST API + Cookies)
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SERVER LAYER                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                  Node.js + Express Server                        │   │
│  │  ┌──────────────────────────────────────────────────────────┐   │   │
│  │  │                    Middleware Stack                       │   │   │
│  │  │  Helmet → CORS → Rate Limit → Body Parser → Cookie Parser│   │   │
│  │  └──────────────────────────────────────────────────────────┘   │   │
│  │  ┌────────────┐ ┌────────────┐ ┌────────────────────────────┐   │   │
│  │  │   Routes   │ │Controllers │ │        Services            │   │   │
│  │  │ auth       │ │ auth       │ │ token, totp, email, sms    │   │   │
│  │  │ patient    │ │ patient    │ │ patient, r2, pdf, zip      │   │   │
│  │  │ hospitals  │ │ hospitals  │ │ otp                        │   │   │
│  │  └────────────┘ └────────────┘ └────────────────────────────┘   │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
          ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
          │  MongoDB    │  │ Cloudflare  │  │ Node-Cron   │
          │  Database   │  │ R2 Storage  │  │ Jobs        │
          │  (7 Models) │  │ (Files)     │  │ (Auto-Del)  │
          └─────────────┘  └─────────────┘  └─────────────┘
```

### Request Flow Diagram

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  Browser │───▶│  Axios   │───▶│  Express │───▶│Controller│───▶│ Service  │
│          │    │Interceptor│   │Middleware│    │          │    │          │
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
     ▲                                                               │
     │                                                               ▼
     │                                                        ┌──────────┐
     │                                                        │ Database │
     │                                                        │  / R2    │
     │                                                        └──────────┘
     │                                                               │
     └───────────────────────────────────────────────────────────────┘
                              Response
```

---

## 3. Technology Stack Analysis

### Frontend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| React | ^18.2.0 | UI Framework |
| TypeScript | ^5.2.0 | Type Safety |
| Vite | ^4.5.0 | Build Tool |
| React Router DOM | ^6.15.0 | Routing |
| Axios | ^1.5.0 | HTTP Client |
| Zustand | ^4.4.0 | State Management |
| TailwindCSS | ^3.3.0 | Styling |
| Headless UI | ^2.2.9 | Accessible Components |

### Backend Stack

| Technology | Version | Purpose |
|------------|---------|---------|
| Node.js | ES Modules | Runtime |
| Express | ^4.18.2 | Web Framework |
| MongoDB | via Mongoose ^7.5.0 | Database |
| JWT | ^9.0.2 | Authentication |
| bcryptjs | ^2.4.3 | Password Hashing |
| speakeasy | ^2.0.0 | TOTP 2FA |
| qrcode | ^1.5.4 | QR Code Generation |
| AWS SDK (S3) | ^3.932.0 | R2 Cloud Storage |
| Helmet | ^7.0.0 | Security Headers |
| node-cron | ^4.2.1 | Scheduled Jobs |
| pdfkit | ^0.17.2 | PDF Generation |
| archiver | ^7.0.1 | ZIP Creation |
| nodemailer | ^7.0.12 | Email Service |

---

## 4. Frontend Audit

### 4.1 File Structure

```
frontend/src/
├── App.tsx                    # Main App Component
├── main.tsx                   # Entry Point
├── globals.css                # Global Styles
├── vite-env.d.ts             # Vite Types
│
├── components/               # Reusable UI Components (16 files)
│   ├── AdminRoute.tsx        # Admin-only Route Guard
│   ├── BackupCodesModal.tsx  # 2FA Backup Codes Display
│   ├── Button.tsx            # Reusable Button Component
│   ├── CountdownTimer.tsx    # OTP Countdown Timer
│   ├── ErrorBoundary.tsx     # Error Handling Wrapper
│   ├── ErrorMessage.tsx      # Error Display Component
│   ├── LogoHeader.tsx        # Hospital Logo Header
│   ├── Navbar.tsx            # Navigation Bar
│   ├── OtpInput.tsx          # OTP Input Fields
│   ├── PasswordConfirmModal.tsx # Password Confirmation
│   ├── ProtectedRoute.tsx    # Auth Route Guard
│   ├── RotationSetupModal.tsx # 2FA Rotation Setup
│   ├── SkeletonLoader.tsx    # Loading Skeleton
│   ├── TextInput.tsx         # Text Input Component
│   ├── Toast.tsx             # Toast Notifications
│   └── TwoFactorSettings.tsx # 2FA Settings Panel
│
├── pages/                    # Page Components (14 files)
│   ├── ChangePassword.tsx    # Password Change Page
│   ├── Dashboard.tsx         # Main Dashboard
│   ├── FileList.tsx          # Patient Files List
│   ├── FolderView.tsx        # Folder Viewer
│   ├── HospitalRegistration.tsx # Hospital Registration
│   ├── HospitalsList.tsx     # Hospitals Management
│   ├── LandingPage.tsx       # Public Landing
│   ├── Login.tsx             # Login Page
│   ├── OtpVerification.tsx   # OTP Verification
│   ├── PatientDetails.tsx    # Patient Details View
│   ├── PatientsList.tsx      # Patients List
│   ├── SecuritySettings.tsx  # Security Settings
│   ├── TotpSetupMandatory.tsx # Mandatory 2FA Setup
│   └── TotpVerification.tsx  # TOTP Verification
│
├── hooks/                    # Custom React Hooks
│   └── useAuth.tsx           # Authentication Hook & Context
│
├── layouts/                  # Layout Components
│   └── MainLayout.tsx        # Main App Layout
│
├── routes/                   # Routing Configuration
│   └── AppRoutes.tsx         # Route Definitions
│
├── services/                 # API Services
│   ├── api.ts                # Axios Instance & Interceptors
│   ├── authService.ts        # Authentication API
│   └── patientApi.ts         # Patient API
│
├── types/                    # TypeScript Types
│   └── auth.ts               # Auth Type Definitions
│
├── utils/                    # Utilities
│   ├── persistentLogger.ts   # Debug Logger
│   └── validator.ts          # Form Validators
│
└── config/                   # Configuration
    └── constants.ts          # API URLs, Constants
```

### 4.2 Route Configuration Analysis

| Route | Component | Access | Purpose |
|-------|-----------|--------|---------|
| `/` | LandingPage | Public | Landing page |
| `/login` | Login | Public | User login |
| `/register` | HospitalRegistration | Admin Only | Hospital registration |
| `/verify-totp` | TotpVerification | Public | TOTP verification |
| `/verify-otp` | TotpVerification | Public | Legacy OTP redirect |
| `/setup-2fa` | TotpSetupMandatory | Public | Mandatory 2FA setup |
| `/change-password` | ChangePassword | Public (tempToken) | Password change |
| `/dashboard` | Dashboard | Protected | Main dashboard |
| `/hospitals` | HospitalsList | Admin + Protected | Hospital management |
| `/security` | SecuritySettings | Protected | Security settings |
| `*` | Navigate | - | Redirect to dashboard |

### 4.3 Component Quality Assessment

#### Protected Route Component
**File:** `components/ProtectedRoute.tsx`
- ✅ Proper authentication check
- ✅ Loading state handling
- ✅ TempToken purpose parsing for redirect logic
- ✅ Mandatory TOTP enforcement
- ✅ Proper redirects for unauthenticated users

#### Admin Route Component
**File:** `components/AdminRoute.tsx`
- ✅ Authentication verification
- ⚠️ **Issue:** Hardcoded admin email check (`admin@citymedical.com`)
- 💡 **Recommendation:** Use role-based access control from database

### 4.4 State Management

**Auth Context (`useAuth.tsx`):**
- ✅ Centralized authentication state
- ✅ Token management (access, refresh, temp)
- ✅ Hospital data caching
- ✅ Auto-refresh on mount
- ✅ Large logo handling (base64 stripping for localStorage)
- ✅ Multiple auth flows: standard, TOTP, recovery, password change

---

## 5. Backend Audit

### 5.1 File Structure

```
backend/src/
├── index.js                  # Entry Point & Server Setup
│
├── config/                   # Configuration
│   ├── db.js                 # MongoDB Connection
│   └── env.js                # Environment Variables
│
├── controllers/              # Business Logic (3 files)
│   ├── auth.controller.js    # Auth Operations (1590 lines)
│   ├── hospitals.controller.js # Hospital CRUD
│   └── patient.controller.js # Patient Operations
│
├── jobs/                     # Scheduled Tasks
│   └── autoDelete.job.js     # Patient Auto-Delete Cron
│
├── middleware/               # Express Middleware (5 files)
│   ├── auth.js               # JWT Verification
│   ├── errorHandler.js       # Global Error Handler
│   ├── rateLimiter.js        # Rate Limiting
│   ├── upload.js             # File Upload (Multer)
│   └── validateRequest.js    # Input Validation
│
├── models/                   # Database Models (7 files)
│   ├── AuditLog.js           # Security Audit Trail
│   ├── BackupCode.js         # 2FA Backup Codes
│   ├── Hospital.js           # Hospital Entity
│   ├── Otp.js                # Legacy OTP Storage
│   ├── Patient.js            # Patient Entity
│   ├── PendingHospital.js    # Registration Queue
│   └── Session.js            # User Sessions
│
├── routes/                   # API Routes (3 files)
│   ├── auth.routes.js        # Auth Endpoints
│   ├── hospitals.routes.js   # Hospital Endpoints
│   └── patient.routes.js     # Patient Endpoints
│
├── services/                 # Business Services (9 files)
│   ├── email.service.js      # Email Sending
│   ├── otp.service.js        # OTP Generation
│   ├── patient.service.js    # Patient Operations
│   ├── pdf.service.js        # PDF Generation
│   ├── r2.service.js         # Cloud Storage
│   ├── sms.service.js        # SMS Sending
│   ├── token.service.js      # Session Management
│   ├── totp.service.js       # TOTP 2FA
│   └── zip.service.js        # ZIP Creation
│
└── utils/                    # Utilities (4 files)
    ├── encryption.js         # AES Encryption
    ├── hash.js               # Password Hashing
    ├── jwt.js                # JWT Operations
    └── [other utils]
```

### 5.2 Controller Analysis

#### Auth Controller (`auth.controller.js`)
**Lines:** 1590 | **Complexity:** High

| Function | Lines | Purpose |
|----------|-------|---------|
| `changePassword` | 33-108 | Password change with temp token |
| `registerHospital` | 110-276 | Hospital registration |
| `verifyRegistration` | 278-415 | TOTP verification for registration |
| `login` | 417-661 | Credential validation + TOTP flow |
| `setupTotp` | 818-887 | TOTP secret generation |
| `verifyTotpSetup` | 889-986 | TOTP setup verification |
| `verifyTotpLogin` | 988-1126 | TOTP login verification |
| `disableTotp` | 1128-1214 | Disable 2FA |
| `resetTotp` | 1217-1293 | Reset 2FA with password |
| `verifyTotpReset` | 1295-1377 | Verify TOTP rotation |
| `recoveryLogin` | 1379-1488 | Backup code login |
| `refreshToken` | 1490-1538 | Token refresh |
| `logout` | 1540-1572 | Session invalidation |

#### Patient Controller (`patient.controller.js`)
**Lines:** 441 | **Complexity:** Medium

| Function | Purpose |
|----------|---------|
| `createPatient` | Create patient with auto folders |
| `getPatients` | Paginated patient list |
| `getPatientById` | Patient details |
| `updatePatient` | Update patient info |
| `createFolder` | Create custom folder |
| `getFolderFiles` | List files in folder |
| `uploadFile` | Upload file to R2 |
| `downloadAllPdf` | Export all as PDF |
| `downloadFolderPdf` | Export folder as PDF |
| `downloadAllZip` | Export all as ZIP |
| `downloadFolderZip` | Export folder as ZIP |
| `autoDelete` | 90-day cleanup |

---

## 6. Security Audit

### 6.1 Authentication Security

#### JWT Token Implementation
| Feature | Status | Details |
|---------|--------|---------|
| Access Token | ✅ | 24h expiry, hospital ID embedded |
| Refresh Token | ✅ | 7d expiry, stored in HTTP-only cookie |
| Temp Token | ✅ | 10min expiry, purpose-scoped |
| Token Type Validation | ✅ | Prevents token misuse |

#### TOTP 2FA Implementation
| Feature | Status | Details |
|---------|--------|---------|
| Secret Encryption | ✅ | AES-256-GCM encrypted storage |
| QR Code Generation | ✅ | Base64 data URL |
| Clock Drift Tolerance | ✅ | window=0 (setup), window=1 (login) |
| Backup Codes | ✅ | 10 bcrypt-hashed codes |
| Brute Force Protection | ✅ | 5 attempts → 5min lockout |
| Attempt Tracking | ✅ | `totpFailedAttempts`, `totpLockedUntil` |

### 6.2 Rate Limiting Configuration

| Limiter | Window | Max Requests | Scope |
|---------|--------|--------------|-------|
| General | 15 sec | 10 | All API |
| Auth | 15 min | 5 | Login/Register |
| OTP | 1 min | 3 | TOTP verification |
| Patient Download | 1 min | 10 | File downloads |

### 6.3 Security Headers (Helmet)

```javascript
app.use(helmet()); // Sets:
// - X-DNS-Prefetch-Control
// - X-Frame-Options: SAMEORIGIN
// - X-Content-Type-Options: nosniff
// - X-XSS-Protection
// - Strict-Transport-Security
// - Referrer-Policy
```

### 6.4 Data Protection

| Data Type | Protection Method |
|-----------|-------------------|
| Passwords | bcrypt hashing |
| TOTP Secrets | AES-256-GCM encryption |
| Backup Codes | bcrypt hashing |
| JWT Tokens | HMAC SHA256 signing |
| Cookies | httpOnly, secure, sameSite |

### 6.5 Audit Logging

**Model:** `AuditLog.js`

**Tracked Actions:**
- LOGIN_ATTEMPT, LOGIN_SUCCESS, LOGIN_FAILED
- OTP_SENT, OTP_VERIFIED
- LOGOUT, PASSWORD_CHANGE
- PROFILE_UPDATE, HOSPITAL_REGISTRATION
- TOTP_SETUP_INITIATED, TOTP_SETUP_COMPLETED
- TOTP_VERIFIED, TOTP_DISABLED, TOTP_ENABLED
- TOTP_LOGIN_ATTEMPT, RECOVERY_LOGIN_ATTEMPT
- TOTP_ROTATION_INITIATED, TOTP_ROTATION_COMPLETED

**Captured Data:**
- userId (Hospital reference)
- action (enum)
- status (SUCCESS/FAILURE)
- ipAddress
- userAgent
- details (flexible metadata)
- metadata.email, metadata.failureReason

### 6.6 Security Vulnerabilities & Risks

| Risk | Severity | Status | Notes |
|------|----------|--------|-------|
| SQL Injection | N/A | ✅ Safe | MongoDB with Mongoose |
| XSS | Low | ✅ Mitigated | React escaping + Helmet |
| CSRF | Low | ✅ Mitigated | SameSite cookies |
| Brute Force | Low | ✅ Mitigated | Rate limiting + lockout |
| Session Hijacking | Low | ✅ Mitigated | HTTP-only cookies |
| Password Storage | N/A | ✅ Safe | bcrypt hashing |
| Hardcoded Admin | Medium | ⚠️ Risk | `admin@citymedical.com` check |
| Dev Secrets | High | ✅ **FIXED** | Production secrets validation enforced |
| Unprotected Routes | High | ✅ **FIXED** | Hospital routes now require authentication |
| Weak Passwords | Medium | ✅ **FIXED** | Password complexity requirements added |
| Silent Lockouts | Medium | ✅ **FIXED** | Email notifications on account lockout |

---

## 7. Database Schema Analysis

### 7.1 Hospital Schema

```javascript
Hospital {
  hospitalName: String (required, min 3 chars)
  email: String (unique, lowercase, email format)
  phone: String (unique, E.164 format)
  passwordHash: String (required, min 6 chars)
  logoUrl: String (default placeholder)
  isActive: Boolean (default: true)

  // Login Security
  failedLoginAttempts: Number (default: 0)
  lockUntil: Date

  // Profile
  department: String (default: "General")
  address: String
  city: String
  state: String
  zipCode: String

  // TOTP 2FA
  totpEnabled: Boolean (default: false)
  totpSecretEncrypted: String (AES-256-GCM)
  totpVerified: Boolean (default: false)
  totpPendingSecret: String (rotation)
  totpSetupAt: Date
  totpLastUsedAt: Date
  totpFailedAttempts: Number (default: 0)
  totpLockedUntil: Date
  totpSecretVersion: Number (default: 1)
  totpIssuer: String
  mustChangePassword: Boolean (default: false)

  // Timestamps
  createdAt: Date
  updatedAt: Date
}

Indexes:
  - email: 1
  - phone: 1
```

### 7.2 Patient Schema

```javascript
Patient {
  hospitalId: ObjectId (ref: Hospital, indexed)
  patientName: String (required)
  email: String
  phone: String
  dateOfBirth: Date
  medicalRecordNumber: String (unique, sparse)
  notes: String
  status: Enum ['active', 'inactive', 'archived']

  folders: [Folder] (default: 8 preset folders)

  createdAt: Date
  updatedAt: Date
}

Folder {
  name: String (required)
  files: [File]
  createdAt: Date
}

File {
  fileName: String
  fileUrl: String (R2 presigned URL)
  size: Number (bytes)
  mimeType: String
  uploadedAt: Date
}

Default Folders:
  - id
  - claim paper
  - hospital bills
  - discharge summary
  - hospital documents
  - reports
  - medical prescription & bills
  - consent

Indexes:
  - hospitalId: 1
  - createdAt: 1
  - { hospitalId: 1, createdAt: 1 }
```

### 7.3 Session Schema

```javascript
Session {
  hospitalId: ObjectId (ref: Hospital)
  refreshToken: String (unique)
  deviceId: String (for single-device login)
  ipAddress: String
  userAgent: String
  expiresAt: Date (TTL index)
  isActive: Boolean (default: true)
  lastAccessedAt: Date

  createdAt: Date
  updatedAt: Date
}

Indexes:
  - { hospitalId: 1, deviceId: 1 } (compound)
  - { expiresAt: 1 } (TTL, auto-delete)
```

### 7.4 BackupCode Schema

```javascript
BackupCode {
  hospitalId: ObjectId (ref: Hospital, indexed)
  codeHash: String (bcrypt hash)
  isUsed: Boolean (default: false)
  usedAt: Date

  createdAt: Date
  updatedAt: Date
}

Indexes:
  - { hospitalId: 1, codeHash: 1 } (unique compound)
  - { hospitalId: 1, isUsed: 1 }
```

---

## 8. API Endpoints Audit

### 8.1 Authentication Endpoints (`/api/auth`)

| Method | Endpoint | Auth | Rate Limit | Purpose |
|--------|----------|------|------------|---------|
| POST | `/register-hospital` | None | authLimiter | Register new hospital |
| POST | `/login` | None | authLimiter | Email/password login |
| POST | `/change-password` | TempToken | authLimiter | Change password |
| POST | `/2fa/setup` | AccessToken | None | Generate TOTP secret |
| POST | `/2fa/verify` | AccessToken | otpLimiter | Enable 2FA |
| POST | `/login/totp` | TempToken | otpLimiter | TOTP verification |
| POST | `/2fa/disable` | AccessToken | otpLimiter | Disable 2FA |
| POST | `/2fa/reset` | AccessToken | authLimiter | Reset 2FA with password |
| POST | `/2fa/reset/verify` | AccessToken | authLimiter | Confirm TOTP rotation |
| POST | `/login/recovery` | TempToken | otpLimiter | Backup code login |
| POST | `/refresh-token` | Cookie | None | Refresh access token |
| POST | `/logout` | Cookie | None | Invalidate session |

### 8.2 Patient Endpoints (`/api/patients`)

| Method | Endpoint | Auth | Rate Limit | Purpose |
|--------|----------|------|------------|---------|
| POST | `/` | AccessToken | None | Create patient |
| GET | `/` | AccessToken | None | List patients (paginated) |
| GET | `/:patientId` | AccessToken | None | Get patient details |
| PUT | `/:patientId` | AccessToken | None | Update patient |
| POST | `/:patientId/folders` | AccessToken | None | Create folder |
| GET | `/:patientId/files/:folderName` | AccessToken | None | Get folder files |
| POST | `/:patientId/files/:folderName` | AccessToken | None | Upload file |
| GET | `/:patientId/download/pdf` | AccessToken | patientLimiter | Download all as PDF |
| GET | `/:patientId/folders/:folderName/pdf` | AccessToken | patientLimiter | Download folder PDF |
| GET | `/:patientId/download/zip` | AccessToken | patientLimiter | Download all as ZIP |
| GET | `/:patientId/folders/:folderName/zip` | AccessToken | patientLimiter | Download folder ZIP |
| DELETE | `/autodelete` | AccessToken | None | Auto-delete (cron) |

### 8.3 Hospital Endpoints (`/api/hospitals`)

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| GET | `/` | AccessToken | List all hospitals |
| GET | `/:id` | AccessToken | Get hospital by ID |
| PUT | `/:id` | AccessToken | Update hospital |

✅ **FIXED:** Hospital endpoints now require authentication (`verifyAccessToken` middleware applied).

---

## 9. User Workflow Diagrams

### 9.1 Regular User (Hospital Staff) Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     REGULAR USER WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────┐
                              │  Landing Page │
                              │      /        │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │  Login Page   │
                              │    /login     │
                              └───────┬───────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    │                 │                 │
                    ▼                 ▼                 ▼
          ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
          │ TOTP Not Enabled│ │TOTP Enabled │ │Password Change  │
          │ (New User)      │ │             │ │Required         │
          └────────┬────────┘ └──────┬──────┘ └────────┬────────┘
                   │                 │                 │
                   ▼                 ▼                 ▼
          ┌─────────────────┐ ┌─────────────┐ ┌─────────────────┐
          │ Mandatory 2FA   │ │ TOTP Verify │ │ Change Password │
          │ Setup           │ │ /verify-totp│ │ /change-password│
          │ /setup-2fa      │ │             │ │                 │
          └────────┬────────┘ └──────┬──────┘ └────────┬────────┘
                   │                 │                 │
                   │                 │                 │
                   ▼                 ▼                 ▼
          ┌─────────────────┐       │         ┌─────────────────┐
          │ Scan QR Code    │       │         │ New Password    │
          │ Enter TOTP Code │       │         │ Set Successfully│
          └────────┬────────┘       │         └────────┬────────┘
                   │                │                  │
                   │                │                  │
                   └────────────────┼──────────────────┘
                                    │
                                    ▼
                           ┌───────────────────┐
                           │    DASHBOARD      │
                           │    /dashboard     │
                           └─────────┬─────────┘
                                     │
              ┌──────────────────────┼──────────────────────┐
              │                      │                      │
              ▼                      ▼                      ▼
     ┌────────────────┐    ┌────────────────┐    ┌──────────────────┐
     │ Patients List  │    │ Security       │    │ Logout           │
     │                │    │ Settings       │    │                  │
     └───────┬────────┘    └────────────────┘    └──────────────────┘
             │
             ▼
     ┌────────────────┐
     │ Patient Details│
     │ View Folders   │
     └───────┬────────┘
             │
             ▼
     ┌────────────────┐
     │ File List      │
     │ Download PDF   │
     │ Download ZIP   │
     └────────────────┘
```

### 9.2 Hospital Admin Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    HOSPITAL ADMIN WORKFLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────┐
                              │  Login Page   │
                              │    /login     │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ TOTP Verify   │
                              │ (If Enabled)  │
                              └───────┬───────┘
                                      │
                                      ▼
                           ┌───────────────────┐
                           │    DASHBOARD      │
                           │    /dashboard     │
                           └─────────┬─────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ PATIENT MGMT     │       │ HOSPITAL MGMT    │       │ SECURITY         │
│                  │       │ /hospitals       │       │ /security        │
└────────┬─────────┘       └────────┬─────────┘       └────────┬─────────┘
         │                          │                          │
         ▼                          ▼                          ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ • View Patients  │       │ • View Hospitals │       │ • Enable/Disable │
│ • Add Patient    │       │ • Edit Hospital  │       │   2FA            │
│ • Update Patient │       │ • Update Logo    │       │ • Rotate 2FA     │
│ • View Files     │       │ • Toggle Active  │       │ • View Backup    │
│ • Upload Files   │       │                  │       │   Codes          │
│ • Download PDF   │       │                  │       │                  │
│ • Download ZIP   │       │                  │       │                  │
└──────────────────┘       └──────────────────┘       └──────────────────┘
```

### 9.3 Super Admin Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     SUPER ADMIN WORKFLOW                                 │
│              (admin@citymedical.com - Currently Hardcoded)              │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌───────────────┐
                              │  Login Page   │
                              │    /login     │
                              └───────┬───────┘
                                      │
                                      ▼
                              ┌───────────────┐
                              │ TOTP Verify   │
                              └───────┬───────┘
                                      │
                                      ▼
                           ┌───────────────────┐
                           │    DASHBOARD      │
                           │    /dashboard     │
                           └─────────┬─────────┘
                                     │
    ┌────────────────────────────────┼────────────────────────────────┐
    │                                │                                │
    ▼                                ▼                                ▼
┌────────────────┐         ┌──────────────────┐         ┌──────────────────┐
│ HOSPITAL       │         │ REGISTER NEW     │         │ SYSTEM           │
│ MANAGEMENT     │         │ HOSPITAL         │         │ MONITORING       │
│ /hospitals     │         │ /register        │         │                  │
└───────┬────────┘         └────────┬─────────┘         └──────────────────┘
        │                           │
        ▼                           ▼
┌────────────────┐         ┌──────────────────┐
│ • View All     │         │ Hospital Form:   │
│   Hospitals    │         │ • Hospital Name  │
│ • Edit Any     │         │ • Email          │
│   Hospital     │         │ • Phone          │
│ • Activate/    │         │ • Address        │
│   Deactivate   │         │ • Logo Upload    │
│ • Update Logo  │         │                  │
└────────────────┘         │ → Auto Password  │
                           │ → Email Sent     │
                           │ → Must Setup 2FA │
                           └──────────────────┘
```

### 9.4 Authentication Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    AUTHENTICATION FLOW                                   │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────┐
│  START   │
└────┬─────┘
     │
     ▼
┌──────────────────┐      ┌──────────────────┐
│ Enter Email &    │─────▶│ POST /api/auth/  │
│ Password         │      │ login            │
└──────────────────┘      └────────┬─────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
                    ▼                             ▼
         ┌──────────────────┐          ┌──────────────────┐
         │ requireTotp:false│          │ requireTotp:true │
         │ (TOTP Disabled)  │          │ (TOTP Enabled)   │
         └────────┬─────────┘          └────────┬─────────┘
                  │                             │
                  │                             ▼
                  │                   ┌──────────────────┐
                  │                   │ Store tempToken  │
                  │                   │ in localStorage  │
                  │                   └────────┬─────────┘
                  │                             │
                  │                             ▼
                  │                   ┌──────────────────┐
                  │                   │ /verify-totp     │
                  │                   │ Enter 6-digit    │
                  │                   │ TOTP Code        │
                  │                   └────────┬─────────┘
                  │                             │
                  │              ┌──────────────┴──────────────┐
                  │              │                             │
                  │              ▼                             ▼
                  │    ┌──────────────────┐          ┌──────────────────┐
                  │    │ POST /api/auth/  │          │ Use Backup Code  │
                  │    │ login/totp       │          │ POST /api/auth/  │
                  │    └────────┬─────────┘          │ login/recovery   │
                  │             │                    └────────┬─────────┘
                  │             │                             │
                  │             └──────────────┬──────────────┘
                  │                            │
                  ▼                            ▼
         ┌──────────────────────────────────────────────┐
         │              AUTHENTICATED                    │
         │  • Set HTTP-only cookies (access, refresh)   │
         │  • Store hospital data in localStorage       │
         │  • Clear tempToken                           │
         └─────────────────────┬────────────────────────┘
                               │
               ┌───────────────┴───────────────┐
               │                               │
               ▼                               ▼
      ┌──────────────────┐           ┌──────────────────┐
      │ totpEnabled:true │           │ totpEnabled:false│
      │ → /dashboard     │           │ → /setup-2fa     │
      └──────────────────┘           │   (Mandatory)    │
                                     └──────────────────┘
```

### 9.5 Patient File Management Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                   PATIENT FILE MANAGEMENT FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ Dashboard        │
│ /dashboard       │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     GET /api/patients      ┌──────────────────┐
│ Patients List    │◀──────────────────────────▶│ MongoDB Query    │
│ (Paginated)      │     ?limit=20&skip=0       │ hospitalId filter│
└────────┬─────────┘                            └──────────────────┘
         │
         │ Click Patient
         ▼
┌──────────────────┐     GET /api/patients/:id  ┌──────────────────┐
│ Patient Details  │◀──────────────────────────▶│ Patient Document │
│ with Folders     │                            │ + Folders Array  │
└────────┬─────────┘                            └──────────────────┘
         │
         │ Click Folder
         ▼
┌──────────────────┐  GET /:id/files/:folder    ┌──────────────────┐
│ File List        │◀──────────────────────────▶│ Files in Folder  │
│ in Folder        │                            │ (Signed URLs)    │
└────────┬─────────┘                            └──────────────────┘
         │
    ┌────┼────────────────────────────┐
    │    │                            │
    ▼    ▼                            ▼
┌────────────┐  ┌────────────┐  ┌────────────────┐
│ Upload File│  │ Download   │  │ Download       │
│ POST       │  │ PDF        │  │ ZIP            │
│ /:id/files │  │ /:id/.../pdf│ │ /:id/.../zip   │
└────────────┘  └────────────┘  └────────────────┘
       │              │               │
       ▼              ▼               ▼
┌────────────┐  ┌────────────┐  ┌────────────────┐
│ R2 Upload  │  │ PDFKit     │  │ Archiver       │
│ Store URL  │  │ Generation │  │ ZIP Stream     │
│ in MongoDB │  │ Stream     │  │                │
└────────────┘  └────────────┘  └────────────────┘
```

### 9.6 2FA Setup & Recovery Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      2FA SETUP & RECOVERY FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

                     ┌───────────────────────────────┐
                     │       2FA SETUP FLOW          │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ POST /api/auth/2fa/setup      │
                     │ Returns: QR Code, Secret      │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ User scans QR with Auth App   │
                     │ (Google Auth, Authy, etc.)    │
                     └───────────────┬───────────────┘
                                     │
                                     ▼
                     ┌───────────────────────────────┐
                     │ POST /api/auth/2fa/verify     │
                     │ Token: 6-digit code           │
                     │ Window: 0 (strict)            │
                     └───────────────┬───────────────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                 │
                    ▼                                 ▼
         ┌──────────────────┐              ┌──────────────────┐
         │ ✅ Success       │              │ ❌ Invalid Code  │
         │ • totpEnabled=   │              │ • Try again      │
         │   true           │              │ • Max 5 attempts │
         │ • Show 10 Backup │              │ • 5min lockout   │
         │   Codes          │              └──────────────────┘
         └──────────────────┘


                     ┌───────────────────────────────┐
                     │      2FA RECOVERY FLOW        │
                     └───────────────┬───────────────┘
                                     │
         ┌───────────────────────────┼───────────────────────────┐
         │                           │                           │
         ▼                           ▼                           ▼
┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│ BACKUP CODE      │       │ TOTP RESET       │       │ DEVICE LOST      │
│ LOGIN            │       │ (With Password)  │       │ (Contact Admin)  │
└────────┬─────────┘       └────────┬─────────┘       └──────────────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐       ┌──────────────────┐
│ POST /login/     │       │ POST /2fa/reset  │
│ recovery         │       │ Password verify  │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         ▼                          ▼
┌──────────────────┐       ┌──────────────────┐
│ Code marked used │       │ New QR Code      │
│ Remaining codes  │       │ generated        │
│ warning shown    │       │ (pendingSecret)  │
└────────┬─────────┘       └────────┬─────────┘
         │                          │
         │                          ▼
         │                 ┌──────────────────┐
         │                 │ POST /2fa/reset/ │
         │                 │ verify           │
         │                 │ Confirm new TOTP │
         │                 └────────┬─────────┘
         │                          │
         └──────────────┬───────────┘
                        │
                        ▼
               ┌──────────────────┐
               │ AUTHENTICATED    │
               │ New 2FA Active   │
               │ New Backup Codes │
               └──────────────────┘
```

---

## 10. Performance Analysis

### 10.1 Database Indexing

| Collection | Index | Purpose |
|------------|-------|---------|
| Hospital | `{email: 1}` | Fast email lookup |
| Hospital | `{phone: 1}` | Fast phone lookup |
| Patient | `{hospitalId: 1}` | Hospital isolation |
| Patient | `{createdAt: 1}` | 90-day deletion queries |
| Patient | `{hospitalId: 1, createdAt: 1}` | Optimized compound |
| Session | `{hospitalId: 1, deviceId: 1}` | Single-device enforcement |
| Session | `{expiresAt: 1}` | TTL auto-cleanup |
| AuditLog | `{userId: 1, createdAt: -1}` | User activity lookup |
| AuditLog | `{action: 1, createdAt: -1}` | Action filtering |
| BackupCode | `{hospitalId: 1, codeHash: 1}` | Unique code lookup |

### 10.2 Cron Job

**Auto-Delete Job:**
- **Schedule:** Daily at 2:00 AM UTC
- **Function:** Delete patients older than 90 days
- **Actions:** Remove from MongoDB + Delete files from R2

### 10.3 File Handling

| Feature | Implementation |
|---------|----------------|
| Upload | Multer memory storage → R2 |
| Download PDF | PDFKit streaming |
| Download ZIP | Archiver streaming |
| Storage | Cloudflare R2 (S3-compatible) |
| Fallback | Local storage in development |

---

## 11. Recommendations

### 11.1 Critical Fixes

| Priority | Issue | Status | Notes |
|----------|-------|--------|-------|
| 🔴 HIGH | Hardcoded admin email | ⚠️ Pending | Implement role-based access control in database |
| 🔴 HIGH | Unprotected hospital routes | ✅ **FIXED** | Added `verifyAccessToken` middleware to `/api/hospitals` |
| 🔴 HIGH | Default JWT secrets | ✅ **FIXED** | Enhanced production validation for JWT_SECRET, REFRESH_TOKEN_SECRET, TOTP_ENCRYPTION_KEY |

### 11.2 Security Improvements

| Priority | Recommendation | Status |
|----------|----------------|--------|
| 🟡 MEDIUM | Implement RBAC (Role-Based Access Control) | ⚠️ Pending |
| 🟡 MEDIUM | Add password complexity requirements | ✅ **FIXED** - Min 8 chars, uppercase, lowercase, number, special char |
| 🟡 MEDIUM | Implement account lockout notifications | ✅ **FIXED** - Email sent on account lock |
| 🟢 LOW | Add login history viewing for users | ⚠️ Pending |
| 🟢 LOW | Implement trusted device management | ⚠️ Pending |

### 11.3 Code Quality

| Priority | Recommendation | Status |
|----------|----------------|--------|
| 🟡 MEDIUM | Split auth.controller.js (1590 lines) into smaller modules | ⚠️ Pending |
| 🟡 MEDIUM | Add comprehensive unit tests | ⚠️ Pending |
| 🟡 MEDIUM | Implement API documentation (Swagger/OpenAPI) | ⚠️ Pending |
| 🟢 LOW | Add ESLint + Prettier configuration | ⚠️ Pending |

### 11.4 Feature Enhancements

| Priority | Feature | Status |
|----------|---------|--------|
| 🟡 MEDIUM | Password reset via email | ⚠️ Pending |
| 🟡 MEDIUM | User activity dashboard | ⚠️ Pending |
| 🟢 LOW | Dark mode support | ⚠️ Pending |
| 🟢 LOW | Mobile responsive improvements | ⚠️ Pending |
| 🟢 LOW | Bulk patient export | ⚠️ Pending |

---

## 12. Compliance Assessment

### 12.1 HIPAA Considerations

| Requirement | Status | Notes |
|-------------|--------|-------|
| Access Control | ✅ | JWT + 2FA authentication |
| Audit Controls | ✅ | AuditLog model tracking |
| Transmission Security | ✅ | HTTPS required in production |
| Data Encryption | ⚠️ Partial | TOTP encrypted, patient data not |
| Automatic Logoff | ✅ | Session timeout + TTL |
| Unique User ID | ✅ | Hospital-based authentication |

### 12.2 GDPR Considerations

| Requirement | Status | Notes |
|-------------|--------|-------|
| Data Portability | ⚠️ Partial | PDF/ZIP export available |
| Right to Erasure | ✅ | 90-day auto-delete |
| Consent | ⚠️ Missing | No consent tracking |
| Data Minimization | ✅ | Only necessary data stored |

---

## Summary

This Hospital Management System demonstrates a well-architected full-stack application with strong security foundations, including:

✅ **Strengths:**
- Robust TOTP-based 2FA implementation
- Comprehensive audit logging
- Well-structured codebase with separation of concerns
- Rate limiting and brute-force protection
- Multi-tenant architecture with hospital isolation
- Automatic data cleanup (90-day retention)
- **Protected API endpoints with authentication** *(Fixed)*
- **Strong password complexity requirements** *(Fixed)*
- **Account lockout email notifications** *(Fixed)*
- **Production secrets validation** *(Fixed)*

⚠️ **Remaining Areas for Improvement:**
- Role-based access control needed (hardcoded admin check remains)
- Auth controller needs modularization
- Additional encryption for patient data at rest

**Overall Grade: A-** *(Upgraded from B+ after security fixes)*

---

### 📊 Fix Summary

| Category | Fixed | Pending |
|----------|-------|--------|
| Critical (HIGH) | 2 | 1 |
| Security (MEDIUM) | 2 | 1 |
| Code Quality | 0 | 4 |
| Features | 0 | 5 |

---

*Report generated by automated code analysis on December 30, 2025*
*Last updated: December 30, 2025 21:05 IST after implementing security fixes*
