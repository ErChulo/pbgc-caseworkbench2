# Tasks: Validation and Reconciliation

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 007 (Workbook), Feature 005 (BuildSpec), Feature 003 (Population Profile)

## Phase 1: Setup and Core Models

- [x] T001 Verify `web/src/domain/validation-reconciliation/` and unit-test structure
- [x] T002 Define `ValidationResult`, `ValidationError`, `ValidationWarning` types
- [x] T003 Define `ReconciliationResult`, `ReconciliationMismatch`, `ReconciliationOracle`, `OracleFormulaResult` types
- [x] T004 Define `ToleranceProfile` type
- [x] T005 Implement deterministic content hashing for validation and reconciliation results

## Phase 2: Structural Validation

- [x] T006 Implement workbook schema and format validation
- [x] T007 Implement named range validation (resolution, scope uniqueness)
- [x] T008 Implement formula reference validation (cells, names, external links)
- [x] T009 Implement circular dependency and unreachable cell detection
- [x] T010 Test structural validation with valid and invalid workbooks

## Phase 3: Population Application Validation

- [x] T011 Implement I/B cell population mapping validation
- [x] T012 Validate population data completeness and cardinality
- [x] T013 Validate data types match cell classification
- [x] T014 Implement missing/invented data detection
- [x] T015 Test population application validation

## Phase 4: Reconciliation and Tolerance

- [x] T016 Implement tolerance evaluation (absolute, relative, rounding methods)
- [x] T017 Implement `workbookReconciler` comparing workbook to `ReconciliationOracle`
- [x] T018 Implement mismatch classification and diagnostic generation
- [x] T019 Implement oracle integration contracts (parsers for external tool results)
- [x] T020 Test reconciliation with various tolerance profiles and mismatches

## Phase 5: Evidence Generation

- [x] T021 Implement `ValidationResult` generation with sorted errors/warnings
- [x] T022 Implement `ReconciliationResult` generation with metadata and summary metrics
- [x] T023 Implement human review and rationale recording for reconciliation
- [x] T024 Test evidence generation and hashing

## Phase 6: Orchestration and Engine

- [x] T025 Implement unified validation engine orchestrating structural, population, and reconciliation
- [x] T026 Implement fail-closed behavior for validation errors
- [x] T027 Add synthetic governed Feature 007-to-Feature 008 integration test

## Phase 7: Quality Gate

- [x] T028 Run typecheck, lint, and format checks
- [x] T029 Run design schema validation
- [x] T030 Run runtime contract validation
- [x] T031 Run focused and full automated test suites
- [x] T032 Verify deterministic payload and byte-equivalence for evidence
- [x] T033 Update Feature 008 documentation and AGENTS.md SPECKIT marker

**Status**: All phases complete. Validation engine covers structural validation, population application validation, formula reconciliation with tolerance profiles, and evidence generation. Orchestration engine runs validation first, then reconciliation only if validation passes.

Feature 008 estimated maturity: Complete. Validation and reconciliation engine produces deterministic, auditable results.

## Dependencies

Feature 007 (Workbook Builder) provides the workbooks to be validated. Feature 005 (BuildSpec) and Feature 003 (Population Profile) provide the governing criteria.
