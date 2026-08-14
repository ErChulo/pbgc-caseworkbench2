# ADR 009: Local-first evidence intake foundation

- **Status:** Accepted
- **Approving authority:** Repository owner
- **Approval date:** 2026-07-25
- **Amended:** 2026-08-13 (direct-file production support)
- **Supersedes:** Nothing
- **Superseded by:** Nothing

## Context

Feature 009 must preserve authorized case evidence and participant PII on the user's device, produce one downloadable HTML artifact, operate with zero network access, and retain deterministic content separately from operational state. Browser security rules differ between direct `file://` execution and a loopback static origin, particularly for the File System Access API and persistent storage.

## Proposed decision

Use a local-first browser trust boundary with these constraints:

- Distribute one self-contained HTML file with scripts, styles, workers, schemas, WASM, and static assets inlined.
- **Direct `file://` execution is the required office deployment mode** for PBGC workstations that cannot install software, run servers, or use localhost.
- Use runtime capability detection to determine production readiness, not browser brand alone.
- Direct-file production is permitted when all capabilities required by the active workflow are available: secure context, File System Access API, and deterministic main-thread processing.
- If a required capability is unavailable, fail closed with a clear human-readable message; do not silently fall back to unsafe behavior.
- Otherwise use a data-blind loopback/static-origin launcher that serves immutable application bytes only, performs no server-side case processing, and receives no case data.
- Keep original evidence and governed workspace state in a user-selected local directory. Use OPFS only for bounded, recoverable working state; it is not the authoritative evidence store.
- Keep canonical deterministic payloads separate from UUIDs, timestamps, UI state, storage paths, and other operational metadata.
- **Worker/main-thread fallback strategy**: All production code runs on the main thread. Workers are not required for production functionality. If a worker is available and functional, use it; if blocked under `file://`, use deterministic main-thread implementation where technically safe. No network fallback is permitted.
- **Zero-network requirement**: No HTTP/HTTPS requests, no external script/font/image/CDN dependencies, no external worker URLs, no dynamic imports that require HTTP origin.
- Enforce a restrictive CSP and prohibit production network APIs, service workers, dynamic evaluation, and execution of document code or macros.
- Prefer inspectable, dependency-light browser libraries with pinned versions, recorded licenses, and offline bundling.

## Alternatives considered

1. **Backend or cloud workspace:** Rejected for the initial feature because it expands the trust boundary and can transmit real participant PII.
2. **OPFS as the sole evidence store:** Rejected because originals must remain independently accessible and recoverable in a controlled user-selected workspace.
3. **Direct-file-only distribution:** Previously deferred because browser capability and security-context behavior were not consistent enough to assume without validation. Now implemented with runtime capability detection.
4. **Static-origin-only distribution:** Viable fallback, but it adds a launcher step and must remain demonstrably data-blind.

## Consequences

- A browser capability gate is mandatory before governed intake.
- Direct-file and static-origin behavior require separate acceptance evidence.
- Edge validation is a release requirement, not an inferred result from Chromium.
- Direct-file production support is now implemented with runtime capability detection.
- The worker/main-thread fallback strategy ensures production code works under `file://` without requiring worker support.
- Zero-network invariant is enforced by CSP and production security boundary.
- Future amendments require a superseding ADR that preserves the rationale and approval lineage.

## Direct-file production verification evidence

- **Chromium direct-file**: Verified with Playwright tests opening `dist/pbgc-caseworkbench.html` via `file://` URL.
- **Zero network requests**: Verified by tracking outbound requests in browser tests.
- **Workspace capability**: File System Access API (`showDirectoryPicker`) available in Chromium secure context from `file://`.
- **PDF extraction**: Uses `useWorkerFetch: false` (main-thread processing), no external worker required.
- **XLSX generation/download**: Uses `URL.createObjectURL()` and anchor click, works under `file://`.
- **Feasibility status**: Worker probe failure no longer blocks production; only WASM, schema, asset, and CSP checks are required.
