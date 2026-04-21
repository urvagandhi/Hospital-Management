# Hospital Management System — Frontend Audit (Refreshed)

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-21 — TD-005 (pagination UX in `HospitalsList.tsx`) and TD-010 (dead files removed) landed after the initial audit pass. Sections marked 🛠️ where the code has moved on.
**Location:** `/frontend/`

---

## 0. Changes Since Previous Audit (2026-04-20)

| Area | Change | Pointer |
|---|---|---|
| Route count | **21 routes** (20 paths + catch-all) — prior audit said 24 | `00-drift.md` §6.1 |
| Catch-all | Renders `<NotFound />`, does NOT redirect to `/dashboard` | `00-drift.md` §6.2 |
| `/spinners-preview` | Route exists ([AppRoutes.tsx:59](../../frontend/src/routes/AppRoutes.tsx)) — unlinked design gallery, missing from prior audit §2 | §2 |
| `useDocumentTitle` rule | **7 violations** — Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode use `document.title =` directly; ForgotPassword has no title at all | `00-drift.md` §7.3 |
| Modal portal rule | All 8 expected modals verified `createPortal + z-[100]`. No violations. | `00-drift.md` §7.2 |
| `min-h-screen` rule | No violations inside MainLayout. | `00-drift.md` §7.1 |
| Dead code | `services/patientApi.ts` (all exports), `CountdownTimer`, `SkeletonLoader`, `Toast` components: 0 importers. `hospitalService.listAppVersions/createAppVersion/updateAppVersion`: 0 callers. | `01-dead-code.md` §C |
| Unused deps | `recharts`, `lucide-react` used ONLY by `/components-preview` | `01-dead-code.md` §A |

---

## 1. Tech Stack

React `^18.2.0` · TypeScript `^5.2.0` · Vite `^8.0.3` · React Router `^6.15.0` · Tailwind `^3.3.0` · Axios `^1.5.0` · `@headlessui/react ^2.2.9`. Deps `recharts ^3.8.1` and `lucide-react ^1.8.0` are loaded only by the design gallery page. ESM modules (`"type": "module"`). Strict TypeScript. No Redux/Zustand; state is React Context (`AuthProvider`) + browser storage.

---

## 2. Routing Map (Corrected)

| # | Path | Page | Guard | Inside MainLayout? | Line |
|---|---|---|---|---|---|
| 1 | `/` | `LandingPage` | — | ❌ | 31 |
| 2 | `/login` | `Login` | — | ❌ | 32 |
| 3 | `/register` | `HospitalRegistration` | AdminRoute | ❌ | 33-39 |
| 4 | `/verify-auth-code` | `VerifyAuthCode` | — | ❌ | 43 |
| 5 | `/change-password` | `ChangePassword` | — | ❌ | 46 |
| 6 | `/forgot-password` | `ForgotPassword` | — | ❌ | 49 |
| 7 | `/terms` | `Terms` | — | ❌ | 52 |
| 8 | `/privacy` | `Privacy` | — | ❌ | 53 |
| 9 | `/components-preview` | `ComponentsPreview` | — | ❌ | 56 |
| 10 | `/spinners-preview` | `LoadingSpinners` | — | ❌ | 59 |
| 11 | `/dashboard` | `Dashboard` | ProtectedRoute | ✅ | 69 |
| 12 | `/hospitals` | `HospitalsList` | ProtectedRoute + AdminRoute | ✅ | 70-76 |
| 13 | `/password` | `Password` | ProtectedRoute | ✅ | 78 |
| 14 | `/sessions` | `Sessions` | ProtectedRoute | ✅ | 79 |
| 15 | `/security` | Navigate → `/sessions` | ProtectedRoute | ✅ | 81 |
| 16 | `/activity` | `ActivityLog` | ProtectedRoute + AdminRoute | ✅ | 82-88 |
| 17 | `/profile` | `Profile` | ProtectedRoute | ✅ | 90 |
| 18 | `/notifications` | `NotificationSettings` | ProtectedRoute | ✅ | 91 |
| 19 | `/patients/:patientId` | `PatientDetails` | ProtectedRoute | ✅ | 92 |
| 20 | `/patients/:patientId/folders/:folderName` | `FolderView` | ProtectedRoute | ✅ | 93 |
| 21 | `*` | `NotFound` | — | ❌ | 97 |

