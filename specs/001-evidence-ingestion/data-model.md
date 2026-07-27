# Evidence Ingestion Data Model

**Status**: Draft
**Feature**: 001 Evidence Ingestion
**Branch**: `010-evidence-ingestion`
**Last updated**: 2026-07-26

## Overview

Feature 001 introduces four governed domain entities built on top of Feature 009's preserved inventory: `EvidenceCatalog`, `ProvisionCandidate`, `PlanRuleRecord`, and `UnresolvedItem`. A fifth typed record, `AuthorityOverride`, governs case-specific deviations from the default source-authority order. All five reuse Feature 009 primitives (`Sha256`, `Uuid`, `UtcTimestamp`, `HumanActor`, `Result`, content-hash-bound append-only replay, gapless `appendOrdinal`) and are validated by the existing Ajv contract pipeline against four new Draft 2020-12 schemas placed under `web/src/contracts/schemas/`.

Every governed entity is **immutable once authored**, **content-hash bound**, and **replayable**. Mutations (re-authoring, supersession, override issuance, unresolved-item resolution) append a new typed event with `appendOrdinal` and `prior*` linkage rather than overwriting the prior record. State is computed by a deterministic projection over the replay chain (mirroring Feature 009's `DecisionProjection`), never stored in the event itself.

## Primitive reuse (from Feature 009)

| Primitive | Source | Used by |
|---|---|---|
| `Sha256` (lowercase hex) | `web/src/domain/shared/types.ts` | every entity's content/locator hash |
| `Uuid` | `web/src/domain/shared/types.ts` | every record id and decision id |
| `UtcTimestamp` | `web/src/domain/shared/types.ts` | every occurredAt/decidedAt/reviewedAt |
| `HumanActor` | `web/src/domain/quarantine/models.ts` | every reviewer/approver/author identity |
| `Result<T, E>` | `web/src/domain/shared/types.ts` | every operation return type |
| `canonicalize`/`hashTyped` | `web/src/domain/manifests/canonical-json.ts` | every content hash |
| `EvidenceRelationship` | `web/src/domain/classification/models.ts` | near-duplicate, supersession, amendment, authority, conflict, effective-period links |
| `DecisionProjection` pattern | `web/src/domain/classification/models.ts` | every computed projection |
| gapless replay + validTransition pattern | `web/src/domain/classification/relationship-service.ts` | `SupersessionChain`, `UnresolvedItem` resolution, `AuthorityOverride` issuance |

## Entity: EvidenceCatalog

The catalog is the typed, hash-anchored entry point for every eligible artifact in a case. Built from Feature 009's reactive `ScreenedArtifactOutcome[]`; never re-screens or re-hashes originals (Decision 1).

### Schema identity

- `$id`: `https://pbgc-caseworkbench/schemas/evidence-catalog.schema.json`
- `schemaVersion`: `1.0.0`
- Draft: `2020-12`

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `catalogId` | `Uuid` | yes | immutable catalog id, regenerated per rebuild |
| `caseId` | `Uuid` | yes | inherited from Feature 009 case-workspace |
| `builtAt` | `UtcTimestamp` | yes | build wall-clock — excluded from the catalog's deterministic hash |
| `schemaVersion` | `"1.0.0"` | yes | |
| `caseEvidence` | readonly array of `EvidenceArtifact` | yes | case-evidence section (plan docs, amendments, CBAs, notices, reports, workpapers) |
| `referenceOnly` | readonly array of `EvidenceArtifact` | yes | reference-only section (regulations, training, PBGC policy) — never backs a rule without an `AuthorityOverride` |
| `excludedQuarantined` | readonly array of `ExcludedQuarantinedEntry` | yes | every artifact excluded by Feature 009 quarantine — recorded so the catalog never silently drops evidence |
| `catalogContentSha256` | `Sha256` | yes | deterministic hash over `catalogId`, `caseId`, sorted `caseEvidence`, sorted `referenceOnly`, sorted `excludedQuarantined` — excludes `builtAt` and `schemaVersion` |

### Invariants

1. Each `EvidenceArtifact.sha256` MUST appear in exactly one of `caseEvidence` or `referenceOnly`, never both.
2. `excludedQuarantined` MUST contain every artifact whose Feature 009 `ScreeningResult.provisionalState` is `provisional-quarantine` or `provisional-safety-block` at build time.
3. `builtAt` is excluded from `catalogContentSha256` so the catalog is reproducible; every other field participates.
4. The catalog is regenerated, never mutated. Rebuilds produce byte-identical `catalogContentSha256` for the same set of screened-and-released artifacts.

### State transitions

`EvidenceCatalog` has no internal state machine — it is a snapshot produced by an authorized rebuild. State lives in the underlying Feature 009 inventory and quarantine records; this entity is a deterministic projection.

## Entity: EvidenceArtifact

The unit a `ProvisionCandidate` or `PlanRuleRecord` can cite. Inherits everything immutable from Feature 009's `ArtifactRecord` plus a typed `sourceRole`.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `artifactId` | `Uuid` | yes | from Feature 009 `ArtifactRecord.artifactId` |
| `sha256` | `Sha256` | yes | immutable content hash from Feature 009 |
| `sizeBytes` | integer ≥ 0 | yes | from Feature 009 `ArtifactRecord` |
| `locator` | string (workspace-relative path) | yes | from Feature 009 `ArtifactRecord.locator` |
| `mediaType` | string or null | yes | from Feature 009 |
| `receiptId` | `Uuid` | yes | from Feature 009 `ReceiptRecord` — preserved across exact duplicates |
| `exactDuplicateOfSha256` | `Sha256` or null | yes | the canonical hash when this artifact is an exact duplicate; null when none |
| `containedBySha256` | `Sha256` or null | yes | parent container hash when this entry is an extracted member |
| `sourceRole` | `SourceRole` enum | yes | typed role (see below) |
| `reviewStatus` | `"provisional"` \| `"released"` \| `"stale"` | yes | reuses Feature 009 quarantine release states; `stale` is set by `authority-service` currency checks |
| `importedAt` | `UtcTimestamp` | yes | from Feature 009 receipt — excluded from rule-authoring hashes unless the rule explicitly depends on import time (no rule does by default) |

### SourceRole enum

```text
"executed-plan-document"
"amendment"
"collective-bargaining-agreement"
"notice"
"actuarial-report"
"certified-case-report"
"supporting-administrative-report"
"approved-historical-calculation-artifact"
"regulation"
"training-reference"
"other"
```

The default source-authority order (constitution section 4) applies in this enum's declaration order, with `regulation` and `training-reference` ranking below `approved-historical-calculation-artifact` and `inference` ranking below all listed. The full ordering is encoded in `authority-service.ts` and surfaced by `queryAuthority`.

### Invariants

1. `sha256`, `sizeBytes`, `locator`, `receiptId`, `exactDuplicateOfSha256`, `containedBySha256`, and `importedAt` MUST be byte-identical to the values in the Feature 009 inventory record for that artifact. Feature 001 MUST NOT re-derive them.
2. `sourceRole` MUST be set by deterministic typing rules over Feature 009's classification output. An ambiguous typing emits an `UnresolvedItem` of kind `ambiguous-source-role` rather than defaulting to `other`.
3. `reviewStatus` MUST be `released` to back any `PlanRuleRecord`. A `provisional` or `stale` artifact citation rejects rule authoring and emits or links an `UnresolvedItem`.

### State transitions for `reviewStatus`

```text
provisional ──release-by-009-human-review──> released ──stale-detected──> stale
released    ──re-import-changed-bytes──────> (new artifact record, prior stays released + immutable)
stale       ──re-review-human-resolution───> released  (records a new typed ResolvedUnresolvedItem)
```

A `stale` artifact never silently regresses to `released`; the transition requires an authorized human resolution appended to the affected `UnresolvedItem`.

## Entity: ProvisionCandidate

A proposal-only, locator-anchored extraction. Traces to exactly one `EvidenceArtifact` and an exact locator. Never final without an authorized human approval (FR-006, FR-007).

### Schema identity

- `$id`: `https://pbgc-caseworkbench/schemas/provision-candidate.schema.json`
- `schemaVersion`: `1.0.0`
- Draft: `2020-12`

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `candidateId` | `Uuid` | yes | immutable candidate id |
| `artifactSha256` | `Sha256` | yes | the cited `EvidenceArtifact.sha256` |
| `artifactLocator` | string (JSON Pointer / page+offset / sheet+cell / line+offset) | yes | exact locator within the artifact |
| `provisionIdentifier` | string | yes | human-readable stable identifier (e.g., "section 4.1(a)") — deterministic when extractable, free-text when not |
| `verbatimText` | string | yes | byte-exact text from the source at the locator |
| `normalizedRestatement` | string | yes | deterministic restatement produced by `candidate-extraction.ts` |
| `extractedEffectiveDate` | string (`YYYY-MM-DD`) or null | yes | when the source explicitly states an effective date for this provision |
| `extractedAdoptionDate` | string (`YYYY-MM-DD`) or null | yes | when the source explicitly states an adoption or execution date |
| `dateExtractionConvention` | `"explicit"` \| `"inferred-from-context"` \| `"unknown"` | yes | never silently inferred; `inferred-from-context` is proposal-only and linkable to an `UnresolvedItem` |
| `confidence` | number ∈ [0, 1] | yes | deterministic score from extractor parameters |
| `classifierId` | string | yes | identifier of the deterministic extractor that emitted this candidate |
| `classifierVersion` | string | yes | extractor schema version |
| `ruleSetVersion` | string | yes | Feature 001 rule-set version (e.g., `feature-001-evidence-ingestion-v1`) |
| `status` | `"proposed"` \| `"unresolved"` | yes | never `"approved"` at the candidate level — approval produces a `PlanRuleRecord`, not a status change |
| `candidateContentSha256` | `Sha256` | yes | deterministic hash over all fields except `candidateId` (excluded for replayability across regenerated UUIDs) |

### Invariants

1. `artifactSha256` MUST match a `sha256` in the case-evidence section of an `EvidenceCatalog`. Citations to the `referenceOnly` section are recorded but MUST NOT back a final `PlanRuleRecord` without an `AuthorityOverride`.
2. `verbatimText` MUST be byte-exact text from the source at `artifactLocator`. The deterministic extractor never alters verbatim text; the restatement is a parallel field.
3. The candidate is a proposal-only record. The only way to make it authoritative is to author a `PlanRuleRecord` citing it (or, in a supersession scenario, multi-candidate) and approve that record.
4. `status` of `"unresolved"` MUST be accompanied by ≥1 `UnresolvedItem` linkage; the linkage is stored in the unresolved-item's `evidence` array.

### State transitions

`ProvisionCandidate.status` has two values only. A `proposed` candidate becomes `unresolved` when an unresolved item references it, and returns to `proposed` only when that unresolved item is superseded or resolved. Neither transition is silent — both are typed events backed by replayable decisions.

Approval does not change the candidate's status. Approval produces a new `PlanRuleRecord` that references the candidate's `candidateContentSha256`. The candidate remains immutable and queryable.

## Entity: PlanRuleRecord

The effective-dated, source-cited, immutable authoritative rule. Authored by an authorized human; never silently covers a period outside its effective dates (FR-012, FR-013, FR-014).

### Schema identity

- `$id`: `https://pbgc-caseworkbench/schemas/plan-rule-record.schema.json`
- `schemaVersion`: `1.0.0`
- Draft: `2020-12`

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `ruleId` | `Uuid` | yes | immutable rule id |
| `governingRestatement` | string | yes | normalized restatement of the rule (matches `ProvisionCandidate.normalizedRestatement` when promoted from one) |
| `primaryCitation` | `RuleCitation` | yes | exactly one — the authoritative source. See below. |
| `supportingCitations` | readonly array of `RuleCitation` | yes | zero-or-more supporting citations from the catalog. Does not include the primary citation. Ordered by deterministic priority. |
| `effectiveDate` | string (`YYYY-MM-DD`) | yes | from-scope-only effective date (constitution section 5). MUST NOT be inferred silently. |
| `endDate` | string (`YYYY-MM-DD`) or null | yes | the date the rule stops governing; null when no end date is recorded; transitions to a successor rule append a supersession event rather than mutating this field |
| `adoptionOrExecutionDate` | string (`YYYY-MM-DD`) or null | yes | when the source records one |
| `applicabilityConditions` | readonly array of `ApplicabilityCondition` | yes | participant group, benefit purpose, service definition, actuarial-equivalence purpose, freeze/restriction, amendment period |
| `supersessionChain` | readonly array of `SupersessionLink` | yes | empty for a rule with no predecessor; gapless by replay |
| `confidence` | number ∈ [0, 1] | yes | final review confidence (may exceed candidate confidence but ≥ the primary candidate's confidence unless an `AuthorityOverride` is recorded) |
| `authorityOverrideId` | `Uuid` or null | yes | linked `AuthorityOverride` when one authorizes using a non-default source; null otherwise |
| `authorHuman` | `HumanActor` | yes | the authorized human who authored the rule |
| `authoredAt` | `UtcTimestamp` | yes | excluded from `ruleContentSha256` for replayability |
| `reviewStatus` | `"human-approved"` \| `"provisional"` | yes | never `"automated-final"` |
| `linkedUnresolvedItemIds` | readonly array of `Uuid` | yes | every outstanding unresolved item covering this rule's scope; authoring is rejected when this list is non-empty unless each item is explicitly linked as "consumed assumption" with rationale |
| `ruleSetVersion` | string | yes | Feature 001 rule-set version |
| `schemaVersion` | `"1.0.0"` | yes | |
| `ruleContentSha256` | `Sha256` | yes | deterministic hash over `ruleId`, `governingRestatement`, `primaryCitation`, sorted `supportingCitations`, `effectiveDate`, `endDate`, `adoptionOrExecutionDate`, sorted `applicabilityConditions`, sorted `supersessionChain`, `confidence`, `authorityOverrideId`, `linkedUnresolvedItemIds`, `ruleSetVersion`, `schemaVersion` — excludes `authorHuman` and `authoredAt` for human/timestamp-immune replay |

### RuleCitation

| Field | Type | Notes |
|---|---|---|
| `artifactSha256` | `Sha256` | the `EvidenceArtifact.sha256` |
| `artifactLocator` | string | exact locator within the artifact |
| `sourceRole` | `SourceRole` | from the `EvidenceArtifact.sourceRole` cited |
| `provisionIdentifier` | string or null | the cited provision's identifier |
| `citationLocator` | string | a sub-locator of `artifactLocator` narrowing the citation |

### ApplicabilityCondition

| Field | Type | Notes |
|---|---|---|
| `dimension` | `"participant-group" \| "benefit-purpose" \| "service-definition" \| "actuarial-equivalence-purpose" \| "freeze-or-restriction" \| "amendment-period"` | the dimension the condition distinguishes |
| `value` | string | the condition's named value (e.g., `"early-retirement-supplement"`, `"pre-2020-07-31-service"`) |
| `evidence` | readonly array of `RuleCitation` | the citations supporting this condition |

### SupersessionLink

```text
{
  "ordinal": 1,                                  // appendOrdinal, gapless
  "predecessorRuleId": Uuid | null,              // null only for the first rule in a chain
  "predecessorRuleContentSha256": Sha256 | null,  // hash-bound prior linkage
  "successorRuleId": Uuid,
  "successorRuleContentSha256": Sha256,
  "effectiveDate": "YYYY-MM-DD",                 // when the successor takes effect
  "linkType": "supersession" | "amendment" | "re-authoring" | "repeal"
}
```

### Invariants

1. Exactly one `primaryCitation`. Multi-source rules record the remainder as `supportingCitations`.
2. `primaryCitation.sourceRole` MUST NOT be `"regulation"`, `"training-reference"`, or `"other"` unless `authorityOverrideId` is non-null and references a valid `AuthorityOverride` for this rule.
3. `effectiveDate` and `endDate` MUST satisfy `effectiveDate <= endDate` whenever both are present (the rule's date range).
4. A `PlanRuleRecord` MUST be queryable for any effective date in `[effectiveDate, endDate)` and return exactly itself; queries outside the range return the appropriate predecessor or successor.
5. `linkedUnresolvedItemIds` MUST contain every outstanding unresolved item whose `affectedScope` intersects the rule's scope at authoring time. Authoring is rejected with `BLOCKED_BY_UNRESOLVED_ITEM` when an item covers the scope and is not present in the list.
6. `reviewStatus` is `"human-approved"` once authored by a `HumanActor`; `"provisional"` is reserved for deterministic pre-authoring projections only (rules never ship as `"provisional"`).
7. `ruleContentSha256` is treated as the rule's immutable identity. A new successor rule (re-authoring against a higher-authority source, replacing a superseded rule) has a **new** `ruleContentSha256` and a **new** `ruleId`, with the predecessor-succossor link in `supersessionChain`. The prior record is never mutated in place.

### State transitions (computed, not stored)

```text
gapless chain of PlanRuleEvents ─replay-with-validTransition─> PlanRuleProjection:
  { status: "active" | "superseded" | "repealed",
    effectiveRuleId: Uuid | null,
    effectiveRuleContentSha256: Sha256 | null,
    effectiveAsOfDate: "YYYY-MM-DD",
    chainProvenance: readonly Uuid[] }
```

Permitted transitions (using Feature 009's pattern):

- `null → active` via `author` event with `linkType="initial"` — first rule in a brand-new chain
- `active → superseded` via `supersede` event containing `linkType="supersession"|"amendment"|"re-authoring"` and a successor rule
- `active → repealed` via `repeal` event with no successor
- `superseded → active` via `reinstate` event (only when a prior supersession is itself revoked under the same gapless replay; rare, but the mathematics of the chain permits it)
- `repealed → active` only via `reauthor` (a fresh rule with a new chain — explicitly not a transition; treated as a new top-level chain)

## Entity: UnresolvedItem

First-class record of an ambiguous interpretation, conflicting source, missing sequencing, hidden-content flag, or stale/superseded source (FR-017 through FR-020).

### Schema identity

- `$id`: `https://pbgc-caseworkbench/schemas/unresolved-item.schema.json`
- `schemaVersion`: `1.0.0`
- Draft: `2020-12`

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemId` | `Uuid` | yes | |
| `kind` | enum (see below) | yes | |
| `affectedScope` | string | yes | free-text but required — describes what the item covers |
| `competingInterpretations` | readonly array of `Interpretation` | yes | MUST have ≥ 2 entries; never collapsed to a single value (the moment it collapses, the item is no longer `open`) |
| `consequence` | string | yes | calculation/liability consequence if left unresolved |
| `linkedUnresolvedItemIds` | readonly array of `Uuid` | yes | items this item depends on or supersedes; empty when independent |
| `reviewerHuman` | `HumanActor` or null | yes | the responsible reviewer; null only at creation, set at assignment |
| `assignee` | `HumanActor` or null | yes | alternative to `reviewerHuman` when the assignee differs from the recorder |
| `openAt` | `UtcTimestamp` | yes | |
| `resolutionHistory` | readonly array of `ResolutionEvent` | yes | gapless content-hash-bound replay chain, exactly mirroring Feature 009's pattern |
| `itemContentSha256` | `Sha256` | yes | deterministic over all fields except `itemId`, `openAt`, `reviewerHuman`, and `resolutionHistory` author/timestamp fields — replayable across human/timestamp variation |
| `status` | `"open" \| "resolved" \| "superseded"` | yes | computed projection over `resolutionHistory`; never stored as authority |

### Kind enum

```text
"ambiguous-text"
"conflicting-provisions"
"missing-sequencing"
"undefined-term"
"hidden-content-flag"
"stale-source"
"superseded-source"
"missing-required-value"
"ambiguous-source-role"
"other"
```

### Interpretation

| Field | Type | Notes |
|---|---|---|
| `interpretationId` | `Uuid` | stable per interpretation |
| `statement` | string | the interpretation as the candidate reviewer phrased it |
| `evidence` | readonly array of `RuleCitation` | the citations supporting this interpretation |
| `sourceCandidateId` | `Uuid` or null | linked `ProvisionCandidate.candidateId` when applicable |

### ResolutionEvent

| Field | Type | Notes |
|---|---|---|
| `eventId` | `Uuid` | |
| `appendOrdinal` | integer ≥ 1 | gapless |
| `priorEventId` | `Uuid` or null | null only for the first event in the chain |
| `priorEventContentSha256` | `Sha256` or null | |
| `decisionType` | `"accept" \| "supersede" \| "reject" \| "branch"` | |
| `resultingStatus` | `"open" \| "resolved" \| "superseded"` | |
| `actor` | `HumanActor` | automated actors never resolve unresolved items |
| `decidedAt` | `UtcTimestamp` | excluded from the event content hash |
| `rationale` | string | |
| `consumedAssumptions` | readonly array of `Uuid` | `PlanRuleRecord` ids that explicitly consumed this item as a documented assumption if the resolution is `accept` |
| `eventContentSha256` | `Sha256` | hash over all fields except `eventId` and `decidedAt` |

### Invariants

1. `competingInterpretations.length >= 2` whenever `status` is `"open"`. A status transition to `"resolved"` MUST come with a `decisionType="accept"` event and the selected interpretation recorded in `consumedAssumptions` (or, when none is consumed, in the rationale).
2. The decision author MUST be a `HumanActor`. Automated actors cannot resolve unresolved items.
3. `appendOrdinal` is gapless from 1; `priorEventId` and `priorEventContentSha256` are required for ordinals ≥ 2 and must match the preceding event exactly.
4. The resolution chain supports a `branch` decision that spawns a successor unresolved item (the constitution's "competing interpretations shall be preserved" rule — branches preserve the non-selected path rather than erasing it).
5. `status` is always the computed projection over `resolutionHistory`; the persistence format stores it redundantly as a cache but the validator recomputes it.

## Entity: AuthorityOverride

The typed record authorizing a non-default source as the primary citation for a `PlanRuleRecord` (FR-015, FR-024).

### Schema identity

- `$id`: same schema file as `plan-rule-record.schema.json` (typed sub-record, `$ref` from there) plus a separate top-level `authority-override` schema if it carries independent lifecycle state. Decision 4 specifies independent replayable issuance, so `authority-override.schema.json` is a separate top-level schema.

### Fields

| Field | Type | Required | Notes |
|---|---|---|---|
| `overrideId` | `Uuid` | yes | |
| `caseId` | `Uuid` | yes | |
| `affectedRuleScope` | string | yes | the rule scope this override authorizes |
| `authorizedSourceRole` | `SourceRole` | yes | the role that would normally be rejected (`regulation`, `training-reference`, `other`) |
| `authorizedArtifactSha256` | `Sha256` | yes | the specific reference-artifact hash authorized as canonical for this purpose — never blanket authorizes a directory or filename |
| `scopeRationale` | string | yes | free-text "why this source for this purpose" |
| `defaultAuthorityOrder` | readonly array of `SourceRole` | yes | the canonical order at issuance time, recorded so future currency reviews see what was in effect |
| `issuer` | `HumanActor` | yes | |
| `issuedAt` | `UtcTimestamp` | yes | excluded from content hash |
| `overrideContentSha256` | `Sha256` | yes | deterministic over all fields except `overrideId` and `issuedAt` |
| `schemaVersion` | `"1.0.0"` | yes | |

### Invariants

1. An `AuthorityOverride` authorizes **one** `authorizedArtifactSha256` for **one** `affectedRuleScope`. A second scope or artifact requires a new override.
2. `issuer` MUST be a `HumanActor` with the case authority context recorded (constitution section 4: "Case-specific determinations may alter this order only through an explicit approval record").
3. Issuing a new `AuthorityOverride` that supersedes a prior one for the same scope appends a new typed event (replayable) rather than mutating the prior.

## Cross-references and determinism

Cross-entity references are always `Sha256`-bound (cite the artifact hash, candidate content hash, or rule content hash) and never `Uuid`-only. This guarantees that replaying the same authoritative history (artifacts + candidates + rules + unresolved items) yields byte-identical deterministic output regardless of UUID or wall-clock variation, mirroring Feature 009's `CanonicalContext` and `hashTyped` (`web/src/domain/manifests/canonical-json.ts:196-222`).

JSON Pointer is used as the canonical locator when the source artifact is parsed JSON; page/offset (for PDFs), sheet/cell (for spreadsheets), and line/offset (for plain text) are stored alongside but always accompanied by an artifact-hash anchor so a mismatched hash invalidates the citation.

## Validation rules summary

The four new schemas enforce this data model at the contract layer. The deterministic-validate boundary uses JSON Schema Draft 2020-12 (existing Ajv integration). Semantic rules (gapless `appendOrdinal`, hash-bound `prior*` linkage, no-authority-promotion-without-override, no-rule-without-released-citation) are enforced twice:

1. By the JSON Schema `if/then` and `dependentSchemas` blocks where feasible (capture the structural shape).
2. By the deterministic domain code (`rule-authoring.ts`, `authority-service.ts`, `unresolved-items.ts`) where behavioral replay rules are required.

The latter set is covered by `web/tests/contract/evidence-contracts.test.ts` and corresponding `web/tests/unit/domain/plan-rules/*.test.ts` files specified in `tasks.md`.

## State transition matrix (quick reference)

| Entity | Initial event | Permitted transitions |
|---|---|---|
| `EvidenceArtifact.reviewStatus` | `provisional` (inherited from 009) | `provisional → released` (009 human review), `released → stale` (currency detection), `stale → released` (human resolution via unresolved item) |
| `ProvisionCandidate.status` | `proposed` | `proposed → unresolved` (unresolved-item linkage), `unresolved → proposed` (item superseded/resolved) |
| `PlanRuleRecord` (chain projection) | `active` via `author` | `active → superseded` (supersede), `active → repealed` (repeal), `superseded → active` (reinstate after revocation) |
| `UnresolvedItem.status` | `open` | `open → resolved` (accept), `open → superseded` (supersede or branch), `resolved → open` only via `branch` event in a parallel chain |
| `AuthorityOverride` | issued | issued → superseded-by-new-override (separate chain) |

All transitions require a `HumanActor`. Automated code may propose and compute projections; only a human (or a typed replay chain) finalizes a transition. This matches the Feature 009 pattern exactly.
