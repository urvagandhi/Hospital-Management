---
type: "query"
date: "2026-04-25T09:43:01.087639+00:00"
question: "Are the root README and CLAUDE.md ER diagrams + auth flows still in sync with the actual code?"
contributor: "graphify"
source_nodes: ["readme_root_auth_flow", "backend_totp_lifecycle", "frontend_token_management", "readme_root_data_model", "claudemd_data_model", "backend_data_models_er"]
---

# Q: Are the root README and CLAUDE.md ER diagrams + auth flows still in sync with the actual code?

## Answer

No — three drift clusters confirmed. (1) TOTP fiction: README.md, backend/README.md, frontend/README.md all describe a TOTP 2FA flow with /api/auth/login/totp, /api/auth/2fa/setup, /api/auth/2fa/verify, totp.service.js, BackupCode model, OtpInput/TwoFactorSettings components. None of these exist — backend/scripts/migrate-remove-totp.js ripped them out and auth.controller.js:851 says so explicitly. The real second factor is the 6-digit Auth Code (CLAUDE.md §5). (2) ER schema fiction: root README ER lists 7 collections (incl. BackupCode + Folder/File hoisted to top-level), backend README lists 5 (incl. BackupCode), CLAUDE.md correctly says 5 (Hospital, Patient, Session, AuditLog, AppVersion). Folder/File are embedded in Patient.folders[]. BackupCode is gone, AppVersion is missing from old READMEs. (3) R2 fiction: both READMEs sell the product as Cloudflare R2; storage.service.js uses Cloudinary; r2.service.js has 0 importers (already TD-003). The Session Management overlap (cluster 4) is not drift — both diagrams agree with CLAUDE.md §5. Fix: delete mermaid blocks in the three old READMEs and link to docs/audit/03-architecture-diagrams.md + CLAUDE.md, or rewrite anchored on CLAUDE.md.

## Source Nodes

- readme_root_auth_flow
- backend_totp_lifecycle
- frontend_token_management
- readme_root_data_model
- claudemd_data_model
- backend_data_models_er