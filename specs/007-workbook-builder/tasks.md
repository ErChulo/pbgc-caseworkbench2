# Tasks: Workbook Builder

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 005 (BuildSpec), Feature 003 (Population Profile)

## Phase 1: Setup and Contracts

- [x] T001 Verify `web/src/domain/workbook-builder/` and unit-test structure
- [x] T002 Define workbook schema (structural contract for XLSX)
- [x] T003 Verify schema registration in design/runtime validation tools
- [x] T004 Add exceljs dependency with determinism evaluation
- [x] T005 Add workbook schema acceptance and validation tests

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

- [x] T018 Implement data sheet generation
- [x] T019 Implement I cell population from BuildSpec mappings
- [x] T020 Implement B cell dual mapping (input + formula)
- [x] T021 Validate population data sources are accessible and complete
- [x] T022 Test data sheet generation and population mapping

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

**Status**: All phases complete. Workbook builder generates per-tab sheets with formula cells, input cells (populated from population data via resolver), output cells, and merged B cells. Validation covers BuildSpec, population profile, data sources, formula references, and cycle detection.

Feature 007 estimated maturity: Complete. Workbook builder supports full data sheet generation with population data resolution.

## Dependencies

Feature 005 (BuildSpec) and Feature 003 (Population Profile) must be complete and stable. Workbook generation is the final compilation step before validation and reconciliation (Feature 008).
