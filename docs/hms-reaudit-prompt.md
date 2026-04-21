# Hospital Management System — Comprehensive Re-Audit & Enhancement Prompt

> Paste this entire prompt into a fresh Claude session opened **at the repo root** (the folder containing `backend/`, `frontend/`, `compression-service/`, `android-app/`, and `CLAUDE.md`). The android-app folder is **out of scope** for this audit — only mention it where backend/frontend interact with it.

---

## 0. Your Role & Mindset

You are a **senior staff engineer** doing a forensic re-audit of a multi-tenant hospital records system. Three previous audits exist (`docs/audit/frontend.md`, `docs/audit/backend.md`, `docs/audit/features.md`) plus a condensed memory file (`CLAUDE.md`). They were generated weeks/months ago and **must be assumed stale**.

Your job is **not** to trust those documents. Your job is to:

1. **Verify** every claim in them against the actual code on disk *right now*.
2. **Discover** what they missed, what's been added since, and what's quietly rotted.
3. **Enhance** them into a documentation set that a new senior engineer joining the team could read in one sitting and understand the system completely — including the non-obvious failure modes, the deliberate quirks, and the things you only learn by getting paged at 2 AM.

**Hard rules for this audit:**

- **Read code before you write claims.** Use `view`, `bash_tool` (grep/rg/find), and the file system. Never paraphrase the existing audit docs without verification — if a doc says something and the code disagrees, the code wins and the discrepancy gets logged.
- **Don't modify any source code.** This is read-only analysis. The only files you create/edit live under `docs/audit/`.
- **Don't fabricate.** If you can't verify a claim, mark it `UNVERIFIED` rather than asserting it.
- **Cite line numbers.** Every claim about code behavior must reference `path:line` (or `path:start-end` for ranges) so a reader can jump straight to the source.

---

## 1. Scope

**In scope:**
- `backend/` (Node.js/Express/Mongoose API)
- `frontend/` (React/TS/Vite/Tailwind web app)
- `compression-service/` (Python/FastAPI sidecar) — to the extent it's invoked by backend
- Root config: `docker-compose.yml`, `.env.example`, root `package.json` if any, deployment files (`Dockerfile`, `nginx.conf`)
- Any scripts under `scripts/` or similar
- The existing `docs/audit/*.md` and `CLAUDE.md` (as baseline to verify and supersede)

**Out of scope (mention only at integration boundaries):**
- `android-app/`
- The contents of `doc/` (legacy SRS PDFs)

---

## 2. Phased Execution Plan

Execute the phases **in order**. Don't skip ahead. Each phase has a deliverable. Don't start the next phase until the current one's deliverable is written to disk.

---

### PHASE 0 — Reconnaissance (no output file; mental map only)

1. Read `CLAUDE.md` end-to-end.
2. Read `docs/audit/frontend.md`, `docs/audit/backend.md`, `docs/audit/features.md` end-to-end.
3. Run `find . -type f -name "*.md" -not -path "*/node_modules/*" -not -path "*/.git/*"` to discover any other docs.
4. List the top-level structure of `backend/src/`, `frontend/src/`, and `compression-service/app/`.
5. Note today's date vs the audit file dates — assume **all changes since those dates are undocumented**.
6. Read `package.json` files in `backend/` and `frontend/` to capture exact current versions.

After Phase 0, give the user a **one-paragraph status report** confirming you've ingested everything and listing how many files you'll be analyzing.

---

### PHASE 1 — Drift Detection

**Goal:** For every factual claim in the existing audit docs, verify it against current code. Build a delta list.

**Method:**
- Pick claims from the existing docs in this order: tech stack versions → routes/endpoints → data models → middleware chains → services → env vars → conventions section.
- For each claim, find the corresponding code and compare.
- Treat the existing docs as a *hypothesis*, not a source of truth.

