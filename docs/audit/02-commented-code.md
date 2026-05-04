# Commented Code Audit — MyMediVault

**Verified at commit:** `defa74a` (2026-04-17)
**Audit date:** 2026-04-21

**Classification taxonomy:**

- `INTENTIONAL_FEATURE_HOLD` — feature is built, disabled by design, documented somewhere. **Keep.**
- `DEPRECATED` — old implementation kept next to the replacement. **Schedule deletion.**
- `DEBUG_LEFTOVER` — `console.log` / `print` / throwaway. **Delete.**
- `TODO_PLACEHOLDER` — stub with a nearby TODO/FIXME. **Convert to ticket or delete.**
- `UNKNOWN` — intent unclear. **Requires user decision.**

---

## 1. `INTENTIONAL_FEATURE_HOLD` — Protected, Do Not Delete

These are explicitly documented in CLAUDE.md §8 as intentional; they must not be removed without architecture discussion.

| Path:Lines                                                                          | Preview                                                                                                                                                                                                | Enclosing context                                     | Reasoning                                                                                                                                                                              |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [PatientDetails.tsx:63-67](../../frontend/src/pages/PatientDetails.tsx#L63-L67)     | `// const [editOpen, setEditOpen] = useState(false);`<br>`// const [editForm, setEditForm] = useState({ patientName: "", remarks: "" });`<br>`// const [editSaving, setEditSaving] = useState(false);` | `PatientDetails` component — Edit-Patient state block | Block #1 of the four intentional holds. Marked in CLAUDE.md §8: "the Edit-Patient button + modal are intentionally commented out … web stays read-only for patient mutations per §11." |
| [PatientDetails.tsx:68-109](../../frontend/src/pages/PatientDetails.tsx#L68-L109)   | `// const openEdit = () => { ... }`<br>`// const saveEdit = async (e: FormEvent) => { ... }`                                                                                                           | `PatientDetails` component — Edit handlers            | Block #2. Matching handlers for the disabled flow.                                                                                                                                     |
| [PatientDetails.tsx:385-406](../../frontend/src/pages/PatientDetails.tsx#L385-L406) | `{/* Edit Patient — mobile-only (CLAUDE.md §11). Uncomment to re-enable.`<br>`<button type="button" ... >`                                                                                             | `PatientDetails` render — Edit button JSX             | Block #3. Explicit re-enable marker.                                                                                                                                                   |
| [PatientDetails.tsx:569-636](../../frontend/src/pages/PatientDetails.tsx#L569-L636) | `{/* Edit Patient modal — mobile-only (CLAUDE.md §11). Uncomment to re-enable on web.`<br>`{editOpen && (<div ... />)} */}`                                                                            | `PatientDetails` render — Edit modal JSX              | Block #4. The modal itself.                                                                                                                                                            |

**Intentional commented code — for the README/CLAUDE.md:**

> `frontend/src/pages/PatientDetails.tsx` has four intentionally-commented blocks (state at L63-67, handlers at L68-109, button at L385-406, modal at L569-636) for the Edit-Patient flow. Web stays read-only per §11; uncomment all four to re-enable. Do not remove them without moving the mutation surface off mobile-only.

---

## 2. `DEPRECATED` — Safe to Delete (Replacement in Place)

| Path:Lines                                                                          | Preview                                                                                       | Enclosing context       | Reasoning                                                                                                              |
| ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| [PatientDetails.tsx:271-277](../../frontend/src/pages/PatientDetails.tsx#L271-L277) | `// const patientInitials = patient.patientName`<br>`//   .split(" ")`<br>`//   .slice(0, 2)` | `PatientDetails` render | Orphaned avatar-initials computation. The render now uses the generic hospital-icon avatar (L312-317). Safe to delete. |
| [Dashboard.tsx:334-349](../../frontend/src/pages/Dashboard.tsx#L334-L349)           | `{/* <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1"> ... */}`           | Dashboard header        | Old subtitle JSX replaced by simpler greeting (L331-333). Safe to delete.                                              |

---

## 3. `DEBUG_LEFTOVER`

None found in `backend/src/`, `frontend/src/`, or `compression-service/app/`. No `console.log`, `console.debug`, or `print()` calls discovered inside comment blocks.

---

## 4. `TODO_PLACEHOLDER` / TODO-FIXME Inventory

Aggregate of `TODO`, `FIXME`, `HACK`, `XXX`, `NOTE:` markers across all in-scope directories:

| Path:Line                                                    | Comment                                                                       | Type                             |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------- |
| [utils/avatar.ts:24](../../frontend/src/utils/avatar.ts#L24) | `* NOTE: callers must render this WITHOUT a 'bg-gradient-to-br' prefix — the` | NOTE (documentation, not a task) |

**Total active markers:** 1 NOTE, 0 TODOs, 0 FIXMEs, 0 HACKs. The codebase is remarkably clean of in-code task markers — work is tracked elsewhere (likely `memory/` files and CLAUDE.md).

---

## 5. Multi-line Docstring / Header Comments (Not Code — Informational)

For completeness — not subject to deletion/action. These are JSDoc / file-header prose comments:

- [Dashboard.tsx:1-9](../../frontend/src/pages/Dashboard.tsx) — JSDoc
- [Profile.tsx:1-13](../../frontend/src/pages/Profile.tsx) — JSDoc with flow explanation
- [HospitalRegistration.tsx:1-9](../../frontend/src/pages/HospitalRegistration.tsx) — JSDoc
- [FolderView.tsx:324-326](../../frontend/src/pages/FolderView.tsx) — inline prose
- [patient.controller.js:1-35](../../backend/src/controllers/patient.controller.js) — JSDoc + fire-and-forget audit comment

---

## 6. `UNKNOWN` — Needs Your Decision

**None.** Every commented block encountered was classifiable as intentional, deprecated, or pure documentation. No ambiguous blocks requiring a judgement call.

---

## 7. Summary

| Classification             | Count                                     | Notes                                                                                               |
| -------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `INTENTIONAL_FEATURE_HOLD` | 4 blocks (frontend) + 1 (Android, see §8) | All in `PatientDetails.tsx` on the web; Android has `DownloadWorker.pollUntilReady` dormant branch. |
| `DEPRECATED`               | 2 blocks                                  | Small; safe to delete on next `PatientDetails.tsx` / `Dashboard.tsx` touch.                         |
| `DEBUG_LEFTOVER`           | 0                                         | Clean.                                                                                              |
| `TODO_PLACEHOLDER`         | 0                                         | Clean.                                                                                              |
| `UNKNOWN`                  | 0                                         | No decisions needed.                                                                                |

**No user decisions required.** The codebase is well-curated; the only commented code is either explicitly intentional or trivially stale (replaced inline).

---

## 8. Android commented code

Added 2026-04-24. Systematic scan of `android-app/app/src/main/java` for commented-out code (not KDoc / file-header prose).

### 8.1 What was searched

- `^\s*//\s*(val|var|fun|private|public|if|while|for|return|when|class)` — line-commented code patterns.
- `/\* … \*/` multi-line blocks outside KDoc (`/** … */`).
- `<!-- … -->` blocks in layout XML.
- Any `TODO` / `FIXME` / `HACK` / `XXX` markers.

### 8.2 Findings

| Classification             | Count        | Notes                                                                                                                                                   |
| -------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `INTENTIONAL_FEATURE_HOLD` | 1 (see §8.3) | `DownloadWorker.pollUntilReady` — not strictly _commented_, but the entire polling branch is unreachable today and deliberately preserved for Phase 3C. |
| `DEPRECATED`               | 0            | —                                                                                                                                                       |
| `DEBUG_LEFTOVER`           | 0            | No leftover `Log.d` / `println` in comments.                                                                                                            |
| `TODO_PLACEHOLDER`         | 0            | **Zero** `TODO` / `FIXME` / `HACK` / `XXX` markers across 77 Kotlin files.                                                                              |
| `UNKNOWN`                  | 0            | —                                                                                                                                                       |

Everything else matched by the regex is KDoc (`/** … */`), section-banner comments (`// ─── … ───`), or inline rationale comments (`/* best-effort */`, `/* ignore */`) — all prose, not disabled code.

### 8.3 Intentional feature hold — document in CLAUDE.md

> [`android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt`](../../android-app/app/src/main/java/com/hospital/management/worker/DownloadWorker.kt) lines 541-608 implement a Cloud-Run-style `pollUntilReady(statusUrl)` branch that is unreachable today — no caller passes `KEY_STATUS_URL`. The branch is deliberately preserved for the compression-sidecar **Phase 3C** integration (pre-rendered signed-URL fetch-after-ready flow). Do not remove it without a coordinated decision with the sidecar team.

This is the same class of "intentional hold" as `PatientDetails.tsx` on the web — kept for a planned feature, not dead.

### 8.4 Android code-hygiene note

The Android tree is the cleanest surface in the codebase by this metric: zero `TODO`/`FIXME` markers, zero commented-out `val`/`var`/`fun` lines, zero leftover debug prints. Every non-KDoc comment is either a banner, a rationale, or a `// Why:` explaining a specific design trade-off (see `SessionManager.logoutUser` lines 100-121, `AuthInterceptor.intercept` lines 96-120, `DocumentDao.resetStuckUploading` lines 48-50).
