# Commented Code Audit — Hospital Management System

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

| Path:Lines | Preview | Enclosing context | Reasoning |
|---|---|---|---|
| [PatientDetails.tsx:63-67](../../frontend/src/pages/PatientDetails.tsx#L63-L67) | `// const [editOpen, setEditOpen] = useState(false);`<br>`// const [editForm, setEditForm] = useState({ patientName: "", remarks: "" });`<br>`// const [editSaving, setEditSaving] = useState(false);` | `PatientDetails` component — Edit-Patient state block | Block #1 of the four intentional holds. Marked in CLAUDE.md §8: "the Edit-Patient button + modal are intentionally commented out … web stays read-only for patient mutations per §11." |
| [PatientDetails.tsx:68-109](../../frontend/src/pages/PatientDetails.tsx#L68-L109) | `// const openEdit = () => { ... }`<br>`// const saveEdit = async (e: FormEvent) => { ... }` | `PatientDetails` component — Edit handlers | Block #2. Matching handlers for the disabled flow. |
| [PatientDetails.tsx:385-406](../../frontend/src/pages/PatientDetails.tsx#L385-L406) | `{/* Edit Patient — mobile-only (CLAUDE.md §11). Uncomment to re-enable.`<br>`<button type="button" ... >` | `PatientDetails` render — Edit button JSX | Block #3. Explicit re-enable marker. |
| [PatientDetails.tsx:569-636](../../frontend/src/pages/PatientDetails.tsx#L569-L636) | `{/* Edit Patient modal — mobile-only (CLAUDE.md §11). Uncomment to re-enable on web.`<br>`{editOpen && (<div ... />)} */}` | `PatientDetails` render — Edit modal JSX | Block #4. The modal itself. |

**Intentional commented code — for the README/CLAUDE.md:**

> `frontend/src/pages/PatientDetails.tsx` has four intentionally-commented blocks (state at L63-67, handlers at L68-109, button at L385-406, modal at L569-636) for the Edit-Patient flow. Web stays read-only per §11; uncomment all four to re-enable. Do not remove them without moving the mutation surface off mobile-only.

---

## 2. `DEPRECATED` — Safe to Delete (Replacement in Place)

| Path:Lines | Preview | Enclosing context | Reasoning |
|---|---|---|---|
| [PatientDetails.tsx:271-277](../../frontend/src/pages/PatientDetails.tsx#L271-L277) | `// const patientInitials = patient.patientName`<br>`//   .split(" ")`<br>`//   .slice(0, 2)` | `PatientDetails` render | Orphaned avatar-initials computation. The render now uses the generic hospital-icon avatar (L312-317). Safe to delete. |
| [Dashboard.tsx:334-349](../../frontend/src/pages/Dashboard.tsx#L334-L349) | `{/* <p className="text-sm text-neutral-500 flex items-center gap-2 mt-1"> ... */}` | Dashboard header | Old subtitle JSX replaced by simpler greeting (L331-333). Safe to delete. |

---

## 3. `DEBUG_LEFTOVER`

None found in `backend/src/`, `frontend/src/`, or `compression-service/app/`. No `console.log`, `console.debug`, or `print()` calls discovered inside comment blocks.

---

## 4. `TODO_PLACEHOLDER` / TODO-FIXME Inventory

Aggregate of `TODO`, `FIXME`, `HACK`, `XXX`, `NOTE:` markers across all in-scope directories:

| Path:Line | Comment | Type |
|---|---|---|
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

| Classification | Count | Notes |
|---|---|---|
| `INTENTIONAL_FEATURE_HOLD` | 4 blocks | All in `PatientDetails.tsx`, all load-bearing per CLAUDE.md. |
| `DEPRECATED` | 2 blocks | Small; safe to delete on next `PatientDetails.tsx` / `Dashboard.tsx` touch. |
| `DEBUG_LEFTOVER` | 0 | Clean. |
| `TODO_PLACEHOLDER` | 0 | Clean. |
| `UNKNOWN` | 0 | No decisions needed. |

**No user decisions required.** The codebase is well-curated; the only commented code is either explicitly intentional or trivially stale (replaced inline).
