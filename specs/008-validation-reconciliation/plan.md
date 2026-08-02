# Implementation Plan: Validation and Reconciliation

**Feature**: 008 Validation and Reconciliation
**Date**: 2026-07-29
**Status**: Implemented and tested; ready for human approval

## Summary

Feature 008 validates generated V1 workbooks (Feature 007) for structural integrity and reconciles formula results against independent oracles. It produces machine-readable validation evidence necessary for maturity claims (Constitution section 13). Failed validations block approval, while successful reconciliation with external execution or reference calculations establishes independent validation.

## Technical Context

- TypeScript 6 strict mode
- Web Crypto for deterministic hashing
- Input: `V1Workbook` (Feature 007), `BuildSpecV2` (Feature 005), `PopulationDecisionProjection` (Feature 003), `ReconciliationOracle` results
- Output: `ValidationResult`, `ReconciliationResult`
- Consumers: Case approval workflows, regression test suites

## Architecture

```text
V1Workbook ──+
BuildSpecV2 ─┼--> workbookValidator() ──> ValidationResult
Population ──+

ValidationResult ─────+
V1Workbook ───────────┼--> workbookReconciler() ──> ReconciliationResult
ReconciliationOracle ─+
ToleranceProfile ─────+
```

## Implementation Decisions

1. Structural validation must pass before reconciliation is attempted.
2. Reconciliation requires an explicitly identified independent oracle.
3. Mismatches are evaluated against a defined tolerance profile.
4. Population data mapping is verified without inventing missing values.
5. All validation and reconciliation results are deterministic and hashed.
6. Execution of external systems (ValTool, Runtime) is out of scope; their results are consumed via the `ReconciliationOracle` interface.

## Project Structure

```text
web/src/domain/validation-reconciliation/
├── models.ts
├── structural-validator.ts
├── population-validator.ts
├── formula-reconciler.ts
├── tolerance.ts
├── oracle-integration.ts
└── evidence-generation.ts

web/tests/unit/domain/validation-reconciliation/
├── structural-validator.test.ts
├── population-validator.test.ts
├── formula-reconciler.test.ts
├── tolerance.test.ts
└── evidence-generation.test.ts

web/tests/integration/
├── workbook-validation.test.ts
└── oracle-reconciliation.test.ts
```

## Constitution Check

| Requirement                              | Result                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------- |
| Deterministic actuarial computation      | Pass: validation and reconciliation are deterministic; no LLM use            |
| Evidence and effective-date traceability | Pass: complete metadata (versions, oracle IDs, reviewer, timestamp) recorded |
| Missing data                             | Pass: validates population application without inventing values              |
| V1 concept separation                    | Pass: structural validation respects CALC, CALCULATION, I/O/B                |
| Human review                             | Pass: manual review supported; records reviewer and rationale                |
| Reproducibility                          | Pass: deterministic hashing of validation and reconciliation results         |
| Validation evidence                      | Feature 008 _is_ the validation evidence generator                           |

No constitutional exception required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, focused Feature 008 unit tests, Feature 008 integration tests, `npm test`.
