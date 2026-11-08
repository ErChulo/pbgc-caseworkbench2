# Review write readback and restored snapshot identity

## Change

Before a review event is treated as saved, the application now reads the current event history with a 16 MiB limit, appends the event, and reads back the full expected bytes. Oversized or unreadable history is blocked, not truncated. Before publishing a review pointer, newly created review snapshots are read back byte-for-byte. After publication, the pointer is read back byte-for-byte and the referenced snapshot is reopened, parsed and checked against the expected content. Existing snapshots are parsed and compared rather than requiring identical whitespace. If review persistence cannot be verified, the active case is blocked and the user is told that an event or snapshot may have been saved and needs inspection before retrying.

Readback exposed a separate defect in the previous restoration path: spreading the restored snapshot envelope into review state allowed an old `reviewSnapshotId` to enter the next snapshot's hash, then be replaced in the saved object. The result could not pass its own identity check on a later reopen. Restored review state now excludes envelope fields, new snapshots discard any accidentally supplied old review ID, and current case/evidence bindings take precedence. A regression test saves a review, reopens, saves another review and reopens again. Already-invalid historical snapshots are not silently repaired or approved; they remain blocked and require a governed recovery process.

## Limits

These checks provide bounded local consistency checks, not authentication, cross-window exclusion, transactionality, antivirus screening, or proof that a later edit did not occur. Event append and pointer publication remain separate operations. A failure can leave an event, orphan snapshot, or changed pointer; reopening does not necessarily detect every missing or extra event. Review events appended by other workflows are not all covered by this specific 16 MiB preflight/readback. Existing cases with larger histories require an approved alternative or governed change rather than silent truncation. Operational recovery and concurrency policies remain open, and the application is not ready for real participant data.

## Validation

Synthetic tests changed event, snapshot and pointer bytes during readback, exceeded the event-history limit, exercised the built `file://` artifact with HTTP blocked, and verified the reopen–review–reopen path. The development and built synthetic production blocker workflows passed. The full suite passed 1,213 tests in 158 files with the locally supplied approved Data Dictionary; all 112 Chromium tests passed, including synthetic in-memory workspaces. Typecheck, lint, formatting, schema and contract checks, isolated single-file build and verifier passed. No native office filesystem, external calculation execution, independent actuarial validation, or human approval was established. The pre-existing modified `dist` file was not replaced.
