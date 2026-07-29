# Data Model: Workbook Builder

**Feature**: 007
**Authority**: Constitution 2.0.0, Feature 005 (BuildSpec), Feature 003 (Population Profile)

## WorkbookGenerationInput

| Field | Rule |
|---|---|
| `buildSpec` | Valid `BuildSpecV2` from Feature 005 |
| `populationProfile` | Governed `PopulationDecisionProjection` from Feature 003 |
| `workbookProfileContentSha256` | Hash binding population to workbook structure |
| `generatorVersion` | Semantic version of workbook builder |

## V1Workbook

| Field | Rule |
|---|---|
| `workbookId` | Deterministic UUID |
| `buildSpecId` | Inherited from input BuildSpec |
| `buildSpecContentSha256` | Inherited from input BuildSpec |
| `architectureId` | Inherited from BuildSpec |
| `architectureContentSha256` | Inherited from BuildSpec |
| `caseId` | Inherited from BuildSpec |
| `populationProfileDecisionId` | ID of governing population decision |
| `populationProfileContentSha256` | Hash of population profile |
| `generatedAt` | UTC timestamp (stable from BuildSpec) |
| `sheets` | `WorkbookSheet[]` |
| `namedRanges` | Exact copy from BuildSpec |
| `cellMappings` | Exact copy from BuildSpec with populated I cell sources |
| `formulaCells` | `FormulaCell[]` in execution order |
| `support` | `SupportSheetContent` |
| `workbookContentSha256` | Deterministic hash of workbook content |

## WorkbookSheet

| Field | Rule |
|---|---|
| `name` | Sheet name (exact from architecture) |
| `hidden` | Boolean; false for data/formula sheets |
| `cells` | `WorkbookCell[]` |

## WorkbookCell

| Field | Rule |
|---|---|
| `address` | A1 notation (canonical) |
| `kind` | "formula" \| "input" \| "output" \| "label" \| "blank" |
| `formulaText` | Formula string or null |
| `value` | Runtime value or null |
| `dataSource` | Population data source (for I cells) or null |
| `mappingId` | Reference to `CellMapping` or null |

## FormulaCell

| Field | Rule |
|---|---|
| `cellAddress` | A1 notation |
| `tabName` | Sheet containing formula |
| `formulaText` | Exact text from BuildSpec |
| `formulaId` | From BuildSpec |
| `dependencies` | `FormulaCell[]` in execution order |
| `provenance` | Governance and approval metadata |
| `executionOrder` | Index in topological sort |
| `executionLevel` | Dependency depth |

## SupportSheetContent

| Field | Rule |
|---|---|
| `summarySheet` | Metadata: case ID, architecture ID, population ID, hashes |
| `tablesSheet` | Plan rules with effective dates, citations, applicability |
| `udTableSheet` | User-defined ranges, mappings, validation state |

## PopulationDataSource

| Field | Rule |
|---|---|
| `sourceTab` | Sheet name in population workbook |
| `columnIdentifier` | Column header or index |
| `rowRange` | Starting row (1-indexed) and count |
| `recordCount` | Number of records |
| `recordHash` | Content hash for reconciliation |

## WorkbookValidationResult

| Field | Rule |
|---|---|
| `status` | "valid" \| "invalid" |
| `errors` | `ValidationError[]` (deterministically sorted) |
| `warnings` | `ValidationWarning[]` (deterministically sorted) |
| `workbookContentSha256` | Hash if valid; null if invalid |

## ValidationError

| Field | Rule |
|---|---|
| `code` | Error code (MISSING_DATA_SOURCE, BROKEN_REFERENCE, CYCLE_DETECTED, etc.) |
| `message` | Safe, non-technical message |
| `affectedCells` | A1 notation of affected cells |
| `severity` | "error" (blocks generation) |

## ValidationWarning

| Field | Rule |
|---|---|
| `code` | Warning code (STALE_FORMULA_TEXT, MISSING_ORACLE_ID, etc.) |
| `message` | Safe message |
| `affectedCells` | A1 notation or null |
| `severity` | "warning" (logged, non-blocking) |
