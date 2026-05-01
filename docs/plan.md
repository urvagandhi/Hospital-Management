## Plan: Durable offline upload queue with in-folder visibility

### Goal

Stop silently losing scans and make the upload lifecycle visible everywhere the user expects to find the file. Every scan should become a durable `OfflineDocument` record before any network call, live in `filesDir/pending_uploads`, remain visible while uploading, remain visible if it fails, and disappear only after a confirmed success path deletes both the database row and the file.

### Problem Summary

The current flow has four user-visible failures:

- The preflight size gate in `UploadActivity` deletes the PDF when it thinks the file is too large, so there is no row and no file left behind.
- Online uploads enqueue `UploadWorker` without creating an `OfflineDocument` first, so a terminal worker failure leaves no visible trace in the UI.
- The queued file currently lives in `cacheDir` for some paths, which is not durable storage and can be reclaimed by Android.
- Folder views only show server-confirmed files, so an upload can be in progress without appearing in the folder it belongs to.

### Design Principles

- Never delete a scan as a side effect of upload validation or transient failure.
- Treat `OfflineDocument` as the source of truth for local queue state.
- Keep queued files in app-private durable storage, not `cacheDir`.
- Scope every local queue query to the currently signed-in hospital.
- Use the same WorkManager progress stream for notifications and folder UI so they never disagree.
- Keep success cleanup paired: row delete and file delete happen together.

### Status Model

Use the existing `SyncStatus` values and the `errorMessage` prefix to drive behavior.

- `PENDING`: queued, not yet picked up.
- `UPLOADING`: worker has started and the file should show live progress.
- `FAILED` with `NETWORK:`: retryable by sync policy.
- `FAILED` with `SIZE_EXCEEDED:`: too large, no automatic retry.
- `FAILED` with `AUTH_REQUIRED:`: session or token problem, no automatic retry.
- `FAILED` with `SERVER_REJECTED:`: non-auth 4xx, no automatic retry.
- `FAILED` with `CANCELLED:`: user cancelled, no automatic retry.
- `COMPLETED`: terminal success state, visible only briefly until the row is deleted and the server list refresh catches up.

### Implementation Phases

#### Phase 1: Queue data contract and durable file storage

This phase blocks every other change.

1. Extend `DocumentDao` with owner-scoped queries.
   - Add a patient-scoped flow that returns every local row for a patient and hospital.
   - Add a folder-scoped flow that returns every local row for a patient, folder, and hospital.
   - Add a hospital queue flow that returns every non-completed row for the current hospital.
   - Add an auto-sync eligibility query that returns only rows the sync worker should pick up.
   - Keep the existing pending-count helpers, but make sure the scheduler path uses owner-scoped versions rather than global counts.

2. Add a durable-path helper in `DocumentRepository`.
   - Centralize the path for `filesDir/pending_uploads/<idempotencyKey>.pdf`.
   - Provide a helper to create the directory if it does not exist.
   - Provide a helper to insert a queued row and return the row id.
   - Provide a helper to update `status`, `errorMessage`, `retryCount`, and `fileUri` by row id or idempotencyKey.
   - Provide a helper to delete row and file together, with best-effort file cleanup if the file is already missing.

3. Keep the current schema.
   - Do not add a separate queue table.
   - Do not add a Room migration for the MVP because `OfflineDocument` already has the required columns.
   - Use the existing `fileUri`, `status`, `errorMessage`, `retryCount`, `idempotencyKey`, and `ownerHospitalId` fields.

4. Decide the durable URI shape.
   - Prefer a plain file path or `file://` URI pointing at `filesDir/pending_uploads`.
   - Make sure the same stored URI can be opened from the folder UI and read by the workers.
   - Avoid any path that depends on `cacheDir` for queued uploads.

Dependencies:
- None. This is the first code slice to land.

#### Phase 2: Upload entry path becomes row-first and file-first

This phase depends on Phase 1.

1. Refactor `UploadActivity` so row creation happens before any network call.
   - Remove the current delete-on-size-failure behavior.
   - Build the PDF as today, but move or copy it into durable storage before the upload is enqueued or the offline row is saved.
   - If the durable file cannot be written, fail non-destructively and keep the source scan rather than deleting it.

2. Replace the client-side size gate with server-driven terminal classification.
   - Stop rejecting a scan purely because the client thinks it exceeds the current limit.
   - Let the server or upload API return `413` and convert that into `FAILED` with a `SIZE_EXCEEDED:` message.
   - Keep the user-facing toast clear and action-oriented, but do not delete the file.
   - If a file is already known to exceed a local safety threshold during PDF generation, persist it as a failed queue item instead of removing it.