**Things to specifically check:**
- Are all routes listed in `frontend.md` still in `frontend/src/routes/AppRoutes.tsx`? Any new ones? Any removed?
- Are all endpoints in `backend.md` still in `backend/src/routes/*.routes.js`? Any new files? Any new endpoints? Any removed?
- Do model schemas match what `backend.md` describes? Any new fields? Removed fields? Changed types or defaults?
- Do middleware chains on each route still match? (`verifyAccessToken`, `verifyAdmin`, etc.)
- Is the env-var list still complete? Diff against `.env.example` and against actual `process.env.X` references.
- Are dependency versions in `package.json` files what the docs claim?
- Has the Navbar structure changed? Are the three architectural rules (`min-h-[calc(100vh-4rem)]`, modal portals + `z-[100]`, `useDocumentTitle`) actually followed everywhere now?

**Deliverable:** `docs/audit/00-drift.md` — a table grouped by area, with columns:
`Claim Source` | `Claim` | `Verified Status` (✅ Confirmed / ⚠️ Drifted / ❌ False / ➕ New behavior not documented) | `Evidence (path:line)` | `Notes`

End the file with a "**Summary of Drift**" section: top 10 most significant drifts ranked by impact.

---

### PHASE 2 — Dead Code Inventory

**Goal:** Find code that exists but is unreachable, unused, or never executed.

**Categories to scan:**

**Frontend:**
- **Unused npm dependencies** — for every entry in `frontend/package.json` `dependencies` and `devDependencies`, grep the codebase for actual import. CLAUDE.md flags `recharts` and `lucide-react` as dead — verify and find others.
- **Unused exports** — exported functions/components/types that nothing imports. Use `rg "export (default |const |function |class )" -t ts -t tsx` and cross-check against `import` statements.
- **Unused files** — files with zero inbound imports (excluding entry points and route components routed in `AppRoutes.tsx`).
- **Unused routes** — routes defined in `AppRoutes.tsx` that nothing in the app navigates to via `Link`, `navigate()`, or `Navigate`. (CLAUDE.md mentions `/spinners-preview` as unlinked; confirm.)
- **Unused props** — props declared in interfaces/types but never read in the component body.
- **Dead state** — `useState` declarations whose setter is never called, or whose value is never read after set.
- **Unused CSS classes / Tailwind config keys** — design tokens defined in `tailwind.config.js` but never referenced.

**Backend:**
- **Unused services/utils** — files in `services/`, `utils/`, `middleware/` with no inbound `import`/`require`.
- **Unused middleware** — exported middleware functions never wired into a router.
- **Dead endpoints** — endpoints defined in `routes/` that **no client uses**. Check by grepping the frontend (`rg "/api/..." frontend/src/`) and noting endpoints with zero hits. (Mobile may use them — flag those as `MOBILE_ONLY?` rather than dead.)
- **Unused env vars** — vars in `.env.example` never referenced via `process.env.X` or `env.X`.
- **Schema fields never written or never read** — for each Mongoose schema field, grep for write sites (`.field =`, `$set`, schema-level defaults) and read sites. Flag write-only or read-only fields.
- **Legacy duplicate routes** — `backend.md` mentions legacy patient download routes (`/download/pdf` without `/download/` prefix). Verify both exist; flag as redundant.

**Compression service:**
- Unused Python imports.
- Endpoints defined but never called by backend.

**Deliverable:** `docs/audit/01-dead-code.md` — sectioned by area, each entry:
`Path:Line` | `Symbol/File` | `Category` | `Confidence` (HIGH/MEDIUM — ask user if LOW) | `Recommended Action` (DELETE / INVESTIGATE / KEEP-WITH-COMMENT)

End with a "**Quick Wins**" section listing items where confidence is HIGH and impact is high (e.g., removing a 200KB dependency).

---

### PHASE 3 — Commented Code Audit

**Goal:** Inventory every block of commented-out code and classify intent. **The user has explicitly told us some commented code is intentional** — never recommend deletion without classifying.

