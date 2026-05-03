# Hospital Management System — Frontend Audit (Refreshed)

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21
**Last updated:** 2026-04-26 — refreshed against `main` after the 2026-04-21 → 2026-04-26 wave (TD-D3 access-token-in-memory, TD-009 useDocumentTitle sweep, TD-005 pagination UX, TD-010 dead-file removal, route-level ErrorBoundary, Sessions `lastSeenIp` + mobile-exempt idle filter, redesign-complete merge `b21b16d`). Sections marked 🛠️ where the code has moved on.
**Location:** `/frontend/`

---

## 0. Changes Since Previous Audit (2026-04-20)

| Area                            | Change                                                                                                                                                                                                                                                                        | Pointer              |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Route count                     | **21 routes** (20 paths + catch-all) — prior audit said 24; CLAUDE.md still cites 24, that count is loose                                                                                                                                                                     | `00-drift.md` §6.1   |
| Catch-all                       | Renders `<NotFound />`, does NOT redirect to `/dashboard`                                                                                                                                                                                                                     | `00-drift.md` §6.2   |
| `/spinners-preview`             | Route exists ([AppRoutes.tsx:77-84](../../frontend/src/routes/AppRoutes.tsx)) — unlinked design gallery, lazy-loaded along with `/components-preview`                                                                                                                         | §2                   |
| `useDocumentTitle` rule         | 🛠️ **All 21 pages compliant** (TD-009 swept 2026-04-21 in `2194f0e`). Prior 7 violators (Dashboard, Login, Password, Profile, Sessions, VerifyAuthCode, ForgotPassword) all switched.                                                                                         | §9                   |
| Access-token storage            | 🛠️ **In-memory** in [api.ts](../../frontend/src/services/api.ts) (TD-D3, 2026-04-25, `621ca05`) — `_accessToken` module variable. `sessionStorage.accessToken` is gone. Refresh cookie bootstraps a fresh token on tab/refresh inside `AuthProvider`.                         | §6                   |
| Sessions list                   | 🛠️ Renders `lastSeenIp` alongside `ipAddress` (`7377d76`); web sessions idle > 60 min are filtered out, mobile sessions are exempt (`61fa6ad`).                                                                                                                               | §3                   |
| ErrorBoundary                   | 🛠️ Two-layer: top-level in [App.tsx](../../frontend/src/App.tsx), inner one wrapping `<Outlet />` in [MainLayout.tsx](../../frontend/src/layouts/MainLayout.tsx) keyed by `location.pathname` so a render error on one authenticated route can't blank the shell (`8fbab6a`). | §8                   |
| Modal portal rule               | All 8 expected modals verified `createPortal + z-[100]`. No violations.                                                                                                                                                                                                       | `00-drift.md` §7.2   |
| `min-h-screen` rule             | No violations inside MainLayout.                                                                                                                                                                                                                                              | `00-drift.md` §7.1   |
| Dead code                       | `services/patientApi.ts` (all exports), `CountdownTimer`, `SkeletonLoader`, `Toast` components: 0 importers. `hospitalService.listAppVersions/createAppVersion/updateAppVersion`: 0 callers.                                                                                  | `01-dead-code.md` §C |
| Gallery-only deps (intentional) | `recharts`, `lucide-react` used ONLY by `/components-preview` and isolated to a `React.lazy` chunk (TD-011 shipped). Kept by decision; zero bytes in main bundle.                                                                                                             | `01-dead-code.md` §A |

---

## 1. Tech Stack

React `^18.2.0` · TypeScript `^5.2.0` · Vite `^8.0.3` · React Router `^6.15.0` · Tailwind `^3.3.0` · Axios `^1.5.0` · `@headlessui/react ^2.2.9`. Deps `recharts ^3.8.1` and `lucide-react ^1.8.0` are loaded only by the design gallery page (code-split into a lazy chunk — TD-011; not in the main bundle). ESM modules (`"type": "module"`). Strict TypeScript. No Redux/Zustand; state is React Context (`AuthProvider`) + browser storage.

---

## 2. Routing Map (Corrected)

