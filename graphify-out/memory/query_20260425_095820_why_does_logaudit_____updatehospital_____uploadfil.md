---
type: "query"
date: "2026-04-25T09:58:20.629562+00:00"
question: "Why does logAudit() / updateHospital() / uploadFile() bridge across communities? Should redis.service.js / Architecture Diagrams / Backend API README be split because of low cohesion?"
contributor: "graphify"
source_nodes: ["patient_controller_logaudit", "hospitals_controller_updatehospital", "patient_controller_uploadfile", "redis_service_js", "architecture_diagrams"]
---

# Q: Why does logAudit() / updateHospital() / uploadFile() bridge across communities? Should redis.service.js / Architecture Diagrams / Backend API README be split because of low cohesion?

## Answer

Of the 7 graphify-suggested questions on 2026-04-25, 4 are false positives (extraction limitations) and 3 describe genuine, intentional cross-cutting architecture that should NOT be refactored. (1) logAudit() at patient.controller.js:27 is a hub-spoke fan-out, not a bridge — every mutation handler in patient.controller.js calls it (16 outgoing edges, all within the same controller file). The 'bridges to redis.service.js' phrasing is a graphify question-generator artifact: it picks community labels rather than tracing actual edges. The audit pattern is required (CLAUDE.md §12). (2) updateHospital() at hospitals.controller.js:187 is a TRUE cross-cutting concern — it serves both admin edits (HospitalsList.tsx) and self-edits (Profile.tsx) and triggers mail.service.js account-enabled/disabled emails. The bridge is real and correct. (3) uploadFile() at patient.controller.js:287 is a TRUE cross-cutting concern — it touches Cloudinary (storage.service), patient.service (model), redis.service (setUploadIdempotentResponse for upload idempotency keys), audit (logAudit), and front-end thumbnail URL builder. All edges are intentional. (4) The 156-236 'weakly connected nodes' are mostly DTOs (ZipDownloadRequest, CachedFileItem, CachedPatient) and Python docstrings used as labels — they have low edge count because they're parameter types, not call-graph nodes. Not a documentation gap. (5) redis.service.js cohesion 0.03 is a false positive — it's a kv-store wrapper holding several unrelated keyspaces (otp:*, partial_reg:*, last_otp_sent:*, forgot_otp:*, reset_token:*, idempotent_upload:*) that don't call each other but all live in the same file by design. Not a refactor signal. (6 + 7) 'Architecture Diagrams (30 mermaid)' (cohesion 0.03) and 'Backend API README' (cohesion 0.02) are doc-hub nodes — they reference everything by design. Cohesion is the wrong metric. We tagged them is_doc_hub=True so future re-clusters skip them. ALSO this run: pruned 207 duplicate file-nodes (AST + semantic created two nodes per .js/.ts/.kt/.md file at the same source_file path). Final graph: 1681 nodes, 1980 edges, 175 communities.

## Source Nodes

- patient_controller_logaudit
- hospitals_controller_updatehospital
- patient_controller_uploadfile
- redis_service_js
- architecture_diagrams