**Method:**
- Grep for commented blocks: `rg "^\s*//" -t ts -t tsx -t js`, `rg "^\s*#" -t py`, plus multi-line `/* */` blocks.
- For each block, capture: file, line range, ~3-line preview, surrounding context (function/component name).
- Cross-reference `CLAUDE.md` known-intentional list — currently the **PatientDetails Edit-Patient button + modal** in `frontend/src/pages/PatientDetails.tsx` is intentionally commented out (four marked blocks: state, handlers, button, modal). Find these and label them `INTENTIONAL_FEATURE_HOLD`.

**Classification taxonomy (use exactly these labels):**
- `INTENTIONAL_FEATURE_HOLD` — feature is built but disabled by design, documented somewhere. **Keep.**
- `DEPRECATED` — old implementation kept while new one stabilizes. **Schedule deletion after N stable days.**
- `DEBUG_LEFTOVER` — `console.log`, test stubs, throwaway. **Safe to delete.**
- `TODO_PLACEHOLDER` — code commented as a future-feature stub or example. **Convert to a tracked TODO comment or delete.**
- `UNKNOWN` — intent unclear. **Flag for user decision; do not recommend either way.**

**Deliverable:** `docs/audit/02-commented-code.md` — table:
`Path:Lines` | `Preview` | `Surrounding Context` | `Classification` | `Reasoning` | `Recommended Action`

End with two sections:
- **"Intentional commented code — for the README"** — a clean list ready to paste into CLAUDE.md so future audits know not to touch them.
- **"Needs your decision"** — the `UNKNOWN` items, formatted as a checklist the user can answer in one pass.

---

### PHASE 4 — Architecture Visualization (Mermaid)

**Goal:** Produce diagrams that make the system understandable in 10 minutes. **Every diagram must be derived from the actual code, not from the existing prose docs.**

**Required diagrams (one Mermaid block each, all in one file):**

1. **System context diagram** — `flowchart` — boxes for Web, Mobile, Backend, Mongo, Redis, Cloudinary, Brevo, FCM, R2, Compression Sidecar, with arrows labeled by protocol/purpose.
2. **MongoDB ER diagram** — `erDiagram` — all 5 collections with all fields, PK/FK/unique markers, and the embedded `folders[].files[]` shape.
3. **Backend layered architecture** — `flowchart LR` — routes → middleware → controllers → services → models, with one example flow drawn through.
4. **Frontend route tree** — `flowchart TB` — public / protected / admin grouped, showing which routes are inside `MainLayout` vs standalone.
5. **Auth state machine** — `stateDiagram-v2` — states: `LoggedOut`, `AwaitingAuthCode`, `MustChangePassword`, `AwaitingPasswordReset`, `Authenticated`, `AuthCodeStaleMobile`, with all transitions labeled by endpoint.
6. **Login sequence diagram** — `sequenceDiagram` — Browser/App → Backend → Mongo → Redis → Email provider → back. Cover both web and mobile (mobile gets the 7-day check). Show tempToken handoff.
7. **Token refresh interceptor flow** — `sequenceDiagram` — frontend Axios 401 → refresh-token mutex → retry, including the failure path.
8. **File upload pipeline** — `sequenceDiagram` — Mobile → Backend → Multer → Cloudinary → Mongo update → audit log. Include the `Idempotency-Key` path.
9. **Compression sidecar pipeline** — `flowchart TD` — request shape → cache check → fetch sources → merge → tier ladder (0/1/2/3/4 with branch conditions) → upload → cache write → response. Include the 502/504/413 error branches.
10. **Patient download orchestration** — `flowchart TD` — size-check → ZIP vs PDF branch → merged vs per-folder branch → sidecar invocation → streaming response.
11. **Auto-delete cron flow** — `flowchart TD` — daily trigger → query patients > 90d → for each: cascade Cloudinary delete → audit log → patient delete.
12. **Session lifecycle & conflict resolution** — `stateDiagram-v2` — Active → Stale (mobile 7d) → Revoked (with reason variants: USER_LOGOUT / ADMIN_REVOKE / SESSION_CONFLICT / ALL_OTHERS / ACCOUNT_DISABLED) → Expired (TTL).
13. **Notification dispatch decision tree** — `flowchart TD` — event → check `notificationPrefs` → email branch (Brevo vs Mailtrap) + push branch (FCM token present?) → audit.
14. **Forgot password flow** — `sequenceDiagram` — three steps with the "always return 200" enumeration-prevention behavior shown explicitly.
15. **Frontend component hierarchy for `MainLayout`** — `flowchart TB` — MainLayout → Navbar → (LeftCluster, CenterNav, RightCluster → SettingsMenu, Avatar, HospitalChip) → page outlet → modals (portaled to body).
16. **API service dependency graph** — `flowchart LR` — for each backend controller, which services it depends on. Highlight services used by 3+ controllers (high coupling).
17. **Patient ID generation** — `flowchart TD` — registration → derive initials → counter init → on patient create: atomic `$inc` → format → uniqueness retry on collision.

