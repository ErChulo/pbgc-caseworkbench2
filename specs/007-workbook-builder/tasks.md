# Tasks: Workbook Builder

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 005 (BuildSpec), Feature 003 (Population Profile)

## Phase 1: Setup and Contracts

- [x] T001 Verify `web/src/domain/workbook-builder/` and unit-test structure
- [ ] T002 Define workbook schema (structural contract for XLSX)
- [ ] T003 Verify schema registration in design/runtime validation tools
- [x] T004 Add exceljs dependency with determinism evaluation
- [ ] T005 Add workbook schema acceptance and validation tests

## Phase 2: Core Models and Types

- [x] T006 Define `V1Workbook`, `WorkbookSheet`, `WorkbookCell` types
- [x] T007 Define `SupportSheetContent`, `PopulationDataSource`, `ValidationResult` types
- [x] T008 Implement deterministic workbook content hash computation
- [ ] T009 Test model serialization and hashing

## Phase 3: Support Sheet Generation

- [ ] T010 Implement Summary sheet (metadata: case, architecture, population, hashes)
- [ ] T011 Implement Tables sheet (plan rules with effective dates, citations, applicability)
- [ ] T012 Implement UD Table sheet (user-defined ranges, mappings, validation state)
- [ ] T013 Test support sheet determinism and completeness

## Phase 4: Formula Sheet Generation

- [ ] T014 Implement formula sheet structure from BuildSpec
- [ ] T015 Generate formula cells in execution order from BuildSpec
- [ ] T016 Generate named ranges with exact scope and case preservation
- [ ] T017 Test formula sheet generation and reference preservation

## Phase 5: Data Sheet and Population Mapping

- [ ] T018 Implement data sheet generation
- [ ] T019 Implement I cell population from BuildSpec mappings
- [ ] T020 Implement B cell dual mapping (input + formula)
- [ ] T021 Validate population data sources are accessible and complete
- [ ] T022 Test data sheet generation and population mapping

## Phase 6: Validation Engine

- [x] T023 Implement BuildSpec validation for workbook generation
- [x] T024 Implement population profile validation
- [x] T025 Implement data source availability checking
- [ ] T026 Implement reference resolution (named ranges, external links)
- [ ] T027 Implement cycle detection in formula dependencies
- [x] T028 Aggregate and deterministically sort all validation errors
- [ ] T029 Test fail-closed validation with multiple error types

## Phase 7: Workbook Builder Engine

- [x] T030 Orchestrate BuildSpec authentication, population validation, and generation
- [ ] T031 Implement XLSX serialization with deterministic cell ordering
- [ ] T032 Implement workbook content hash and metadata injection
- [ ] T033 Add synthetic governed Feature005-to-Feature007 integration test

## Phase 8: Quality Gate

- [ ] T034 Run typecheck, lint, and format checks
- [ ] T035 Run design schema validation
- [ ] T036 Run runtime contract validation
- [ ] T037 Run focused and full automated test suites
- [ ] T038 Verify deterministic payload and byte-equivalence
- [ ] T039 Update Feature 007 documentation and AGENTS.md SPECKIT marker

**Status**: Foundation phase (T001-T008, T023-T030) complete. Core models and validation infrastructure in place. XLSX serialization and support sheet generation pending.

Feature 007 estimated maturity: To be determined post-implementation.

## Dependencies

Feature 005 (BuildSpec) and Feature 003 (Population Profile) must be complete and stable. Workbook generation is the final compilation step before validation and reconciliation (Feature 008).