3. Insert the queue row before enqueueing `UploadWorker`.
   - Online branch: create the row with `status = UPLOADING`, persist the durable file path, then enqueue the worker with the row id and `idempotencyKey` in input data.
   - Offline branch: create the row with `status = PENDING` and the same durable file path.
   - Finish the activity only after the row and durable file exist.
   - Make sure retrying the same logical upload reuses the same `idempotencyKey`.

4. Keep upload identity stable.
   - Reuse the same `idempotencyKey` for retries, queued uploads, and any later manual retry action.
   - Ensure the unique WorkManager name stays aligned with that idempotency key so duplicate work does not spawn multiple local rows.

Dependencies:
- Phase 1 must exist because this phase writes to the new repository and DAO helpers.

#### Phase 3: Worker lifecycle updates the row instead of disappearing

This phase depends on Phases 1 and 2.

1. Teach `UploadWorker` to operate on a queue row.
   - Add `KEY_OFFLINE_DOC_ID` to input data.
   - Resolve the row before any upload logic runs and mark it `UPLOADING` if it is still present.
   - If the row is already gone, stop gracefully rather than creating a duplicate local state.

2. Make progress updates source from the same WorkInfo payload that the notification uses.
   - Continue emitting progress bytes, speed, and stage data.
   - Keep the foreground notification and WorkInfo progress synchronized.
   - Use the same payload to drive the folder UI later.

3. Define the success path as paired cleanup.
   - On success, transition the row to `COMPLETED`.
   - After the row is confirmed complete, delete the database row and delete the durable file.
   - If file deletion fails, leave the row cleanup completed and let the orphan reaper handle the stray file later.

4. Define terminal failure behavior explicitly.
   - Map 401/403 to `AUTH_REQUIRED:`.
   - Map 413 to `SIZE_EXCEEDED:`.
   - Map 5xx and transport errors to `NETWORK:` unless the response text clearly indicates a different server rejection.
   - Map other 4xx values to `SERVER_REJECTED:`.
   - Map explicit user cancel to `CANCELLED:`.
   - Persist `FAILED` rows with the categorized message and keep them visible.

5. Remove the upload retry cap from worker ownership.
   - Do not let `UploadWorker` be the policy owner for indefinite retry behavior.
   - Keep WorkManager progress and the foreground notification, but shift long-lived retry semantics to the sync worker and queue UI.
   - Preserve enough retry data for diagnostics, not for abandonment.

6. Update notification copy and cancel handling.
   - Change the failed-notification copy so it says the file is saved offline and can be retried or managed later.
   - Keep the completion notification behavior intact, but make sure it only appears after the row/file cleanup path is decided.
   - Update `UploadActionReceiver` so canceling a worker also deletes the matching row and durable file, not just the WorkManager job.

Dependencies:
- Phases 1 and 2.

#### Phase 4: Sync policy, session boundaries, and startup cleanup

This phase depends on Phases 1 and 3.

1. Make `SyncDocumentsWorker` select only eligible rows.
   - Pick up `PENDING` rows for the current owner.
   - Pick up `FAILED` rows only when the error message starts with `NETWORK:`.
   - Skip `FAILED` rows that are clearly user-action required, such as `SIZE_EXCEEDED:` or `AUTH_REQUIRED:`.
   - Preserve `retryCount` only for logs and inspection.

2. Preserve the healthcare cross-account guard.
   - Keep the worker from uploading rows that belong to another hospital.
   - Keep owner-scoped cleanup before any upload starts.
   - Make sure the sync queue never leaks rows across account boundaries even if the same device is reused.

3. Stop deleting queued rows on logout.
   - Update `SessionManager.logoutUser()` so it still cancels active work, but does not erase the hospital’s queued rows from local storage.
   - Keep the queue visible to the same hospital after a relogin.
   - Rely on owner-scoped queries to keep other accounts from seeing the rows.
   - Keep cancellation of in-flight uploads so a switch of user cannot continue a live upload in the background.

4. Scope auto-sync to the current hospital.
   - Update `HospitalApplication.scheduleSyncIfNeeded()` to look at the current owner only.
   - Enqueue sync only when there are rows eligible for automatic retry.
   - Do not wake the worker for stale rows that are not meant to auto-sync.

5. Add a startup orphan sweep.
   - Scan `filesDir/pending_uploads` on startup.
   - Delete files that have no matching database row.
   - Do not try to recover old `cacheDir/upload_*.pdf` leftovers because those are not durable and cannot be trusted.

