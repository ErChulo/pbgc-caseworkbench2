# Feature Specification: Validation and Reconciliation

**Feature Branch**: `008-validation-reconciliation`
**Created**: 2026-07-18
**Last governed update**: 2026-07-29
**Status**: Planning; not yet implemented

## Purpose

Validate generated V1 workbooks against their governing BuildSpecs, plan rules, and population profiles. Reconciliation compares workbook results against independent oracles (external executions, reference calculations, prior validated runs) to detect formula errors, data mapping mismatches, and rule application failures. Validation evidence becomes the independent oracle for subsequent case iterations.

## User Stories

### US1 - Validate workbook structural integrity (P1)

Workbooks are validated for schema correctness, reference integrity, named range uniqueness, and consistency with their BuildSpec.

Acceptance:

1. All named ranges resolve to valid cells and respect scope.
2. Formulas reference only defined names and valid cells.
3. I/B cells map to valid population data sources.
4. No circular dependencies exist in formula cells.
5. Cell values match expected types (numeric, text, date, boolean, error).

### US2 - Reconcile formula results (P1)

Workbook formula results are compared against independent oracles to detect calculation errors.

Acceptance:

1. Workbook formulas can be executed (in ValTool, Runtime, or local evaluator).
2. Results are compared against reference calculations, prior validated runs, or external execution.
3. Mismatches are flagged with affected formulas and cells.
4. Tolerance thresholds (e.g., rounding) are applied per formula classification.

### US3 - Validate population data application (P1)

Population data is verified to be correctly mapped into I/B cells and used by dependent formulas.

Acceptance:

1. All population data sources are accessible and complete.
2. Population records match declared cardinality.
3. Data types match cell classifications (numeric, text, date).
4. No participant values are invented or imputed.
5. B cells receive both formula and population input correctly.

### US4 - Generate validation and reconciliation evidence (P2)

Validation results are recorded and become the oracle for future reconciliation.

Acceptance:

1. Validation results include version, timestamp, oracle ID, and responsible reviewer.
2. Failed validations block approval; warnings are recorded but non-blocking.
3. Evidence is machine-readable and supports structured reconciliation queries.
4. Reconciliation decisions are traced to validation evidence.

## Functional Requirements

- **FR-001** Validate workbook schema against the workbook structural contract.
- **FR-002** Validate all named ranges resolve and are case-insensitively unique within scope.
- **FR-003** Validate all formula references are satisfied (named ranges, cells, external links).
- **FR-004** Validate I/B cells map to complete population data sources.
- **FR-005** Detect circular dependencies and unreachable cells.
- **FR-006** Execute workbook formulas or accept external execution results.
- **FR-007** Compare formula results against independent oracle (reference calculation, prior run, external execution).
- **FR-008** Record and classify mismatches (formula error, data error, tolerance mismatch, oracle unavailable).
- **FR-009** Validate population data cardinality, types, and completeness.
- **FR-010** Reject reconciliation if required oracle is unavailable.
- **FR-011** Generate deterministic validation and reconciliation reports.
- **FR-012** Preserve all validation metadata: versions, oracle IDs, responsible reviewer, timestamp, rationale.

## Success Criteria

- Workbooks pass structural validation against schema.
- Formula results reconcile within tolerance against independent oracle.
- Population data is correctly applied without invention or imputation.
- Validation evidence is machine-readable and enables subsequent reconciliation.
- Failed validations are recorded and prevent approval.

## Out of Scope

- Interactive workbook editing
- Formula execution optimization
- Participant benefit distribution
- External system integration (ValTool, Runtime, ATPBGC, BCV) except as external oracles
- Real workbook deployment
