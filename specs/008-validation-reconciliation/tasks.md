# Tasks: Validation and Reconciliation

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 007 (Workbook), Feature 005 (BuildSpec), Feature 003 (Population Profile)

## Phase 1: Setup and Core Models

- [ ] T001 Verify `web/src/domain/validation-reconciliation/` and unit-test structure
- [ ] T002 Define `ValidationResult`, `ValidationError`, `ValidationWarning` types
- [ ] T003 Define `ReconciliationResult`, `ReconciliationMismatch`, `ReconciliationOracle`, `OracleFormulaResult` types
- [ ] T004 Define `ToleranceProfile` type
- [ ] T005 Implement deterministic content hashing for validation and reconciliation results

## Phase 2: Structural Validation

- [ ] T006 Implement workbook schema and format validation
- [ ] T007 Implement named range validation (resolution, scope uniqueness)
- [ ] T008 Implement formula reference validation (cells, names, external links)
- [ ] T009 Implement circular dependency and unreachable cell detection
- [ ] T010 Test structural validation with valid and invalid workbooks

## Phase 3: Population Application Validation

- [ ] T011 Implement I/B cell population mapping validation
- [ ] T012 Validate population data completeness and cardinality
- [ ] T013 Validate data types match cell classification
- [ ] T014 Implement missing/invented data detection
- [ ] T015 Test population application validation

## Phase 4: Reconciliation and Tolerance

- [ ] T016 Implement tolerance evaluation (absolute, relative, rounding methods)
- [ ] T017 Implement `workbookReconciler` comparing workbook to `ReconciliationOracle`
- [ ] T018 Implement mismatch classification and diagnostic generation
- [ ] T019 Implement oracle integration contracts (parsers for external tool results)
- [ ] T020 Test reconciliation with various tolerance profiles and mismatches

## Phase 5: Evidence Generation

- [ ] T021 Implement `ValidationResult` generation with sorted errors/warnings
- [ ] T022 Implement `ReconciliationResult` generation with metadata and summary metrics
- [ ] T023 Implement human review and rationale recording for reconciliation
- [ ] T024 Test evidence generation and hashing

## Phase 6: Orchestration and Engine

- [ ] T025 Implement unified validation engine orchestrating structural, population, and reconciliation
- [ ] T026 Implement fail-closed behavior for validation errors
- [ ] T027 Add synthetic governed Feature 007-to-Feature 008 integration test

## Phase 7: Quality Gate

- [ ] T028 Run typecheck, lint, and format checks
- [ ] T029 Run design schema validation
- [ ] T030 Run runtime contract validation
- [ ] T031 Run focused and full automated test suites
- [ ] T032 Verify deterministic payload and byte-equivalence for evidence
- [ ] T033 Update Feature 008 documentation and AGENTS.md SPECKIT marker

Feature 008 estimated maturity: To be determined post-implementation.

## Dependencies

Feature 007 (Workbook Builder) provides the workbooks to be validated. Feature 005 (BuildSpec) and Feature 003 (Population Profile) provide the governing criteria.
