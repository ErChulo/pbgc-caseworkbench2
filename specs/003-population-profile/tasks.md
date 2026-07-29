# Tasks: Population Profile

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 001 evidence ingestion

## Phase 1: Core Types and Models

- [x] T001 Define `PopulationCandidateProfile`, `PopulationEvidenceObservation` types
- [x] T002 Define `PopulationCandidateDecision`, `PopulationDecisionProjection` types
- [x] T003 Define `WorkbookPopulationProfile`, `PopulationWorkbookSheet`, `WorkbookNamedRangeObservation` types
- [x] T004 Define `PopulationProfileError` with fail-closed error codes

## Phase 2: Population Candidate Creation

- [x] T005 Implement deterministic `createPopulationEvidenceObservation` with SHA-256 hashing
- [x] T006 Implement deterministic `createPopulationCandidate` with candidate key computation
- [x] T007 Implement `validatePopulationEvidence` for manifest and hash verification
- [x] T008 Implement duplicate evidence detection (keys and citations)

## Phase 3: Decision Chain Governance

- [x] T009 Implement `replayPopulationCandidateDecisions` with gapless chain validation
- [x] T010 Implement decision transition state machine (approve/reject/revoke/supersede)
- [x] T011 Implement human actor validation
- [x] T012 Implement `populationDecisionContentHash` for decision verification

## Phase 4: Workbook and Tabular Profiling

- [x] T013 Implement `adaptWorkbookExtraction` for passive workbook parsing
- [x] T014 Implement workbook sheet and cell profiling without formula execution
- [x] T015 Implement `workbookProfileContentHash` with sorted named range binding
- [x] T016 Implement `TabularPopulationProfile` for delimited data
- [x] T017 Implement `classifyRawValue` for cell value kind detection

## Phase 5: Tests

- [x] T018 Add population-detector unit tests
- [x] T019 Add mock-population integration tests
- [x] T020 Add population-review browser verification tests
- [x] T021 Add evidence validation tests

## Phase 6: Quality Gate

- [x] T022 Run typecheck, lint, and format checks
- [x] T023 Run unit test suite
- [x] T024 Run integration and browser tests
- [x] T025 Verify downstream consumption by Feature 004

Feature 003 maturity: Tested (Constitution section 13 level 3). Not independently validated or human approved.

## Dependencies

Feature 001 evidence ingestion provides population evidence observations. Feature 004 (V1 Architecture Selector) consumes `PopulationCandidateProfile` and `PopulationDecisionProjection` for population-driven architecture justification.
