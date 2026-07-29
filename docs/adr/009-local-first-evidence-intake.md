# ADR 009: Local-first evidence intake foundation

- **Status:** Accepted
- **Approving authority:** Repository owner
- **Approval date:** 2026-07-25
- **Supersedes:** Nothing
- **Superseded by:** Nothing

## Context

Feature 009 must preserve authorized case evidence and participant PII on the user's device, produce one downloadable HTML artifact, operate with zero network access, and retain deterministic content separately from operational state. Browser security rules differ between direct `file://` execution and a loopback static origin, particularly for the File System Access API and persistent storage.

## Proposed decision

Use a local-first browser trust boundary with these constraints:

- Distribute one self-contained HTML file with scripts, styles, workers, schemas, WASM, and static assets inlined.
- Prefer direct `file://` execution only where the required browser capabilities pass the approved feasibility suite.
- Otherwise use a data-blind loopback/static-origin launcher that serves immutable application bytes only, performs no server-side case processing, and receives no case data.
- Keep original evidence and governed workspace state in a user-selected local directory. Use OPFS only for bounded, recoverable working state; it is not the authoritative evidence store.
- Keep canonical deterministic payloads separate from UUIDs, timestamps, UI state, storage paths, and other operational metadata.
- Support production desktop Chromium and Edge only after both pass the same capability, CSP, single-file, and zero-network checks.
- Enforce a restrictive CSP and prohibit production network APIs, service workers, dynamic evaluation, and execution of document code or macros.
- Prefer inspectable, dependency-light browser libraries with pinned versions, recorded licenses, and offline bundling.

## Alternatives considered

1. **Backend or cloud workspace:** Rejected for the initial feature because it expands the trust boundary and can transmit real participant PII.
2. **OPFS as the sole evidence store:** Rejected because originals must remain independently accessible and recoverable in a controlled user-selected workspace.
3. **Direct-file-only distribution:** Deferred because browser capability and security-context behavior are not consistent enough to assume without validation.
4. **Static-origin-only distribution:** Viable fallback, but it adds a launcher step and must remain demonstrably data-blind.

## Consequences

- A browser capability gate is mandatory before governed intake.
- Direct-file and static-origin behavior require separate acceptance evidence.
- Edge validation is a release requirement, not an inferred result from Chromium.
- Phase 2 may proceed using the approved data-blind static-origin mode after both supported browsers pass the feasibility gate; direct-file execution remains unavailable where any required capability is blocked.
- Future amendments require a superseding ADR that preserves the rationale and approval lineage.
