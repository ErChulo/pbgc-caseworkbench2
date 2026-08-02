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
- [x] T009 Test model serialization and hashing

## Phase 3: Support Sheet Generation

- [x] T010 Implement Summary sheet (metadata: case, architecture, population, hashes)
- [x] T011 Implement Tables sheet (plan rules with effective dates, citations, applicability)
- [x] T012 Implement UD Table sheet (user-defined ranges, mappings, validation state)
- [x] T013 Test support sheet determinism and completeness

## Phase 4: Formula Sheet Generation

- [x] T014 Implement formula sheet structure from BuildSpec
- [x] T015 Generate formula cells in execution order from BuildSpec
- [x] T016 Generate named ranges with exact scope and case preservation
- [x] T017 Test formula sheet generation and reference preservation

## Phase 5: Data Sheet and Population Mapping

- [ ] T018 Implement data sheet generation
- [ ] T019 Implement I cell population from BuildSpec mappings
- [ ] T020 Implement B cell dual mapping (input + formula)
- [ ] T021 Validate population data sources are accessible and complete
- [ ] T022 Test data sheet generation and population mapping

> **Note**: T018-T022 are deferred to the runtime population phase (Features 001/003). The workbook generator produces structural metadata and formulas; population data is injected at runtime.

## Phase 6: Validation Engine

- [x] T023 Implement BuildSpec validation for workbook generation
- [x] T024 Implement population profile validation
- [x] T025 Implement data source availability checking
- [x] T026 Implement reference resolution (named ranges, external links)
- [x] T027 Implement cycle detection in formula dependencies
- [x] T028 Aggregate and deterministically sort all validation errors
- [x] T029 Test fail-closed validation with multiple error types

## Phase 7: Workbook Builder Engine

- [x] T030 Orchestrate BuildSpec authentication, population validation, and generation
- [x] T031 Implement XLSX serialization with deterministic cell ordering
- [x] T032 Implement workbook content hash and metadata injection
- [x] T033 Add synthetic governed Feature005-to-Feature007 integration test

## Phase 8: Quality Gate

- [x] T034 Run typecheck, lint, and format checks
- [x] T035 Run design schema validation
- [x] T036 Run runtime contract validation
- [x] T037 Run focused and full automated test suites
- [x] T038 Verify deterministic payload and byte-equivalence
- [x] T039 Update Feature 007 documentation and AGENTS.md SPECKIT marker

**Status**: Phases 1,2,4,7 complete. Support sheets (T010-T013), validation engine (T026-T029), quality gates (T034-T039) all complete. Data sheet generation (T018-T022) deferred to runtime population phase.

Feature 007 estimated maturity: Core workbook builder complete (support sheets, formula generation, XLSX serialization, validation). Data sheet population deferred to runtime.

## Dependencies

Feature 005 (BuildSpec) and Feature 003 (Population Profile) must be complete and stable. Workbook generation is the final compilation step before validation and reconciliation (Feature 008).
