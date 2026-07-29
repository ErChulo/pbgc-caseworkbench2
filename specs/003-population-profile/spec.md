# Feature Specification: Population Profile

**Feature Branch**: `003-population-profile`
**Created**: 2026-07-18
**Last governed update**: 2026-07-29
**Status**: Implemented; documentation in progress

## Purpose

Transform approved population evidence into deterministic population candidate profiles and governed decision chains. Population profiles identify observed fields, record counts, sensitivity level, workbook profile hashes, and human approval state. The model drives architecture selection and prevents invented participant data.

## User Stories

### US1 - Detect population candidates (P1)

Given passive evidence extraction results, generate deterministic `PopulationCandidateProfile` records describing the observed population artifact and its structure.

Acceptance:

1. Candidate keys are deterministic SHA-256 hashes.
2. Evidence observations preserve artifact hash, citation ID, locator, and observed value.
3. Observed fields and record counts are preserved exactly.
4. Sensitivity is classified as authorized-real, de-identified, synthetic-mock, or unknown.
5. Corrections or imputations are always false.

### US2 - Govern population approval (P1)

Population candidates require human decisions before they can drive downstream architecture selection.

Acceptance:

1. Decision chains are gapless and unbranched.
2. Only human actors may approve, reject, revoke, or supersede candidates.
3. Decisions bind exact candidate key, artifact hash, and workbook profile hash.
4. Invalid transitions or stale hashes are rejected.
5. Replay yields a deterministic projection of current approval status.

### US3 - Profile workbook/tabular population sources (P1)

Passive workbook and tabular extractions are adapted into deterministic population profiles without executing formulas.

Acceptance:

1. Workbook profiling preserves sheet names, hidden-sheet status, cell addresses, and raw value kinds.
2. Formula execution count remains zero.
3. Named range observations preserve name, source tab, cell address, and definition sheet.
4. Workbook profile content hash is deterministic.
5. Invalid or incomplete passive extraction blocks profiling.

## Functional Requirements

- **FR-001** Deterministically create `PopulationEvidenceObservation` and `PopulationCandidateProfile`.
- **FR-002** Validate all population evidence against a complete manifest.
- **FR-003** Reject duplicate evidence keys or citation identifiers.
- **FR-004** Recompute candidate and decision content hashes for verification.
- **FR-005** Model decision chains with approve, reject, revoke, and supersede transitions.
- **FR-006** Reject non-human actors and invalid decision transitions.
- **FR-007** Adapt workbook passive extraction into `WorkbookPopulationProfile` without formula execution.
- **FR-008** Preserve exact workbook named range observations.
- **FR-009** Record workbook profile hash and bind it to governance decisions.
- **FR-010** Never infer or impute missing participant values.

## Success Criteria

- Population candidates validate deterministically.
- Decision replay produces stable governed status projection.
- Workbook and tabular population profiles are deterministic and formula-free.
- Unit, integration, and browser verification tests pass.
- Downstream architecture selection accepts governed population profiles.

## Out of Scope

- Participant benefit calculation
- Plan-rule authoring
- Workbook generation
- Formula execution
- External population services
