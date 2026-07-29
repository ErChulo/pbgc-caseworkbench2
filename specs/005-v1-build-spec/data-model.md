# Data Model: V1 Build Specification

**Feature**: 005 V1 Build Specification
**Date**: 2026-07-28
**Authority**: [spec.md](./spec.md) and Constitution 2.0.0

## Modeling conventions

- All UUID fields are immutable UUID strings generated from a cryptographic RNG.
- SHA-256 values are lowercase 64-character hexadecimal strings.
- Timestamps are ISO 8601 UTC strings.
- Status histories are append-only events.
- Every contract carries `schemaVersion`.
- PBGC Case Workbench Canonicalization Profile v1 governs deterministic serialization.

## Entity relationship overview

```text
BuildSpec 1 ── * FormulaDefinition
          1 ── * NamedRangeDefinition
          1 ── * CellMapping
          1 ── 1 ExecutionOrder
          1 ── 1 ValidationResult

FormulaDefinition * ── 1 CellMapping
NamedRangeDefinition * ── 1 CellMapping
```

## 1. BuildSpec

The deterministic build specification containing all instructions for workbook generation.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | string | Required; `"1.0.0"` |
| `buildSpecId` | UUID | Immutable identity |
| `architectureId` | UUID | Links to V1Architecture |
| `caseId` | UUID | Case context |
| `ruleSetVersion` | string | Pins normalization rules |
| `generatedAt` | timestamp | Operational metadata |
| `formulas` | FormulaDefinition array | Sorted by formulaId |
| `namedRanges` | NamedRangeDefinition array | Sorted by rangeName |
| `cellMappings` | CellMapping array | Sorted by field, then tab |
| `executionOrder` | ExecutionOrder | Topologically sorted |
| `validation` | ValidationResult | Generated validation result |
| `buildSpecContentSha256` | SHA-256 | Hash of canonical payload |

**Invariants**:
- `formulas.length > 0` when architecture has output fields
- `namedRanges.length == cellMappings.length`
- `executionOrder.formulaIds.length == formulas.length`
- `validation.isValid == true` for exported BuildSpecs

## 2. FormulaDefinition

A formula to be compiled for a specific field in a specific scenario.

| Field | Type | Rules |
|---|---|---|
| `formulaId` | string | Format: `FORMULA-{tab}-{field}-{scenario}` |
| `scenarioId` | string | Links to architecture scenario |
| `tabName` | string | Source tab name |
| `genericField` | string | Normalized field name |
| `formulaText` | string | Original formula text from architecture |
| `cellAddress` | string | Target cell address |
| `dependencies` | string array | formulaIds of dependencies |
| `iobClassification` | IoBValue | I, O, B, N, P, or "" |
| `justification` | string | Classification rationale |

**Invariants**:
- `formulaId` is unique within the BuildSpec
- `dependencies` contains only valid formulaIds
- No circular dependencies in the dependency graph
- `formulaText` is non-empty for O and B fields

## 3. NamedRangeDefinition

A named range mapping a generic field name to a cell address.

| Field | Type | Rules |
|---|---|---|
| `rangeName` | string | Generic field name or scenario-qualified |
| `cellAddress` | string | Absolute cell address |
| `tabName` | string | Source tab name |
| `scope` | enum | `workbook` or `sheet` |
| `genericField` | string | Original generic field name |
| `scenarioId` | string or null | null for global ranges |
| `provenance` | object | Source of the mapping |

**Invariants**:
- `rangeName` is unique within scope
- `cellAddress` is valid for the target workbook
- Scenario-qualified names use format `{scenario}_{field}`

## 4. CellMapping

A mapping from a field to its source and processing information.

| Field | Type | Rules |
|---|---|---|
| `mappingId` | UUID | Immutable identity |
| `field` | string | Generic field name |
| `tabName` | string | Source tab name |
| `cellAddress` | string | Cell address in workbook |
| `iobClassification` | IoBValue | I, O, B, N, P, or "" |
| `dataSource` | DataSourceReference or null | Required for I and B fields |
| `formulaId` | string or null | Required for O and B fields |
| `scenarioId` | string | Scenario context |