**Deliverable:** `docs/audit/03-architecture-diagrams.md` — title, one section per diagram with: (a) prose explanation 2–4 sentences, (b) the Mermaid block, (c) "Source of truth" citations (`path:line` references in code that this diagram was derived from).

---

### PHASE 5 — Enhancement Dimensions

**Goal:** Surface things normal audits miss. Each subsection produces ranked findings with severity and effort estimates.

For every finding use this format:
**Finding ID** (e.g., `SEC-007`) | **Severity** (Critical/High/Medium/Low) | **Effort** (S/M/L) | **Description** | **Evidence** (`path:line`) | **Recommendation** | **Risk if ignored**

**Subsections to produce (each is its own H2 in the deliverable):**

#### 5.1 Security Audit (mapped to OWASP Top 10 2021)
For each OWASP category (A01 Broken Access Control through A10 SSRF), document either: (a) findings with evidence, or (b) "no findings — controls in place at `path:line`". Specifically check:
- Token storage (CLAUDE.md flags `sessionStorage` XSS risk — verify)
- Mass assignment in PATCH endpoints
- IDOR on `/api/patients/:id`, `/api/hospitals/:id`
- Rate limit coverage on every auth endpoint
- CORS config (`FRONTEND_URL` parsing)
- Helmet config completeness
- bcrypt cost factor
- JWT algorithm pinning (does code reject `alg: none`?)
- Cloudinary signed URL TTL and signature handling
- Audit log injection / log forging
- Error responses leaking stack traces or internal IDs in production

#### 5.2 Performance & Scaling Hotspots
- N+1 query candidates (Mongoose `.populate()` in loops, unnecessary round trips)
- Missing or redundant indexes (compare schema indexes to actual query shapes in controllers)
- Synchronous `bcrypt.compareSync` in hot paths
- Large response payloads (e.g., `/api/hospitals` returning all hospitals with no pagination — confirm)
- Streaming vs buffering for downloads
- Frontend bundle: oversize dependencies, code-split opportunities, lazy-route candidates
- Compression sidecar: timeout headroom, cache hit ratio observability gap

#### 5.3 Type Safety & Code Quality (Frontend)
- Count and locate every `: any` and `as any` in `frontend/src/`
- Files using `// @ts-ignore` or `// @ts-expect-error`
- API response types not matching backend shape (sample 5 endpoints, compare)
- Components > 400 lines (refactor candidates)
- Functions with cyclomatic complexity > 10 (estimate via nesting depth)

#### 5.4 Error Handling & Observability
- Endpoints without try/catch wrapping
- Promise chains without `.catch`
- `console.log` left in production code paths
- Frontend ErrorBoundary coverage (only top-level per CLAUDE.md — confirm)
- Logging completeness: do failures include enough context to debug from a log file alone?
- Audit log gaps — actions in the codebase that *should* be audit-logged but aren't
- Health check completeness (`/api/health/deep` — does it actually probe Brevo, FCM, Cloudinary, sidecar?)