---

## 3. Role-Based Features

Unchanged in substance from prior audit §3. Admin: `/register`, `/hospitals`, `/activity`. Everyone: `/dashboard`, `/patients/:id`, folder view, profile, password, sessions, notifications. Admin gate: `state.hospital?.role === "admin"` checked both in `AdminRoute.tsx` and in Navbar conditional render. Admin nav hidden on mobile (known gap per §10).

**Web is read-only for patient mutations** — file upload/rename/delete and Edit-Patient flow are commented out (see `02-commented-code.md` §1) per CLAUDE.md §11. Mobile app handles mutations.

---

## 4. Shared Components

Location: `/src/components/`.

**Live components:** `ProtectedRoute`, `AdminRoute`, `Navbar`, `MainLayout`, `LogoHeader`, `TextInput`, `OtpInput`, `Button`, `ErrorMessage`, `ErrorBoundary`, `ConfirmDialog`, `HospitalProfileModal`, `ZipSizeModal`, `PdfModeModal`, `DocumentViewer`, `NetworkStatus` (Provider + pill + banner), `PageLoader`, `Spinner`.

🛠️ **Dead components removed 2026-04-21 (TD-010):** `CountdownTimer.tsx`, `SkeletonLoader.tsx`, `Toast.tsx` deleted. `PasswordConfirmModal.tsx` was never on disk (stale reference from the prior audit text).

---

## 5. Forms & Validation

No schema library (zod/yup absent). Manual validation across pages: email regex, phone digit-count, password policy (8+ chars, class requirements), OTP 6-digit. Centralised helpers in [utils/validator.ts](../../frontend/src/utils/validator.ts).

Forms: Login, HospitalRegistration (2-step), Profile (non-sensitive + OTP contact-change), Password, HospitalEdit (modal), HospitalDelete (password + 10-char reason + literal "DELETE"), VerifyAuthCode (auto-submit at 6 digits), ForgotPassword (3-step).

---

## 6. State Management

**Auth state** in React Context (`AuthProvider` at [hooks/useAuth.tsx](../../frontend/src/hooks/useAuth.tsx)):

| Storage | Key | Content | Lifetime |
|---|---|---|---|
| sessionStorage | `accessToken` | JWT | cleared on browser/tab close or 401 |
| sessionStorage | `tempToken` | mid-flow JWT | until flow completes |
| localStorage | `hospital` | stringified hospital object (logoUrl stripped if > 1 KB) | persistent until logout / 401 `ACCOUNT_DISABLED` |
| httpOnly cookie | (refresh) | long-lived refresh token | server-managed |

15-minute inactivity timeout: `useInactivityTimeout(handleInactivityTimeout, state.isAuthenticated)` at [useAuth.tsx:211](../../frontend/src/hooks/useAuth.tsx).

**Access token in sessionStorage is XSS-exposed** — known watch-list item; flagged for redesign.

---

## 7. API Client Layer

