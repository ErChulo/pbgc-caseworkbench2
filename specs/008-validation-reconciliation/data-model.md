# Data Model: Validation and Reconciliation

**Feature**: 008
**Authority**: Constitution 2.0.0, Feature 007 (Workbook), Feature 005 (BuildSpec)

## ValidationResult

| Field | Rule |
|---|---|
| `validationId` | Deterministic UUID |
| `workbookContentSha256` | Hash of validated workbook |
| `buildSpecContentSha256` | BuildSpec governing the workbook |
| `architectureContentSha256` | Architecture governance |
| `populationProfileContentSha256` | Population profile hash |
| `validatedAt` | UTC timestamp of validation |
| `validator` | Tool/system that performed validation (e.g., "workbook-validator/1.0.0") |
| `status` | "valid" \| "invalid" \| "warnings" |
| `errors` | `ValidationError[]` (deterministically sorted) |
| `warnings` | `ValidationWarning[]` (deterministically sorted) |
| `structuralValidation` | Schema, reference, and named-range checks |
| `populationValidation` | Data source, cardinality, type checks |
| `formulaValidation` | Circular dependency, reachability checks |
| `reconciliationStatus` | "pending" \| "reconciled" \| "failed" |
| `validationContentSha256` | Deterministic hash of this result |

## ValidationError

| Field | Rule |
|---|---|
| `code` | Error code (SCHEMA_VIOLATION, BROKEN_REFERENCE, DUPLICATE_NAME, MISSING_DATA_SOURCE, CIRCULAR_DEPENDENCY, etc.) |
| `severity` | "error" (blocks validation) |
| `affectedCells` | A1 notation of affected cells |
| `affectedNames` | Named range names affected |
| `message` | Safe, non-technical message |
| `detail` | Technical detail for logging |
| `remediation` | Suggested fix (references BuildSpec, governance, population) |

## ValidationWarning

| Field | Rule |
|---|---|
| `code` | Warning code (STALE_ORACLE_ID, MISSING_TEST_COVERAGE, TOLERANCE_EXCEEDED, etc.) |
| `severity` | "warning" (logged, non-blocking) |
| `affectedCells` | A1 notation or null |
| `message` | Safe message |
| `detail` | Technical detail |

## ReconciliationInput

| Field | Rule |
|---|---|
| `workbook` | V1 Workbook from Feature 007 |
| `buildSpec` | Governing BuildSpec |
| `validationResult` | Prior validation evidence |
| `oracleId` | Identifier of external oracle (ValTool, Runtime, ATPBGC, BCV, reference calc, prior run) |
| `oracleResults` | Results from external execution or reference calculation |
| `toleranceProfile` | Per-formula or per-cell rounding/precision tolerance |
| `populationSensitivity` | de-identified, synthetic-mock, authorized-real, unknown |

## ReconciliationResult

| Field | Rule |
|---|---|
| `reconciliationId` | Deterministic UUID |
| `workbookContentSha256` | Hash of reconciled workbook |
| `validationId` | ID of validation evidence used |
| `oracleId` | ID of oracle executed |
| `oracleExecutedAt` | Timestamp of oracle execution |
| `reconciliationStatus` | "complete" \| "mismatches" \| "oracle-unavailable" \| "oracle-error" |
| `mismatches` | `ReconciliationMismatch[]` (deterministically sorted) |
| `tolerance` | Applied tolerance profile |
| `matchCount` | Number of verified formulas |
| `mismatchCount` | Number of formula mismatches |
| `errorCount` | Number of oracle errors |
| `reviewedBy` | Human actor who approved reconciliation (optional) |
| `reviewRationale` | Approval rationale (optional) |
| `reconciliationContentSha256` | Deterministic hash |

## ReconciliationMismatch

| Field | Rule |
|---|---|
| `cellAddress` | A1 notation |
| `formulaId` | From BuildSpec |
| `formulaText` | For diagnostics |
| `expectedValue` | Result from oracle |
| `actualValue` | Result from workbook |
| `difference` | Numeric difference or type mismatch description |
| `withinTolerance` | Boolean; true if within allowance |
| `severity` | "error" (outside tolerance) \| "warning" (within tolerance) |
| `diagnostics` | Information for triage |

## ReconciliationOracle

| Field | Rule |
|---|---|
| `oracleId` | Unique identifier for execution record |
| `oracleType` | "external-execution" \| "reference-calculation" \| "prior-validated-run" \| "independent-oracle" |
| `toolName` | "ValTool" \| "Runtime" \| "ATPBGC" \| "BCV" \| "Custom" or null |
| `executedAt` | UTC timestamp |
| `executionVersion` | Tool/calc version |
| `populationSnapshot` | Population data version/hash |
| `buildSpecSnapshot` | BuildSpec hash used by oracle |
| `results` | `OracleFormulaResult[]` (one per formula) |
| `reliability` | "trusted" \| "provisional" \| "unknown" |
| `executionEvidence` | Link to external execution record (e.g., URI, file hash) |

## OracleFormulaResult

| Field | Rule |
|---|---|
| `formulaId` | From BuildSpec |
| `cellAddress` | A1 notation |
| `computedValue` | Result from oracle |
| `computedType` | "number" \| "text" \| "date" \| "boolean" \| "error" |
| `error` | Error message if oracle failed (optional) |
| `precision` | Numeric precision maintained by oracle |

## ToleranceProfile

| Field | Rule |
|---|---|
| `profileId` | Identifier |
| `absoluteTolerance` | Absolute numeric difference allowed (e.g., 0.01) |
| `relativeTolerance` | Relative percentage allowed (e.g., 0.001 for 0.1%) |
| `roundingMethod` | "banker's" \| "away-from-zero" \| "down" or other |
| `cellLevelOverrides` | Per-cell or per-formula overrides |
| `effectiveDate` | When tolerance profile applies |