Dependencies:
- Phase 1 for the query helpers and path helpers.
- Phase 3 for the row status semantics.

#### Phase 5: Folder-level merged visibility and local file actions

This phase depends on Phases 1 through 4.

1. Replace the prepend-only overlay in `FolderDetailsActivity` with a real merged list model.
   - Combine server `FileItem` rows and local `OfflineDocument` rows for the same patient and folder.
   - Keep the local row visible while it is `UPLOADING`, `PENDING`, or `FAILED`.
   - Hide the local row only after it reaches `COMPLETED` and the server file list has caught up.

2. Use a sealed UI model instead of overloading `FileItem`.
   - Create separate list variants for server files and local upload rows.
   - Keep stable keys distinct so server rows use `_id` and local rows use `idempotencyKey`.
   - Avoid reusing a generic id field that would cause RecyclerView rebinding and lost progress state.

3. Make the folder row status-aware.
   - `UPLOADING`: show spinner and live percentage.
   - `PENDING`: show queued badge and a local-file action menu.
   - `FAILED`: show the reason derived from the prefix and expose retry or edit-folder actions where allowed.
   - `COMPLETED`: show a short-lived saved state only if the server refresh has not yet returned the new file row.

4. Open local PDFs directly.
   - Allow local rows to open in `FileViewerActivity` from the durable `fileUri`.
   - Do not require a remote file id for queued rows.
   - Keep the existing remote file open behavior untouched for server rows.

5. Preserve current server actions for server rows.
   - Rename, delete, and download should continue to work for server-confirmed files.
   - Local rows should not advertise server-only actions.

6. Add a patient-level upload badge where appropriate.
   - Let `FolderViewActivity` display per-folder queued or uploading counts based on the new patient-scoped flow.
   - Keep the folder index owner-scoped so it does not leak another hospital’s queue rows.
   - If there is room in the layout, add a small badge or count chip rather than a full new panel.

Dependencies:
- Phase 1 for the patient/folder queries.
- Phase 3 for state transitions.
- Phase 4 for owner scoping.

#### Phase 6: Global sync queue and navigation

This phase depends on Phases 1 through 5.

1. Add a dedicated global queue screen.
   - Make it reachable from `DashboardActivity`, either through the `WorkProgressBanner` tap-through or a clear action in the dashboard chrome.
   - Use the hospital-scoped queue query so it shows all non-completed rows for the signed-in owner.
   - Sort rows with `UPLOADING` first, then `PENDING`, then `FAILED`.

2. Define queue actions by status.
   - `UPLOADING`: open local PDF and optionally cancel.
   - `PENDING`: open local PDF, retry now, or cancel.
   - `FAILED` with `NETWORK:`: retry now, open local PDF, or delete.
   - `FAILED` with `SIZE_EXCEEDED:` or `AUTH_REQUIRED:`: open local PDF, move folder where appropriate, or delete.
   - Keep move-folder behavior limited to statuses that can actually be rescued by a new destination.

3. Reuse the same WorkManager progress source.
   - Match `WorkInfo.progress` to local rows using `idempotencyKey` and the worker input data.
   - Keep the banner, folder view, and queue screen consistent with the same progress payload.
   - Avoid separate progress calculations in different screens.

4. Decide where the existing toolbar sync action goes.
   - It can remain as a manual sync trigger, but it should not be the only entry point to the queue.
   - If the queue screen already exposes retry and status details, consider routing the sync action into that screen for consistency.

Dependencies:
- Phases 3 and 5, because this screen depends on the merged queue model and worker progress.

#### Phase 7: Copy, strings, and user-facing retention messaging

This phase depends on the UX and worker changes above but can be adjusted in parallel with Phase 5 or 6.

1. Update failed-upload copy.
   - Replace the old retry-only copy with language that says the file was saved offline.
   - Make the toast and notification both point to the app for retry or management.

2. Update action labels and helper text.
   - Ensure queued, failed, and retryable states use consistent labels in the folder view and queue screen.
   - Make status text specific enough that the user can tell whether the file is waiting, retrying, failed due to size, or blocked on authentication.

3. Make support copy explicit about retention.
   - If the product wants to warn about uninstall wiping the queue, add that warning to the queue screen or help copy.
   - If product wants to mention that queued files survive reboot but not uninstall, say that plainly.

4. Leave server-limit UX as a follow-up unless needed for the MVP.
   - The MVP should rely on the server returning 413.
   - A live limit endpoint can be added later as a UX enhancement, not as a hard dependency.

### Relevant Files