`services/api.ts` — Axios wrapper, `baseURL = VITE_API_URL || "/api"`, `withCredentials: true`, request interceptor attaches `Authorization: Bearer <accessToken>` (falls back to tempToken), response interceptor handles 401 with refresh-mutex + subscriber queue (see diagram #7 in `03-architecture-diagrams.md`).

**Services (one file per domain):**
- `authService.ts` — login, OTP, session list/revoke, password, forgot-password.
- `hospitalService.ts` — profile, contact-change, notifications, admin force-delete, file signed-url/compressed. 🛠️ App-version CRUD exports removed 2026-04-21 (TD-010).
- `audit.service.ts` — `listAudits`, `listAuditActions`.
- 🛠️ `patientApi.ts` — **deleted** (TD-010). Dashboard and FolderView already used `api.get` / `api.getBlob` directly.

---

## 8. Layout Shell & Navigation

`MainLayout` provides `min-h-screen bg-gray-50` + fixed Navbar + `pt-16` for navbar offset. Pages inside **must** use `min-h-[calc(100vh-4rem)]`, not `min-h-screen`.

Navbar 3-column: LEFT (logo + HospitALL wordmark → /dashboard), CENTER (Dashboard + admin Hospitals), RIGHT (hospital chip with online dot, settings gear → Account/Security/Sign-out menu, avatar). No bell. No search. Admin nav hidden below md breakpoint (known gap).

Standalone pages (Login, VerifyAuthCode, ChangePassword, ForgotPassword, Privacy, Terms, LandingPage, HospitalRegistration, NotFound) live outside MainLayout. Their Back button must use `navigate(-1)` with `location.key !== "default"` fallback to `/` (not `navigate("/")` directly).

---

## 9. Architectural Rule Compliance

Per CLAUDE.md §8:

| Rule | Status |
|---|---|
| 1. `min-h-[calc(100vh-4rem)]` inside MainLayout | ✅ all 9 pages compliant |
| 2. Every full-viewport modal uses `createPortal(..., document.body)` + `z-[100]` | ✅ all 8 verified (see `00-drift.md` §7.2) |
| 3. Every page sets tab title via `useDocumentTitle` | ⚠️ **7 violations** — Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode use `document.title =`; ForgotPassword has no title at all |

Remediation: replace direct `document.title` assignments with the hook. Why it matters: the hook restores the prior title on unmount; direct assignment does not, so stale titles can leak on navigation.

---

## 10. Code Smells / Watch-List (unchanged from prior audit, still true)

1. No form-validation library.
2. Access token in sessionStorage (XSS).
3. Raw-div modals (no Headless UI Dialog) — acceptable now that all are portaled.
4. Unused deps (`recharts`, `lucide-react`) — gallery-only.
5. Manual UA parsing on /sessions.
6. Long ternary Tailwind class strings.
7. Admin nav hidden on mobile.
8. Frontend assumes `OTP_LENGTH = 6` as a constant; if backend changes, silent break.
9. Auto-delete is permanent — any "trash" UI needs a schema migration.
10. GeoIP uses a free public API; swap to a keyed service if volume grows.

**New watch-list items:**

11. `useDocumentTitle` rule is leaking (§9 above).
12. 🛠️ ~~`services/patientApi.ts` is dead code~~ — resolved (TD-010).
13. `ComponentsPreview.tsx` is 1600+ LOC and is the only route loading `recharts` + `lucide-react`. Route-split or extract.

---

## 11. Summary for Onward Work

### Strengths
- Shared design-token vocabulary (`bg-gradient-primary`, surface tokens, etc.) is fully adopted post-redesign.
- Portal rule enforced — no z-index wars with the navbar.
- Redesign marked COMPLETE 2026-04-21.

### Gaps
- 7 `useDocumentTitle` violations to fix.
- ~10 files / exports dead — candidates for pruning (`01-dead-code.md`).
- No E2E tests. No unit tests for pages or hooks.
- No form validation library.

---

## Appendix: File Tree

```
frontend/src/
├── App.tsx                 # ErrorBoundary → NetworkStatusProvider → AuthProvider → Router
├── main.tsx                # Vite entry
├── globals.css             # Tailwind directives
├── routes/AppRoutes.tsx    # 21 routes
├── layouts/MainLayout.tsx  # protected shell
├── components/             # 18 live + 4 dead (see §4)
├── pages/                  # 20 pages
├── services/               # api, authService, hospitalService, audit.service, patientApi(DEAD)
├── hooks/                  # useAuth, useDocumentTitle, useInactivityTimeout, useScrollToHash
├── types/auth.ts           # Hospital, LoginResponse, AuthState, etc.
├── config/constants.ts     # API_URL, OTP_LENGTH, timers
└── utils/                  # avatar, cloudinary, folderVisuals, persistentLogger, validator
```
