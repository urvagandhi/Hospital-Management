# Hospital Management System — Audit Index

**Verified at commit:** `1b3bf22` (branch `feat/redesign-and-platform-upgrades`, 2026-04-24) · backend/frontend/sidecar sections retained from `defa74a` (2026-04-17)
**Audit date:** 2026-04-21 (backend/frontend/sidecar) + 2026-04-24 (Android)
**Last updated:** 2026-04-24 (Android audit added — 20 Android-specific items `TD-A01..TD-A20`; see Android entries below)

## Status strip (what's landed since the audit)

| ID | Title | Status |
|---|---|---|
| TD-002 | Refresh-token rotation + reuse detection | ✅ Shipped |
| TD-004 | `.env.example` hygiene | ✅ Shipped |
| TD-005 | `/api/hospitals` pagination + server search | ✅ Shipped |
| TD-010 | Delete dead frontend code | ✅ Shipped |
| TD-012 | Remove unused backend deps (`@getbrevo/brevo`, `axios`) | ✅ Shipped |
| TD-013 | Prune dead `AuditLog` enum members | ✅ Shipped |
| TD-001 | Audit logging on 8 mutation endpoints | ⏳ Open |
| TD-003 | Delete `r2.service.js` + AWS SDK deps | ⏳ Open |
| TD-006…TD-027 | Quarter + backlog items | ⏳ Open (see `06-tech-debt-ledger.md`) |

Multi-tenant hospital records system. Node/Express backend + React/Vite web + Kotlin Android app + Python FastAPI compression sidecar. Primary mutation surface is mobile; web is read-mostly admin. This audit set was generated as a forensic re-audit: every factual claim is verified against code on disk, with `path:line` citations throughout. The audit scope originally covered `backend/`, `frontend/`, and `compression-service/` (2026-04-21); **`android-app/` was added 2026-04-24** via [`android.md`](android.md) + Android sections in every numbered ledger (`01-dead-code §J`, `02-commented-code §8`, `03-architecture-diagrams §18-§30`, `04-enhancements §6`, `06-tech-debt-ledger TD-A01..TD-A20`, `00-drift §12`).

## Audit Metadata

| Field | Value |
|---|---|
| Commit verified | `defa74a` (2026-04-17) |
| Audit date | 2026-04-21 |
| Files analysed | 125 source files (`.js`, `.ts`, `.tsx`, `.py`) |
| Approximate LOC | Backend ~15k · Frontend ~12k · Sidecar ~2k |
| Previous audit date | 2026-04-20 (superseded by the refreshed docs in this directory) |

## Table of Contents

1. [`00-drift.md`](00-drift.md) — Drift detection vs prior audit docs (what the old audit got wrong or missed)
2. [`01-dead-code.md`](01-dead-code.md) — Unused deps, orphaned exports, dead endpoints, dead env vars
3. [`02-commented-code.md`](02-commented-code.md) — Every commented-out code block classified
4. [`03-architecture-diagrams.md`](03-architecture-diagrams.md) — 17 Mermaid diagrams (system context, ER, flows, state machines)
5. [`04-enhancements.md`](04-enhancements.md) — Security (OWASP mapped) / performance / quality / onboarding / scaling cliffs
6. [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) — Prioritised backlog (🔥 This Week · 📅 This Quarter · 🧹 Backlog Polish · 🤔 Discuss First)
7. [`backend.md`](backend.md) — Refreshed backend audit (ground-truth endpoint tables, schemas, env)
8. [`frontend.md`](frontend.md) — Refreshed frontend audit (routes, components, architectural rule compliance)
9. [`features.md`](features.md) — Refreshed end-to-end feature map (UI → API → DB)
10. [`android.md`](android.md) — **Android audit** (build, architecture, screens, API contracts, auth, security, perf, quirks) — added 2026-04-24

> CLAUDE.md has been updated in place with the critical fact-corrections from this audit. The previous delta file `05-claude-md-update.md` is no longer present.

## Read This If…