- `android-app/app/src/main/java/com/hospital/management/ui/upload/UploadActivity.kt` — entry flow, durable file creation, row-first save, size handling, enqueue path.
- `android-app/app/src/main/java/com/hospital/management/worker/UploadWorker.kt` — row state transitions, success cleanup, terminal failure mapping, notification tie-in.
- `android-app/app/src/main/java/com/hospital/management/worker/SyncDocumentsWorker.kt` — eligible-row selection, network-only retry, cross-account guard.
- `android-app/app/src/main/java/com/hospital/management/data/local/DocumentDao.kt` — owner-scoped read and count APIs for patient, folder, and hospital queue views.
- `android-app/app/src/main/java/com/hospital/management/data/local/OfflineDocument.kt` — existing queue entity and status fields.
- `android-app/app/src/main/java/com/hospital/management/data/repository/DocumentRepository.kt` — durable file path helpers, row/file cleanup helpers, save/update helpers.
- `android-app/app/src/main/java/com/hospital/management/utils/SessionManager.kt` — logout cleanup must preserve queued rows.
- `android-app/app/src/main/java/com/hospital/management/HospitalApplication.kt` — owner-scoped sync scheduling and startup orphan sweep.
- `android-app/app/src/main/java/com/hospital/management/ui/folders/FolderDetailsActivity.kt` — merged folder list, local file actions, inline status rendering.
- `android-app/app/src/main/java/com/hospital/management/ui/folders/FolderViewActivity.kt` — folder count badges for queued and uploading rows.
- `android-app/app/src/main/java/com/hospital/management/ui/folders/FileAdapter.kt` — adapter changes if the folder list stays in RecyclerView form.
- `android-app/app/src/main/java/com/hospital/management/ui/folders/FileViewerActivity.kt` — open queued local PDFs.
- `android-app/app/src/main/java/com/hospital/management/ui/dashboard/DashboardActivity.kt` — queue entry point and owner-scoped badge behavior.
- `android-app/app/src/main/java/com/hospital/management/ui/components/WorkProgressBanner.kt` — shared WorkManager progress surface.
- `android-app/app/src/main/java/com/hospital/management/utils/UploadNotifier.kt` — upload notification copy and terminal-state messaging.
- `android-app/app/src/main/java/com/hospital/management/utils/UploadActionReceiver.kt` — cancel behavior must delete the row and file.
- `android-app/app/src/main/res/values/strings.xml` — user-facing queue, retry, and saved-offline copy.
- `backend/src/controllers/patient.controller.js` — current 413 path and idempotency cache behavior for reference.
- `backend/src/middleware/upload.js` — current server file-size gate for reference.

### Verification Plan

1. Build the Android app and run error checks on the touched Android files after each major phase.
2. Test a normal online upload and confirm the file appears in the folder while uploading, then disappears only after success cleanup.
3. Test a file that trips the server limit and confirm it becomes a visible FAILED queue item instead of being deleted.
4. Test an offline upload and confirm it becomes a queued local row stored in durable storage and visible in the folder and global queue.
5. Kill the app mid-upload, reopen it, and verify the row still exists, the file still exists, and progress resumes or requeues correctly.
6. Log out and back in as the same hospital, then as a different hospital, and verify owner-scoped visibility and no cross-account leakage.
7. Restart the device and verify the startup sweep removes only orphaned files with no matching row.
8. If backend code changes in the final implementation, rerun the relevant backend test or lint path for the patient upload route and confirm the idempotency and 413 behavior still work.

### Decisions

- Use the existing `OfflineDocument` table as the single queue table.
- Keep queued files in `filesDir/pending_uploads` and stop treating `cacheDir` as durable storage.
- Rely on server 413 for the true upload-limit decision instead of a hard client-side deletion path.
- Keep queued rows after logout for the same hospital, but prevent cross-account visibility through owner-scoped queries.
- Do not migrate old `cacheDir/upload_*.pdf` leftovers because they are not recoverable.
- Add the global queue screen as a separate navigation target rather than overloading the folder page.

### Out of Scope for the MVP

- Backup/export of queued files.
- A dedicated server endpoint for live upload limits.
- Recovery of old `cacheDir` temp files.
- A storage-management subsystem beyond the basic queue visibility and deletion actions.

### Follow-up Candidates

- A storage summary on the queue screen showing how much space queued files occupy.
- A deliberate free-up-space action for `FAILED` rows the user is willing to abandon.
- A backup/export flow that zips pending uploads into Downloads before uninstall or device reset.
- A server-derived upload-limit endpoint if product wants the client to show the cap before upload starts.