| #   | Path                                       | Page                   | Guard                       | Inside MainLayout? | Line  |
| --- | ------------------------------------------ | ---------------------- | --------------------------- | ------------------ | ----- |
| 1   | `/`                                        | `LandingPage`          | —                           | ❌                 | 31    |
| 2   | `/login`                                   | `Login`                | —                           | ❌                 | 32    |
| 3   | `/register`                                | `HospitalRegistration` | AdminRoute                  | ❌                 | 33-39 |
| 4   | `/verify-auth-code`                        | `VerifyAuthCode`       | —                           | ❌                 | 43    |
| 5   | `/change-password`                         | `ChangePassword`       | —                           | ❌                 | 46    |
| 6   | `/forgot-password`                         | `ForgotPassword`       | —                           | ❌                 | 49    |
| 7   | `/terms`                                   | `Terms`                | —                           | ❌                 | 52    |
| 8   | `/privacy`                                 | `Privacy`              | —                           | ❌                 | 53    |
| 9   | `/components-preview`                      | `ComponentsPreview`    | —                           | ❌                 | 56    |
| 10  | `/spinners-preview`                        | `LoadingSpinners`      | —                           | ❌                 | 59    |
| 11  | `/dashboard`                               | `Dashboard`            | ProtectedRoute              | ✅                 | 69    |
| 12  | `/hospitals`                               | `HospitalsList`        | ProtectedRoute + AdminRoute | ✅                 | 70-76 |
| 13  | `/password`                                | `Password`             | ProtectedRoute              | ✅                 | 78    |
| 14  | `/sessions`                                | `Sessions`             | ProtectedRoute              | ✅                 | 79    |
| 15  | `/security`                                | Navigate → `/sessions` | ProtectedRoute              | ✅                 | 81    |
| 16  | `/activity`                                | `ActivityLog`          | ProtectedRoute + AdminRoute | ✅                 | 82-88 |
| 17  | `/profile`                                 | `Profile`              | ProtectedRoute              | ✅                 | 90    |
| 18  | `/notifications`                           | `NotificationSettings` | ProtectedRoute              | ✅                 | 91    |
| 19  | `/patients/:patientId`                     | `PatientDetails`       | ProtectedRoute              | ✅                 | 92    |
| 20  | `/patients/:patientId/folders/:folderName` | `FolderView`           | ProtectedRoute              | ✅                 | 93    |
| 21  | `*`                                        | `NotFound`             | —                           | ❌                 | 97    |

---

## 3. Role-Based Features

Unchanged in substance from prior audit §3. Admin: `/register`, `/hospitals`, `/activity`. Everyone: `/dashboard`, `/patients/:id`, folder view, profile, password, sessions, notifications. Admin gate: `state.hospital?.role === "admin"` checked both in `AdminRoute.tsx` and in Navbar conditional render. Admin nav hidden on mobile (known gap per §10).

**Web is read-only for patient mutations** — file upload/rename/delete and Edit-Patient flow are commented out (see `02-commented-code.md` §1) per CLAUDE.md §11. Mobile app handles mutations.

**Sessions page (`/sessions`)** shows `lastSeenIp` next to `ipAddress` so users can spot a session roaming networks (mobile-only signal — Cloudflare-aware `getClientIp` updates `lastSeenIp` on each request). Web sessions whose `lastSeenAt` is older than 60 min are hidden because the server-side idle sweep is about to revoke them; mobile sessions are exempt because backgrounded mobile apps look idle but are alive (verified [auth.controller.js:1563-1581](../../backend/src/controllers/auth.controller.js)).

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

| Storage         | Key                                                            | Content                                                                                                  | Lifetime                                                                                     |
| --------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| module memory   | `_accessToken` in [api.ts](../../frontend/src/services/api.ts) | 24h JWT (TD-D3)                                                                                          | tab lifetime; bootstrapped on cold start via `/auth/refresh-token` + httpOnly refresh cookie |
| sessionStorage  | `tempToken`                                                    | mid-flow JWT (login step 2 / first-login password change)                                                | until flow completes                                                                         |
| sessionStorage  | `resetToken`                                                   | forgot-password mid-flow JWT                                                                             | until flow completes                                                                         |
| localStorage    | `hospital`                                                     | stringified hospital object (logoUrl stripped if > 1 KB)                                                 | persistent until logout / 401 `ACCOUNT_DISABLED`                                             |
| httpOnly cookie | (refresh)                                                      | rotated 365d refresh token (TD-002 — rotated on every `/auth/refresh-token`, reuse revokes all sessions) | server-managed                                                                               |

15-minute client-side inactivity timeout: `useInactivityTimeout(handleInactivityTimeout, state.isAuthenticated)` at [useAuth.tsx:211](../../frontend/src/hooks/useAuth.tsx). Backend additionally runs a 60-min server-side idle sweep against web sessions only ([jobs/idleSweep.job.js](../../backend/src/jobs/idleSweep.job.js)).

🛠️ ~~Access token in sessionStorage is XSS-exposed~~ — RESOLVED 2026-04-25 (TD-D3, `621ca05`). Token now lives in a module-scoped variable inside `api.ts` and never touches `sessionStorage`/`localStorage`. XSS exfiltration window shrunk from "24h refreshable" to "tab lifetime + attacker JS resident".

---

## 7. API Client Layer