#### 5.5 Test Coverage Map
- For each controller/service, does a test exist? Build a coverage matrix.
- For each frontend page, is there any test? (Likely none — confirm.)
- List the top 10 critical untested paths (auth flows, payment-equivalent operations like force-delete, compression integration).

#### 5.6 API Contract Drift (Frontend ↔ Backend)
- For every backend endpoint, find the frontend service function that calls it.
- Compare expected request shape (controller validators) vs sent shape (frontend service).
- Compare expected response shape (frontend's typing) vs actual return (controller).
- Flag mismatches as `CONTRACT_DRIFT` with severity.

#### 5.7 Concurrency & Race Conditions
- `Hospital.patientIdCounter` — is the increment atomic? (`$inc` vs read-modify-write)
- Session creation under conflict — what if two devices register simultaneously?
- Token refresh — verify the mutex/subscriber-queue logic in `services/api.ts` actually prevents duplicate refreshes.
- File upload + cloudinary delete races (e.g., file deleted while compression sidecar is fetching it)
- Cron job idempotency (what if it runs twice on the same day?)

#### 5.8 Failure Mode Catalog
For each external dependency (Mongo, Redis, Cloudinary, Brevo, FCM, R2, Compression Sidecar), document:
- What happens to the user experience if it goes down?
- Is there a fallback?
- How long until users notice?
- Is there alerting?

#### 5.9 Onboarding Friction (Novel Angle)
The "if a new senior engineer joined Monday" reading order:
- File-by-file: which 15 files should they read first, in what order, and why?
- The 5 most surprising behaviors a new dev would absolutely miss without being told.
- The 3 "here be dragons" zones where naive changes cause production incidents.

#### 5.10 Scaling Cliffs (Novel Angle)
For each of {10x users, 100x patients per hospital, 10x file uploads/sec, 10x concurrent downloads}, where does the system break first? Be specific: which collection's index? which Cloudinary quota? which sidecar timeout?

**Deliverable:** `docs/audit/04-enhancements.md` — each subsection 5.1–5.10 as its own H2.

---

### PHASE 6 — Refreshed Core Documents

**Goal:** Replace the existing stale audit docs with current, comprehensive versions.

Generate fresh versions of:
- `docs/audit/frontend.md` — full frontend audit, current as of today, incorporating drift findings.
- `docs/audit/backend.md` — full backend audit, current as of today.
- `docs/audit/features.md` — end-to-end feature map, current as of today.

For each refreshed doc:
- Use the same section structure as the existing one (so diffs are reviewable).
- Add a **"Changes since previous audit"** section at the top listing the deltas.
- Add a **"Verified at commit"** line with the current git HEAD short SHA (run `git rev-parse --short HEAD`).

**Also produce:**

`docs/audit/05-claude-md-update.md` — a **diff-style update for the root `CLAUDE.md`**: don't overwrite it, but list every line/section that needs to change, formatted so the user can apply each change deliberately. Include new "intentional commented code" entries from Phase 3.

---

### PHASE 7 — Tech Debt Ledger & Migration Paths

**Goal:** Take every issue surfaced in Phases 1–6 and turn it into an actionable backlog.

For each item:
**ID** | **Title** | **Source Phase/Section** | **Severity** | **Effort** (XS=<1h / S=<1d / M=1-3d / L=1w / XL=>1w) | **Blast Radius** (which features/users affected) | **Migration Plan** (concrete steps) | **Acceptance Criteria** (how do we know it's done) | **Dependencies** (other items that must finish first)

Group the ledger into:
- **🔥 Do This Week** — Critical security or production-impact items.
- **📅 Do This Quarter** — High-severity items, planned work.
- **🧹 Backlog Polish** — Medium/Low items, opportunistic cleanup.
- **🤔 Discuss First** — Architectural decisions that need a person, not a ticket (e.g., "soft-delete vs hard-delete for patients").

**Deliverable:** `docs/audit/06-tech-debt-ledger.md`.

---

### PHASE 8 — Index & Navigation

**Goal:** Make the audit set browsable.

Create `docs/audit/README.md` with:
- One-paragraph project summary.
- Table of contents linking every audit file in order.
- "Read this if…" quick-links (e.g., "Read this if you're onboarding → 04-enhancements.md §5.9; Read this if you're handling a production incident → 04-enhancements.md §5.8 + 03-architecture-diagrams.md").
- Audit metadata: date, files analyzed count, LOC analyzed (approximate), git SHA verified at.

---

## 3. Format & Style Conventions

- **Markdown only.** No HTML, no images, no embedded binaries.
- **Mermaid for all diagrams.** Test that each block parses (no syntax errors, no unescaped `(` in node labels, etc.).
- **Tables for lists with >3 columns of data.** Bullet lists for unordered enumerations.
- **Always cite `path:line`** when making a behavioral claim. Use the form `backend/src/controllers/auth.controller.js:142` or for ranges `frontend/src/pages/Login.tsx:88-104`.
- **Severity terms** must be one of: `Critical / High / Medium / Low`. Effort terms must be one of: `XS / S / M / L / XL`.
- **Use ✅ ⚠️ ❌ ➕** consistently for verified / drifted / false / new.
- **No filler.** Skip phrases like "It's worth noting that…" and "In conclusion…". Every sentence either makes a claim, cites evidence, or gives a recommendation.

---

## 4. When to Pause and Ask

Pause and ask the user — do not guess — in these cases:

1. **Commented code with `UNKNOWN` classification** — list them at the end of Phase 3 and wait for the user's decision before recommending any action.
2. **Endpoints with zero frontend callers** — these may be mobile-only; confirm before flagging as dead.
3. **Schema fields with no read or no write site** — could be reserved for a planned feature; confirm.
4. **Architectural recommendations with > L effort** — these need a human design decision, not a unilateral Claude suggestion.

For everything else, proceed without asking.

---

## 5. Final Deliverables Checklist

When finished, the user should have these files under `docs/audit/`:

- [ ] `README.md` — index
- [ ] `00-drift.md` — Phase 1
- [ ] `01-dead-code.md` — Phase 2
- [ ] `02-commented-code.md` — Phase 3
- [ ] `03-architecture-diagrams.md` — Phase 4 (17 Mermaid diagrams)
- [ ] `04-enhancements.md` — Phase 5 (10 subsections)
- [ ] `05-claude-md-update.md` — Phase 6 delta for `CLAUDE.md`
- [ ] `06-tech-debt-ledger.md` — Phase 7
- [ ] `frontend.md` — Phase 6 refresh
- [ ] `backend.md` — Phase 6 refresh
- [ ] `features.md` — Phase 6 refresh

End your final message with:
1. A one-screen summary of the most important findings (top 5 critical items).
2. The list of `UNKNOWN`-classified items needing user decisions.
3. A confirmation that all 11 files are written and parseable.

---

## 6. What "Enhanced and Fully Advanced" Means Here

To be explicit about the bar: a normal codebase audit produces a tech-debt list and a route table. **This audit produces all of that plus**:

- Mermaid diagrams for every non-trivial flow, derived from code (not docs).
- A failure mode catalog mapping each external dependency to user-visible symptoms.
- A scaling-cliff analysis identifying the *first* thing that breaks at 10x load.
- An onboarding map ranking files by "read order for new hires."
- A "surprise index" — quirks that violate the principle of least astonishment.
- API contract drift detection comparing frontend expectations to backend reality.
- A test coverage matrix showing exactly what's untested.
- A bus-factor analysis (which files would be most painful to lose context on).
- A migration plan for every tech debt item, not just a list of complaints.

If a section feels generic or could apply to any Node/React app, **rewrite it with project-specific evidence**. The value is in the specificity.

---

*End of prompt. Begin with Phase 0.*
