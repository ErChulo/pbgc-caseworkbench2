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
