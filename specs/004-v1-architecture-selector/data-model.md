# V1 Architecture Selector Data Model

**Feature**: 004-v1-architecture-selector
**Date**: 2026-07-27
**Status**: Draft

## Entity: V1Architecture

The top-level output of the architecture selector. Immutable after computation; content-hashed for integrity.

| Field                       | Type                                | Required | Description                                                                                                       |
| --------------------------- | ----------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `architectureId`            | Uuid                                | yes      | Unique identifier for this architecture record                                                                    |
| `caseId`                    | Uuid                                | yes      | Reference to the case this architecture belongs to                                                                |
| `builtAt`                   | UtcTimestamp                        | yes      | When the architecture was computed                                                                                |
| `schemaVersion`             | const `"1.0.0"`                     | yes      | Schema version                                                                                                    |
| `ruleSetVersion`            | string                              | yes      | Version of the rule set used for selection                                                                        |
| `lineage`                   | V1ArchitectureLineage               | yes      | Exact governed policy, catalog, population, case-control, and applicable authority-override identities and hashes |
| `sourceTabs`                | readonly SourceTab[]                | yes      | Selected population and canonical support tabs                                                                    |
| `runs`                      | readonly RunDescriptor[]            | yes      | Selected calculation runs/scenarios                                                                               |
| `cells`                     | ReadonlyMap<string, CellDescriptor> | yes      | Field inventory keyed by `TAB::CELL_ADDRESS`                                                                      |
| `formulaDependencies`       | readonly FormulaDependency[]        | yes      | Formula dependency graph edges                                                                                    |
| `namedRanges`               | readonly NamedRange[]               | yes      | Plan-level named ranges                                                                                           |
| `architectureContentSha256` | Sha256                              | yes      | Deterministic content hash (excludes this field and the operational `architectureId` and `builtAt` fields)        |

`cells` and each `perRunClassification` are `ReadonlyMap` values in the TypeScript domain. Their JSON contract representation is an object keyed by map key; persistence converts both levels explicitly and reconstructs both maps on load. Native JavaScript `Map` values are never passed directly to JSON Schema validation or `JSON.stringify`.

`architectureId` and `builtAt` are operational record fields. They are retained in the serialized architecture but excluded from `architectureContentSha256`; the hash covers every schema-serializable deterministic field, including `lineage`. This permits content replay independently of record identity and wall-clock time without excluding governed input provenance.

## Entity: SourceTab

A selected observed workbook tab. Population tabs are justified by an exact candidate/artifact/profile binding. Canonical support tabs are justified by the approved workbook profile without being misrepresented as participant populations.

Population tab identity is the NFC-normalized, trimmed, whitespace-collapsed, case-folded tab name. A selected identity is unique. Repeated observations deduplicate only when candidate/artifact lineage, workbook-profile hash, and canonical tab content all agree; every other multi-profile collision is blocked before cells or named ranges are extracted.

| Field                          | Type                        | Required | Description                                             |
| ------------------------------ | --------------------------- | -------- | ------------------------------------------------------- |
| `tabName`                      | string                      | yes      | Name of the observed source tab                         |
| `role`                         | `"population" \| "support"` | yes      | Semantic tab role                                       |
| `workbookProfileContentSha256` | Sha256                      | yes      | Recomputed profile hash bound by the effective approval |
| `populationCandidateKey`       | Sha256 \| null              | yes      | Mandatory for population; null for support              |
| `populationArtifactSha256`     | Sha256 \| null              | yes      | Mandatory for population; null for support              |
| `fieldCount`                   | number                      | yes      | Number of fields in this tab                            |
| `recordCount`                  | number                      | yes      | Number of participant records                           |

## Entity: RunDescriptor

A selected calculation run/scenario.

| Field                | Type                        | Required | Description                                                              |
| -------------------- | --------------------------- | -------- | ------------------------------------------------------------------------ |
| `runId`              | string                      | yes      | Unique scenario/interval identifier (for example `NRD@2006-01-01..open`) |
| `runLabel`           | string                      | yes      | Human-readable label                                                     |
| `effectiveDateRange` | DateRange                   | yes      | Date range where this run applies                                        |
| `justifications`     | readonly RunJustification[] | yes      | Complete sorted contributing IDs/hashes                                  |
| `applicableTabs`     | readonly string[]           | yes      | Which tabs this run applies to                                           |