| You are… | Start here |
|---|---|
| **Onboarding** a new senior engineer | [`04-enhancements.md`](04-enhancements.md) §5.9 "Onboarding Friction" — gives the 15-file read order + the 5 surprising behaviours + the 3 "here be dragons" zones |
| **Handling a production incident** | [`04-enhancements.md`](04-enhancements.md) §5.8 "Failure Mode Catalog" + [`03-architecture-diagrams.md`](03-architecture-diagrams.md) §1 (system context) and §9-11 (compression / download / auto-delete) |
| **Planning a security sprint** | [`04-enhancements.md`](04-enhancements.md) §5.1 (OWASP table) + [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) 🔥 section — start with SEC-004 (refresh rotation) and SEC-020 (audit logging gaps) |
| **Pruning dead code** | [`01-dead-code.md`](01-dead-code.md) — "Quick Wins" section at the bottom; ~1 hour of work |
| **Mapping out a scale-up plan** | [`04-enhancements.md`](04-enhancements.md) §5.2 Perf + §5.10 Scaling Cliffs |
| **Building on top of the API** | [`backend.md`](backend.md) §4 (corrected endpoint tables) + [`features.md`](features.md) (user-facing flows) |
| **Working on the web redesign next iteration** | [`frontend.md`](frontend.md) §9 (architectural rule compliance) + [`02-commented-code.md`](02-commented-code.md) (intentional holds not to touch) |
| **Investigating the compression sidecar** | [`03-architecture-diagrams.md`](03-architecture-diagrams.md) §9 (pipeline) + [`backend.md`](backend.md) §9 (sidecar section) + `06-tech-debt-ledger.md` TD-014/TD-015 |
| **Onboarding to Android** | [`android.md`](android.md) §10 "Read this first" — 12-file read order. Then [`android.md`](android.md) §9 "Notable quirks" + [`03-architecture-diagrams.md`](03-architecture-diagrams.md) §§18-30 |
| **Cutting a Play Store release** | [`android.md`](android.md) §1.1 red flags + [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) `TD-A01..TD-A03` (critical pre-upload blockers) + [`04-enhancements.md`](04-enhancements.md) §6.8 Play Store compliance checklist |
| **Debugging a release-only Android crash** | [`android.md`](android.md) §9 quirk 1 (R8 rules load-bearing) + [`04-enhancements.md`](04-enhancements.md) AND-O01 (no crash reporter yet) + `FileLogger` pull via `adb pull /sdcard/Android/data/com.hospital.management/files/logs/` |
| **Android API contract drift vs backend** | [`android.md`](android.md) §4.3 + [`00-drift.md`](00-drift.md) §12 |
| **Wanting the "what changed since last audit" delta** | [`00-drift.md`](00-drift.md) §11 "Summary of Drift — Top 10" + §12 (Android) |

## Top 5 Critical Findings — updated status

1. **Audit logging missing on 8 mutation endpoints** — ⏳ OPEN. Still violates the §12 convention. See [`00-drift.md`](00-drift.md) §10 + ledger item TD-001.
2. **Refresh tokens are not rotated** — ✅ FIXED (TD-002). Rotation + reuse detection shipped in [`token.service.js`](../../backend/src/services/token.service.js). Replay of a stolen refresh token now revokes all active sessions and alerts the hospital by email.
3. **`GET /api/hospitals` has no pagination** — ✅ FIXED (TD-005). Cursor pagination + server-side search + first-page totals shipped; admin UI loads 50 rows at a time with debounced server search.
4. **`.env.example` drift** — ✅ FIXED (TD-004). 13 dead vars removed, 11 undocumented vars added, `REFRESH_TOKEN_EXPIRY` corrected to `365d`.
5. **`r2.service.js` + AWS SDK deps** — ⏳ OPEN (TD-003). Still 260 lines + 2 heavy deps with no callers; separate cleanup pending.

## User Decisions Needed

**None of the commented-code blocks require a decision** — the only `INTENTIONAL_FEATURE_HOLD` (PatientDetails Edit-Patient flow, 4 blocks) is documented in CLAUDE.md §8. See [`02-commented-code.md`](02-commented-code.md) §6.

Five architectural decisions in [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) 🤔 Discuss First section DO need human judgement: soft-delete policy, web Edit-Patient re-enable, sessionStorage vs httpOnly, sidecar required-in-prod, multi-replica HA.

## Android — top 5 Critical findings (2026-04-24)

1. **🔴 Release signing uses the debug keystore** ([app/build.gradle:36-41](../../android-app/app/build.gradle)) — blocks Play Store. Tracked `TD-A01`.
2. **🔴 `release.keystore` committed to the repo** — `git ls-files android-app/release.keystore` confirms. Tracked `TD-A02`.
3. **🔴 `versionCode 1` never bumped + `targetSdk 34`** — fails second Play upload + Aug 2025 deadline. Tracked `TD-A03`.
4. **🟠 No crash reporter in release** — only on-device `FileLogger`. April 2026 release-login crash took days to diagnose. Tracked `TD-A14`.
5. **🟠 `AuthInterceptor` 401 classification via body-substring match** ([AuthInterceptor.kt:96-120](../../android-app/app/src/main/java/com/hospital/management/data/api/AuthInterceptor.kt)) — any server-side message reword silently breaks SESSION_CONFLICT / AUTH_CODE_REQUIRED dispatch. Tracked `TD-A07`.

See [`android.md`](android.md) §1.1 for the full red-flag list and [`06-tech-debt-ledger.md`](06-tech-debt-ledger.md) Android backlog (`TD-A01..TD-A20`) for the prioritised remediation plan.

## Document Count

**10 audit files** (plus this index) under `docs/audit/`. All files parseable as GitHub-flavored Markdown; Mermaid diagrams in `03-architecture-diagrams.md` (§1-§17 backend/web/sidecar + §18-§30 Android = 30 total) render with any CommonMark + Mermaid viewer.