`services/api.ts` — Axios wrapper, `baseURL = VITE_API_URL || "/api"`, `withCredentials: true`, request interceptor reads the access token from the module-scoped `_accessToken` variable (TD-D3) and attaches `Authorization: Bearer <accessToken>` (falls back to tempToken from sessionStorage), response interceptor handles 401 with refresh-mutex + subscriber queue (see diagram #7 in `03-architecture-diagrams.md`). Exports `setAccessToken` / `getAccessToken` / `clearAccessToken` for `AuthProvider` to drive the lifecycle.

**Services (one file per domain):**

- `authService.ts` — login, OTP, session list/revoke, password, forgot-password.
- `hospitalService.ts` — profile, contact-change, notifications, admin force-delete, file signed-url/compressed. 🛠️ App-version CRUD exports removed 2026-04-21 (TD-010).
- `audit.service.ts` — `listAudits`, `listAuditActions`.
- 🛠️ `patientApi.ts` — **deleted** (TD-010). Dashboard and FolderView already used `api.get` / `api.getBlob` directly.

---

## 8. Layout Shell & Navigation

`MainLayout` provides `min-h-screen bg-gray-50` + fixed Navbar + `pt-16` for navbar offset. Pages inside **must** use `min-h-[calc(100vh-4rem)]`, not `min-h-screen`.

Navbar 3-column: LEFT (logo + MediVault wordmark → /dashboard), CENTER (Dashboard + admin Hospitals), RIGHT (hospital chip with online dot, settings gear → Account/Security/Sign-out menu, avatar). No bell. No search. Admin nav hidden below md breakpoint (known gap).

Standalone pages (Login, VerifyAuthCode, ChangePassword, ForgotPassword, Privacy, Terms, LandingPage, HospitalRegistration, NotFound) live outside MainLayout. Their Back button must use `navigate(-1)` with `location.key !== "default"` fallback to `/` (not `navigate("/")` directly).

🛠️ **Route-level error containment (2026-04-25, `8fbab6a`).** [App.tsx](../../frontend/src/App.tsx) wraps everything in a top-level `<ErrorBoundary>`, and [MainLayout.tsx](../../frontend/src/layouts/MainLayout.tsx) wraps `<Outlet />` in a second `<ErrorBoundary key={location.pathname} fullScreen={false}>`. The `key={pathname}` remounts the inner boundary on every navigation so a crashed page clears when the user navigates away. Don't remove either layer — the inner boundary is the difference between "broken page" and "white screen of death".

---

## 9. Architectural Rule Compliance

Per CLAUDE.md §8:

| Rule                                                                             | Status                                                                  |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 1. `min-h-[calc(100vh-4rem)]` inside MainLayout                                  | ✅ all 9 pages compliant                                                |
| 2. Every full-viewport modal uses `createPortal(..., document.body)` + `z-[100]` | ✅ all 8 verified (see `00-drift.md` §7.2)                              |
| 3. Every page sets tab title via `useDocumentTitle`                              | 🛠️ ✅ **All 21 pages compliant** (TD-009 swept 2026-04-21 in `2194f0e`) |

Why it matters: the hook restores the prior title on unmount; direct assignment does not, so stale titles can leak on navigation. New pages MUST call `useDocumentTitle("...")` — never assign `document.title` directly.

---

## 10. Code Smells / Watch-List (unchanged from prior audit, still true)

1. No form-validation library.
2. 🛠️ ~~Access token in sessionStorage (XSS)~~ — RESOLVED 2026-04-25 (TD-D3, `621ca05`). In-memory now; bootstrapped via httpOnly refresh cookie.
3. Raw-div modals (no Headless UI Dialog) — acceptable now that all are portaled.
4. `recharts` + `lucide-react` — gallery-only but **intentionally retained + lazy-loaded** (TD-011 shipped 2026-04-21 in `4fc39f3`). Zero main-bundle cost. Not a smell — do not re-flag.
5. Manual UA parsing on /sessions.
6. Long ternary Tailwind class strings.
7. Admin nav hidden on mobile.
8. Frontend assumes `OTP_LENGTH = 6` as a constant; if backend changes, silent break.
9. Auto-delete is permanent — any "trash" UI needs a schema migration.
10. 🛠️ ~~GeoIP uses a free public API~~ — RESOLVED 2026-04-25 (TD-027). Keyed `ipinfo.io` first, `ip-api.com` fallback.

**New watch-list items:**

11. 🛠️ ~~`useDocumentTitle` rule is leaking~~ — RESOLVED 2026-04-21 (TD-009). All 21 pages compliant.
12. 🛠️ ~~`services/patientApi.ts` is dead code~~ — resolved (TD-010).
13. `ComponentsPreview.tsx` is 1600+ LOC and is the only route loading `recharts` + `lucide-react`. **Route-split shipped 2026-04-21 (TD-011)** — file itself is still oversized; extraction tracked separately as TD-026.

---

## 11. Summary for Onward Work

### Strengths

- Shared design-token vocabulary (`bg-gradient-primary`, surface tokens, etc.) is fully adopted post-redesign.
- Portal rule enforced — no z-index wars with the navbar.
- Redesign marked COMPLETE 2026-04-21 (`b21b16d` merge to main).
- All three architectural rules from CLAUDE.md §8 (calc-height, portaled modals, `useDocumentTitle`) are now clean.
- Access token off the disk (TD-D3); two-layer ErrorBoundary keeps single-page crashes from blanking the shell.

### Gaps

- ~10 files / exports dead — candidates for pruning (`01-dead-code.md`).
- No E2E tests. No unit tests for pages or hooks.
- No form validation library.
- `ComponentsPreview.tsx` still oversized (TD-026 tracking the extraction; route is already lazy so impact is contained).

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