**Invariants**:
- `dataSource` is non-null when `iobClassification` is I or B
- `formulaId` is non-null when `iobClassification` is O or B
- `dataSource` and `formulaId` are mutually exclusive for I and O fields

### DataSourceReference

| Field | Type | Rules |
|---|---|---|
| `sourceType` | enum | `population`, `case-control`, `evidence` |
| `sourceTab` | string | Source tab name |
| `sourceField` | string | Field name in source |
| `evidenceKey` | SHA-256 or null | For evidence sources |

## 5. ExecutionOrder

A topologically sorted list of formula identifiers.

| Field | Type | Rules |
|---|---|---|
| `order` | string array | Sorted formulaIds |
| `levelCount` | number | Number of dependency levels |
| `maxDepth` | number | Maximum dependency depth |
| `hasCycles` | boolean | Always false for valid BuildSpecs |
| `cycleNodes` | string array | Empty for valid BuildSpecs |

**Invariants**:
- `order.length == formulas.length`
- For each formula, all dependencies appear earlier in `order`
- `hasCycles == false` for valid BuildSpecs
- `cycleNodes` is empty when `hasCycles == false`

## 6. ValidationResult

The result of validating a BuildSpec.

| Field | Type | Rules |
|---|---|---|
| `isValid` | boolean | true if no errors |
| `errors` | ValidationError array | Sorted by code, then field |
| `warnings` | ValidationWarning array | Sorted by code, then field |
| `validatedAt` | timestamp | When validation ran |

### ValidationError

| Field | Type | Rules |
|---|---|---|
| `code` | string | Error code |
| `message` | string | Human-readable message |
| `field` | string or null | Related field name |
| `formulaId` | string or null | Related formula |
| `context` | object | Additional error details |

**Error codes**:
- `MISSING_FORMULA`: Output field lacks formula definition
- `DUPLICATE_RANGE`: Named range name conflict
- `UNSATISFIED_DEPENDENCY`: Formula depends on undefined field
- `CIRCULAR_DEPENDENCY`: Cycle in dependency graph
- `INVALID_CELL_ADDRESS`: Malformed cell address
- `MISSING_DATA_SOURCE`: Input field lacks data source

### ValidationWarning

| Field | Type | Rules |
|---|---|---|
| `code` | string | Warning code |
| `message` | string | Human-readable message |
| `field` | string or null | Related field name |
| `context` | object | Additional warning details |

**Warning codes**:
- `UNUSED_RANGE`: Named range not referenced by any formula
- `DEEP_DEPENDENCY`: Formula has >10 dependency levels
- `LARGE_FORMULA`: Formula text >1000 characters

## 7. BuildSpec Export Format

The JSON export format for BuildSpec persistence.

| Field | Type | Rules |
|---|---|---|
| `buildSpec` | BuildSpec | The complete build specification |
| `exportMetadata` | ExportMetadata | Operational metadata |
| `contentSha256` | SHA-256 | Hash of canonical buildSpec payload |

### ExportMetadata

| Field | Type | Rules |
|---|---|---|
| `exportedAt` | timestamp | When exported |
| `exportedBy` | string | Actor identity |
| `schemaVersion` | string | Export schema version |
| `toolVersion` | string | Generator version |

## 8. BuildSpec Import Format

The JSON import format for BuildSpec loading.

| Field | Type | Rules |
|---|---|---|
| `buildSpec` | BuildSpec | The complete build specification |
| `importMetadata` | ImportMetadata | Operational metadata |
| `contentSha256` | SHA-256 | Hash of canonical buildSpec payload |

### ImportMetadata

| Field | Type | Rules |
|---|---|---|
| `importedAt` | timestamp | When imported |
| `importedBy` | string | Actor identity |
| `sourceHash` | SHA-256 | Hash of source bytes |
| `verified` | boolean | Hash verification result |

## 9. Status Values

### IoBClassification

- `I` - Input: Read from population data
- `O` - Output: Calculated result
- `B` - Both: Input and output
- `N` - Neither: Intermediate calculation
- `P` - calculated from another
- `""` - Unclassified

### DataSourceType

- `population` - From population file
- `case-control` - From case control parameters
- `evidence` - From evidence document

### NamedRangeScope

- `workbook` - Visible across all sheets
- `sheet` - Visible only in source sheet