## Entity: DateRange

| Field       | Type                  | Required | Description                           |
| ----------- | --------------------- | -------- | ------------------------------------- |
| `startDate` | string (date)         | yes      | Inclusive start date                  |
| `endDate`   | string (date) \| null | yes      | Inclusive end date; null = open-ended |

## Entity: RunJustification

For plan-rule scenarios, effective intervals are generated from the nonempty Cartesian intersections of matching rule ranges across every trigger condition. Equal intervals are deduplicated while retaining the union of exact contributors. Each interval receives a stable interval-qualified run ID, so cell classifications, dependencies, and build-spec records can key the historical interval independently.

| Field                    | Type                                          | Required | Description                           |
| ------------------------ | --------------------------------------------- | -------- | ------------------------------------- |
| `source`                 | "plan-rule" \| "case-control" \| "population" | yes      | What entity type justified this run   |
| `referenceId`            | Uuid \| string                                | yes      | ID of the justifying entity           |
| `referenceContentSha256` | Sha256                                        | yes      | Content hash of the justifying entity |

## Entity: CellDescriptor

A single cell in the field inventory, keyed by `TAB::CELL_ADDRESS`.

| Field                  | Type                                   | Required | Description                         |
| ---------------------- | -------------------------------------- | -------- | ----------------------------------- |
| `key`                  | string                                 | yes      | Composite key `TAB::CELL_ADDRESS`   |
| `sourceTab`            | string                                 | yes      | Source tab name                     |
| `cellAddress`          | string                                 | yes      | Cell address (e.g., "A1", "B15")    |
| `genericField`         | string                                 | yes      | Normalized generic field name       |
| `description`          | string                                 | yes      | Human-readable field description    |
| `hasFormula`           | boolean                                | yes      | Whether the cell contains a formula |
| `formulaText`          | string \| null                         | yes      | Formula text if hasFormula is true  |
| `perRunClassification` | ReadonlyMap<string, IoBClassification> | yes      | Per-run I/O/B classification        |

## Entity: IoBClassification

Per-run data-flow classification for a cell.

| Field           | Type     | Required | Description                             |
| --------------- | -------- | -------- | --------------------------------------- |
| `runId`         | string   | yes      | The run this classification applies to  |
| `iob`           | IoBValue | yes      | I/O/B classification                    |
| `justification` | string   | yes      | Why this classification was chosen      |
| `ruleVersion`   | string   | yes      | Version of the classification rule used |

## Entity: IoBValue

Enumeration of I/O/B data-flow values.

```
type IoBValue = "I" | "O" | "B" | "N" | "P" | "";
```

| Value | Meaning                           | Example                  |
| ----- | --------------------------------- | ------------------------ |
| `I`   | Input — read from population data | DOB, BSEX, COMP          |
| `O`   | Output — calculated result        | BENEFIT, PV              |
| `B`   | Both — input and output           | CALC_INDICATOR           |
| `N`   | Neither — formula, not direct I/O | Intermediate calculation |
| `P`   | Calculated from another field     | Derived value            |
| `""`  | Not classified                    | Empty cell               |

## Entity: FormulaDependency

An edge in the formula dependency graph.

| Field           | Type                                  | Required | Description                        |
| --------------- | ------------------------------------- | -------- | ---------------------------------- |
| `dependentKey`  | string                                | yes      | Cell key that contains the formula |
| `dependencyKey` | string                                | yes      | Cell key that is referenced        |
| `runId`         | string                                | yes      | The run this dependency applies to |
| `referenceType` | "cell" \| "named-range" \| "external" | yes      | Type of reference                  |

## Entity: NamedRange

A plan-level named range.

| Field          | Type                  | Required | Description                             |
| -------------- | --------------------- | -------- | --------------------------------------- |
| `name`         | string                | yes      | Named range name (e.g., "Freeze_Date")  |
| `cellAddress`  | string                | yes      | Cell address of the definition          |
| `sourceTab`    | string                | yes      | Tab containing the definition           |
| `scope`        | "workbook" \| "sheet" | yes      | Scope of the named range                |
| `genericField` | string \| null        | yes      | Mapped generic field name if applicable |

## Entity: ScenarioSelectionPolicy

Rules for scenario selection, loaded from `rules/scenario-selection.yaml`.

