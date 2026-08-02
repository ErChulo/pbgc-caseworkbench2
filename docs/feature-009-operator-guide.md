# Feature 009 operator guide

**Recorded:** 2026-07-25
**Scope:** Local-only production operation for the Feature 009 single-HTML application.

## Workspace selection

1. Open the approved local build artifact.
2. Choose a local workspace directory when prompted.
3. Confirm the workspace is the intended case-processing root before importing evidence.

The application writes only to the selected local workspace. It does not send case data to a remote service.

## Backups and recovery

- Keep a backup of the selected workspace before production work.
- If the workspace is reopened, the application reloads only the local records.
- If access to the workspace is revoked, the application blocks further use until a new local workspace is approved.

## Local PII handling

- Real participant PII remains on the local device.
- Do not copy real PII into Git, logs, screenshots, fixtures, or documentation.
- Do not transmit real PII to external services.
- Use synthetic or de-identified data for demos, tests, and validation.

## Quarantine limitations

- Quarantine is a provisional or final governed state depending on the typed human decision recorded.
- Automated safety checks can block processing, but only human decisions establish final release or final quarantine.
- Unsafe, encrypted, corrupt, or unsupported artifacts remain blocked until reviewed.

## Recovery

- Resume only from unchanged workspace snapshots.
- Changed bytes require a new lifecycle and fresh screening.
- Preserve the original artifact and its lineage; do not replace it in place.

## Static-origin fallback

- Direct `file://` use is approved only where the validated browser path supports it.
- If direct file execution is not approved, use the approved localhost/static-origin launcher.
- The launcher serves immutable bytes and receives no case data.

## Keyboard operation

- Tab and Shift+Tab move between controls.
- Enter activates buttons.
- Space toggles supported controls.

## Built-in help

The application includes built-in help describing workspace selection, backups, keyboard operation, static-origin fallback, and local PII handling. Use it as the first operator reference before processing a production package.

## Final output package operation

- Use the Case Output Package panel only after the correct case is active.
- Link generated V1, workbook, validation, reconciliation, and Section 436 artifacts from paths inside the selected workspace.
- The app computes each linked artifact SHA-256 from file bytes; do not enter manual hashes.
- Linked references are stored at `cases/<case-uuid>/outputs/artifact-references.json`.
- The exported final package is stored at `cases/<case-uuid>/exports/final-casework-output-package.json`.
- A blocked final package is acceptable evidence of missing required outputs; do not mark it complete by hand-editing JSON.
- Do not claim Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution unless separate execution evidence is linked and reviewed.

## Draft V1 summary operation

- Use the Draft V1 Summary panel only when an R5 summary JSON is available for the active case.
- The app hashes the R5 JSON bytes and writes `cases/<case-uuid>/outputs/draft-v1-summary.json`.
- The draft records closest approved V1 summary reference matching and explicit blockers.
- Do not treat the draft as a final V1 architecture, BuildSpec, formula artifact, workbook, validation result, reconciliation result, or approval.
- Do not link the draft into the final output package unless a separate governed workflow approves its exact purpose and maturity.
