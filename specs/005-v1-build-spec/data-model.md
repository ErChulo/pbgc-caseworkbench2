# Data Model: Governed V1 Build Specification

**Feature**: 005
**Contract**: BuildSpec `2.0.0`
**Authority**: Constitution 2.0.0, governed Feature004 architecture, committed Feature006 compiler contract

## Deterministic and Operational Boundaries

The BuildSpec payload contains stable architecture-derived lineage time, deterministic identities, compiler inputs, validation state, and `buildSpecContentSha256`. The hash excludes its own hash field and `validation.validatedAt`. Export/import actor, tool, and event timestamps are injected operational envelopes and never affect BuildSpec identity.

## FormulaGovernanceInput

| Field | Rule |
|---|---|
| `approvedPlanRules` | Explicit supplied `PlanRuleRecord[]`; records must be human approved and unresolved-item free when used |
| `formulas` | One exact governance entry per observed applicable formula cell/run |

Each formula governance entry contains `cellKey`, `scenarioId`, and a gapless hash-bound `FormulaApprovalRecord` decision chain. Every decision binds the exact formula text, target, scenario, I/O/B, complete source rule IDs/hashes, derivation, affected tests, regeneration impact, oracle IDs, human actor, rationale, and timestamp. Approve, revoke, and supersede transitions are replayed; generation requires an effective non-revoked approval. Exactly one source rule is governing and its ID/hash must appear in the architecture run justification.

## BuildSpecV2

| Field | Rule |
|---|---|
| `schemaVersion` | Exactly `2.0.0` |
| `buildSpecId` | Deterministic SHA-256-derived UUID |
| `architectureId`, `architectureContentSha256`, `caseId`, `ruleSetVersion`, `architectureLineage` | Exact re-authenticated architecture record identity, content binding, and complete lineage projection |
| `generatedAt` | Stable architecture lineage timestamp |
| `formulas` | Sorted `FormulaDefinitionV2[]` |
| `namedRanges` | Exact architecture names, targets, and scopes |
| `cellMappings` | Exact applicable cell/run mappings with deterministic UUIDs |
| `executionOrder` | Deterministic Kahn result |
| `validation` | Aggregated, deterministically sorted result |
| `buildSpecContentSha256` | Canonical deterministic payload hash |

## FormulaDefinitionV2

Formulas exist only when the architecture observed a nonempty formula and the cell is `O` or `B` for the run. Target tab/cell/field/scenario, formula text, I/O/B, and justification are copied exactly. `formulaKind` is `scalar`. Dependencies contain only formula IDs reached by exact entries in `architecture.formulaDependencies` for the same run.

`FormulaProvenance` preserves each complete authenticated `PlanRuleRecord`, including all citations and applicability evidence, the effective formula approval decision, affected tests, regeneration impact, and independent oracle IDs. It does not reduce material rule provenance to a single citation or supersession pointer.

## NamedRangeDefinition

`rangeName`, `cellAddress`, `tabName`, `scope`, and nullable `genericField` are copied exactly from one architecture named range. `scenarioId` is null because Feature004 names are architecture-level identities. Workbook names are unique case-insensitively; sheet names are unique case-insensitively within their exact sheet. No generated names or suffixes are allowed.

## CellMapping

One mapping exists for every applicable architecture cell/run classification. `mappingId` is a deterministic UUID over architecture hash, run, and cell key. All I/O/B values are preserved.

| I/O/B | `dataSource` | `formulaId` |
|---|---|---|
| `I` | Required exact population source | null |
| `O` | null | Required observed formula |
| `B` | Required exact population source | Required observed formula |
| `N`, `P`, `""` | null | null |

`CALC_INDICATOR` and `CALCULATION` remain ordinary governed generic-field identities with Feature004-enforced classifications; neither is inferred from I/O/B.

## ExecutionOrder

`order` is Kahn topological order with codepoint tie-breaking. `maxDepth` is the largest zero-based dependency depth; `levelCount` is zero for no formulas and otherwise `maxDepth + 1`. `cycleNodes` contains only members of cyclic strongly connected components, not downstream blocked formulas. Validation rejects unknown, missing, or duplicate execution IDs and any supplied execution metadata that differs from recomputation.

## Validation

Errors cover architecture authentication, missing formulas/data sources/governance, duplicate formula/range/mapping identities, provenance, exact mapping mismatches, unsatisfied/external dependencies, cycles, canonical in-grid A1 addresses, and schema failure. Generation returns all available sorted errors and no BuildSpec on failure.

## Export and Import

`BuildSpecExport` contains the BuildSpec, matching content hash, and separate `ExportMetadata`. Export and import each validate the full schema, independently rerun `validateBuildSpec`, compare embedded validation with recomputation, and verify applicable embedded/envelope hashes. Import returns separate `ImportMetadata` with `verified: true`; any failure returns no trusted BuildSpec.