| Field                       | Type                        | Required | Description                            |
| --------------------------- | --------------------------- | -------- | -------------------------------------- |
| `scenarioId`                | string                      | yes      | Scenario identifier                    |
| `triggerConditions`         | readonly TriggerCondition[] | yes      | Conditions that activate this scenario |
| `exclusionConditions`       | readonly TriggerCondition[] | no       | Conditions that exclude this scenario  |
| `defaultEffectiveDateRange` | DateRange                   | yes      | Default date range if not overridden   |

## Entity: TriggerCondition

A condition that triggers or excludes a scenario.

| Field       | Type                                                                             | Required | Description                                    |
| ----------- | -------------------------------------------------------------------------------- | -------- | ---------------------------------------------- |
| `dimension` | string                                                                           | yes      | What aspect of the plan/population this checks |
| `operator`  | "equals" \| "contains" \| "greater-than" \| "less-than" \| "present" \| "absent" | yes      | Comparison operator                            |
| `value`     | string \| number \| boolean                                                      | yes      | Value to compare against                       |
| `source`    | "plan-rule" \| "population" \| "case-control"                                    | yes      | Where to find the value                        |

For `source: "plan-rule"`, `operator: "absent"` is a governed-negative-evidence query, not a missing-value query. It matches only an applicability condition on the same dimension whose exact canonical value is `absent`; a rule that omits the dimension remains unknown and is not a contributor.

## Entity: TabSelectionPolicy

Rules for tab selection, loaded from `rules/tab-selection.yaml`.

| Field                   | Type              | Required | Description                                       |
| ----------------------- | ----------------- | -------- | ------------------------------------------------- |
| `tabPattern`            | string            | yes      | Pattern or name for the tab                       |
| `requiredFields`        | readonly string[] | yes      | Generic fields that must be present               |
| `populationRequirement` | string \| null    | yes      | Population characteristic that justifies this tab |

The characteristic is read from a hash-bound approved population evidence entry with `evidenceKind: "population-characteristic"` and an observed `{ dimension, value }` pair. Sheet-name similarity is only a workbook mapping step and never establishes the requirement by itself. The same validated dimensions govern population scenario triggers and exclusions; contradictory or missing required combinations block output through unresolved items.

## Entity: IoBClassificationRule

Rules for I/O/B classification, loaded from `rules/iob-classification.yaml`.

| Field           | Type     | Required | Description                          |
| --------------- | -------- | -------- | ------------------------------------ |
| `fieldPattern`  | string   | yes      | Pattern matching generic field names |
| `runPattern`    | string   | yes      | Pattern matching run IDs             |
| `iob`           | IoBValue | yes      | The I/O/B value to assign            |
| `priority`      | number   | yes      | Higher priority wins on conflict     |
| `justification` | string   | yes      | Why this rule exists                 |

## Entity: ArchitecturePolicyApproval

Approval is a separate governed decision record and never metadata controlled by the policy YAML. Each decision records a human actor, rationale, decision ID and timestamp, append ordinal, predecessor ID/hash, action (`approve`, `revoke`, or `supersede`), resulting status, exact policy kind/version/content hash/source-file hash, bound EvidenceCatalog ID/content hash, evidence citations, schema version, and its own deterministic content hash.

Replay requires a gapless, unbranched, hash-bound chain. Every citation must resolve exactly once to a released artifact in a catalog whose content hash is recomputed successfully. Production loading and building require the effective terminal decision to be `approved`; revocation, supersession, absent decisions, stale hashes, changed source bytes, changed parsed content, invalid actors, or catalog/citation mismatch fail closed. Embedded policy fields can never authorize production. Repository YAML contains only `governance.reviewStatus: "provisional"`.

## Entity: V1ArchitectureLineage

Lineage contains exactly four policy entries with kind, version, policy-content hash, source-file hash, approval decision ID, and approval decision hash. It also contains the EvidenceCatalog ID/hash; every population candidate/artifact/workbook-profile/effective approval decision ID/hash; authenticated case-control IDs/hashes; and applicable AuthorityOverride IDs/hashes. The workbook-profile hash deterministically covers observed sheets, cells, workbook limitations, and named-range definitions. Population lineage is admitted only after evidence validation, decision replay, and a builder-side profile rehash prove that the effective decision binds the exact source artifact and profile.
