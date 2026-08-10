# ADR 010: Versioned evidence catalog and eligibility replay

- **Status:** Accepted
- **Approving authority:** Repository owner
- **Approval date:** 2026-08-09
- **Supersedes:** Feature 001 research Decision 8 only where it requires a single immutable `catalog.json`
- **Superseded by:** Nothing

## Context

Feature 001 requires an evidence catalog to be immutable once authored and also requires an authorized rebuild when additive intake, review, or source-role state changes. A single create-once `cases/<caseId>/evidence/catalog.json` cannot satisfy both requirements without either overwriting history or preventing later evidence from entering the governed catalog.

Feature 009 also permits revocation of a quarantine release. An inherited artifact-eligibility approval must prove that its cited release was effective when the eligibility decision was made. Requiring that historical release to remain the current quarantine head would make a later valid revocation corrupt otherwise valid decision history.

## Decision

Use immutable catalog snapshots with a pointer-only current head:

- Store each canonical catalog at `cases/<caseId>/evidence/catalogs/<catalogContentSha256>.json` with create-once semantics and post-write verification.
- Store the mutable head at `cases/<caseId>/evidence/catalogs/current.json` as pointer metadata only. It contains the current catalog hash and an operational write timestamp, never catalog content.
- Preserve one stable `catalogId` for the case catalog lineage. Rebuilding the same governed content therefore reproduces the same `catalogContentSha256`; changing catalog content creates a new hash-addressed snapshot.
- Update the pointer only after the immutable snapshot has been validated, written, and read back successfully.
- Retain every prior catalog snapshot. A later evidence import, review decision, or source-role correction never rewrites a prior catalog.
- Treat the prior single-file `catalog.json` layout as non-governing for new production writes. Migration of any shipped legacy catalog requires a separate tested migration before it is accepted as a current head.

Use decision-time binding for release-linked artifact eligibility:

- An `inherit-approval` decision must cite the exact quarantine release ID and content hash that was effective at the point represented by that release in the quarantine chain.
- Replay validates the historical release against the quarantine-chain prefix ending at the cited decision, not against the later current quarantine head.
- If that release is later revoked or superseded, the eligibility history remains structurally valid but its current projection becomes ineligible and blocked.
- A later current projection must never erase, rewrite, or report the historical eligibility approval as if it had not occurred.

## Alternatives considered

1. **Single immutable `catalog.json`:** Rejected because additive evidence and corrected review state could never produce a new governed catalog for the same case.
2. **Overwrite `catalog.json`:** Rejected because it erases prior governed state and breaks immutable lineage.
3. **Timestamped mutable catalogs:** Rejected because timestamps are operational metadata and do not provide deterministic content identity.
4. **Require the cited release to remain current forever:** Rejected because it prevents the Feature 009 release-revocation lifecycle and converts a later valid decision into historical replay corruption.
5. **Silently keep eligibility effective after release revocation:** Rejected because current governed use must fail closed when its safety prerequisite is no longer effective.

## Consequences

- Production candidate extraction may consume only the catalog referenced by the verified current pointer.
- Catalog readers must verify the pointer, snapshot content hash, case binding, source citations, and effective eligibility before updating application state.
- Quarantine release changes can make eligibility ineffective without invalidating append-only history.
- The catalog pointer and catalog snapshots follow the same local-first, fail-closed pattern as evidence manifests, review snapshots, extractions, and corrections.
- Future changes to catalog identity or eligibility transition semantics require a superseding ADR.
