# Research: Validation and Reconciliation

**Feature**: 008
**Updated**: 2026-07-29

## Decisions

### 1. Structural Validation (FR-001 - FR-005)

**Decision**: Validate generated workbooks against schema, reference integrity, named ranges, and population mapping before any execution or reconciliation.
**Rationale**: Constitution section 14 demands valid structure. A structurally broken workbook cannot be reliably executed or reconciled.
**Alternatives considered**: Ad-hoc checks (brittle), executing anyway (produces garbage errors).

### 2. Reconciliation Oracles (FR-007)

**Decision**: Reconcile workbook results against explicitly identified independent oracles (external executions like ValTool, reference calculations, or prior validated runs). Oracle IDs and execution evidence must be recorded.
**Rationale**: Constitution section 13 requires independent validation and prohibits claiming external execution unless actually performed.
**Alternatives considered**: Self-validation (not independent), omitting oracle IDs (violates evidence requirement).

### 3. Tolerance and Mismatches (FR-008)

**Decision**: Record formula mismatches with expected, actual, difference, and tolerance allowance. Distinguish errors from within-tolerance warnings.
**Rationale**: Actuarial calculations across systems often have minor precision or rounding differences. Tolerance must be explicitly managed and recorded.
**Alternatives considered**: Strict equality (too rigid, constant failure), ignoring differences (unsafe).

### 4. Population Data Application (FR-009)

**Decision**: Verify population data is correctly applied to I/B cells. Cardinality, types, and completeness are validated. No values are invented or imputed.
**Rationale**: Constitution section 6 prohibits inventing participant data. Missing data must be caught here.
**Alternatives considered**: Defaulting to zero (violates Constitution), ignoring missing data (creates false positives).

### 5. Evidence and Provenance (FR-011, FR-012)

**Decision**: Record all validation and reconciliation results, oracle IDs, and human reviews in deterministic, machine-readable format. Hashes ensure tamper detection.
**Rationale**: Constitution requires complete traceability. Validation evidence is the foundation for maturity claims.
**Alternatives considered**: Throwaway logs (loses history), human-only reports (not machine-readable).

### 6. Out-of-Scope Executions

**Decision**: Actual execution of ValTool, Runtime, ATPBGC, or BCV is outside this feature. This feature consumes their results as `ReconciliationOracle` inputs.
**Rationale**: Keeps validation logic decoupled from external system dependencies.
**Alternatives considered**: Building ValTool integration (out of scope for this repository).
