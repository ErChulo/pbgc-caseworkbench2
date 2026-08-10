# Phase 0 Research: Evidence Ingestion

**Date**: 2026-07-26
**Feature**: 001 Evidence Ingestion
**Branch**: `010-evidence-ingestion`

## Scope

This research resolves the Technical Context unknowns for Feature 001's design. Each decision records what was chosen, why, and what was rejected, with sources where applicable. Decisions intentionally avoid prescribing implementation details that belong in `tasks.md`; they constrain the design space the data model and contracts must live in.

## Decision 1: Catalog consumption — read Feature 009 reactive state, never re-screen or re-hash

**Decision**: `EvidenceCatalog` is built by reading the in-memory `ScreenedArtifactOutcome[]` produced by Feature 009's `runScreenedArtifactPipeline` (`web/src/domain/attempts/intake-pipeline.ts:18`). Every `EvidenceArtifact` entry inherits the artifact's immutable `sha256`, `sizeBytes`, `locator`, and receipt provenance from `ArtifactRecord` — Feature 001 never re-hashes, re-screens, or re-extracts text from a preserved original.

**Rationale**: Feature 009 already performs content-addressed preservation with post-write verification (`web/src/adapters/filesystem/content-store.ts:23`) and passive extraction behind a provisional safety block (`intake-pipeline.ts:18-43`). Repeating any of that work would either duplicate governed operations or risk Feature 001 authoring a rule against bytes Feature 009 never confirmed.

**Alternatives considered**:

- Re-hash from preserved bytes: rejected because Feature 009's `SOURCE_HASH_MISMATCH` and `STORED_HASH_MISMATCH` codes are the canonical integrity signals; re-hashing would create a second authority and require its own quarantine path.
- Persist catalog by re-reading files from disk: rejected because Feature 009's already-verified in-memory state is the freshest evidence; disk re-read reintroduces a TOCTOU window Feature 009 deliberately closed.
- Treat quarantined artifacts as eligible-with-warning: rejected by constitution section 11 and FR-003. Quarantine exclusion is non-negotiable and is itself recorded as an unresolved item.

**Sources**:

- `web/src/domain/attempts/intake-pipeline.ts` (Feature 009)
- `web/src/adapters/filesystem/content-store.ts` (Feature 009)
- Constitution sections 11–12.

## Decision 2: Provision-candidate extraction — consume Feature 009 passive parser output; add no new parser

**Decision**: `candidate-extraction.ts` consumes the structured output already produced by Feature 009's passive parsers (`text-parser.ts`, `json-parser.ts`, `delimited-parser.ts`, `pdf-parser.ts`, `ooxml-parser.ts`, `workbook-parser.ts`). Each emitted `ProvisionCandidate` carries the source artifact `sha256`, an exact `locator` (JSON Pointer for JSON, page/offset for PDF, sheet/cell for spreadsheets, line/offset for text), the verbatim text, the normalized restatement, the extracted effective date when present, and a deterministic confidence score. Extraction is proposed-only; no candidate is final.

**Rationale**: Feature 009 already extracts raw text/metadata under a fail-closed, no-execution invariant (training material and parsers are explicitly forbidden to claim "executed safely"). Adding a parallel Feature 001 parser would duplicate that attack surface and break the invariant. Feature 001's job is interpretation (turning extracted text into proposal-only rule restatements), not parsing.

**Alternatives considered**:

- New regex-only extractor: rejected because plan document language is ambiguous and context-dependent; a deterministic extractor that emits unresolved items is safer than one that silently normalizes.
- LLM-only extractor: rejected by constitution section 3 — narrative LLM output shall never be the calculation engine. An LLM may assist drafting but never authors a final candidate without deterministic post-processing and human approval (FR-025).
- Hybrid (LLM proposes, deterministic code validates and emits): permitted as an internal extractor strategy as long as every emitted candidate is proposal-only, content-hash-anchored to its source locator, and the deterministic extractor signs off. This decision does not prescribe the hybrid; it permits it under FR-025.

**Sources**:

- `web/src/adapters/parsers/*` (Feature 009)
- `web/src/domain/attempts/intake-pipeline.ts:18-43` (Feature 009)
- Constitution sections 3 and 8.

## Decision 3: Plan-rule record identity — deterministic content hash, immutable across supersession

**Decision**: Each `PlanRuleRecord` carries a deterministic `ruleContentSha256` over its `ruleId`, normalized restatement, primary citation (artifact hash + locator), effective date, applicability conditions, and confidence. Authoring a successor rule (re-authoring against a higher-authority source, or replacing a superseded rule) creates a **new** linked record with its own content hash; the predecessor's hash and immutable bytes never change. Supersession links are first-class typed events with `appendOrdinal`, `priorRuleId`, `priorRuleContentSha256`, effective date on the link, and a permitted-transition matrix enforced exactly as Feature 009's `relationshipDecisionContentHash` replay rule (`web/src/domain/classification/relationship-service.ts:39-146`).

**Rationale**: Constitution sections 4 and 5 require immutable, traceable, effective-dated history. In-place mutation of a predecessor rule would erase history and break the "no silent overwrite" prohibition. Feature 009's `RelationshipDecision` chain is the closest existing pattern: gapless ordinals, hash-bound decisions, prior-linkage validation, and a strict transition matrix. Reusing that pattern yields a consistent execution model and a single test shape.

**Alternatives considered**:

- Mutable rule records with version field: rejected because version fields invite silent overwrites and erode source attribution.
- Append-only event log with no projection: rejected because the UI and the downstream V1 generator need a computed effective rule for any queried effective date; Feature 001 must provide both the log and a deterministic projection (mirroring Feature 009's `DecisionProjection`).
- Storing predecessor and successor as one mutable tree: rejected for the same reason and because it conflicts with the provenance contract in Feature 009.

**Sources**:

- `web/src/domain/classification/models.ts` (`DecisionProjection`, `AuthorityDecision`)
- `web/src/domain/classification/relationship-service.ts` (`replayRelationshipDecisions`, `relationshipDecisionContentHash`)
- Constitution sections 4, 5, 12.

## Decision 4: Authority rule — default order + explicit override, no silent promotion

**Decision**: `authority-service.ts` implements the constitution section 4 default source-authority order as a typed enum (executed plan document > formal legal/PBGC/actuarial determination > approved summary > certified case report > supporting administrative report > approved historical artifact > inference). Authoring a `PlanRuleRecord` whose only primary citation is a reference/training artifact (regulations, training, PBGC policy) is **rejected** unless an explicit `AuthorityOverride` record is authored first and linked from the rule. The override itself follows the same gapless content-hash-bound decision replay as every other governed record. When a higher-authority source becomes available for an existing rule, the service **proposes a re-authoring** rather than silently overwriting the prior record (FR-022).

**Rationale**: Constitution section 4 explicitly permits a case-specific determination to alter the order only through an explicit approval record. Silent promotion of a reference artifact to case evidence would directly violate section 9 ("directory names, filenames, historical use, or similarity to prior work do not establish approval or canonical status"). Feature 009's `AuthorityDecision` pattern already separates source-role proposal from approval; reusing it keeps one authority model across the codebase.

**Alternatives considered**:

- Authority as metadata without enforcement: rejected because the constitution requires the order to be enforced absent an override.
- Authority computed from filename/source-type heuristics: rejected explicitly by section 9.
- Storing the override as a free-text rationale field: rejected because that would invite silent overrides. The override must be a typed, replayable, hash-bound record.

**Sources**:

- `web/src/domain/classification/authority-decision.ts` (Feature 009)
- Constitution sections 4, 9, 10.

## Decision 5: Currency checks — surface staleness and regulatory supersession as unresolved items

**Decision**: `authority-service.ts` exposes a `queryAuthority(ruleId)` operation returning source hash, locator, source type, confidence, supersession status (from the Feature 009 `EvidenceRelationship` chain and any new supersession proposals), and review-status currency. When a source artifact's review status is stale or its regulatory supersession date has passed (where the reference catalog records one), the service flags the affected rules and **opens** an `UnresolvedItem` of kind `stale-source` or `superseded-source` for an authorized human to re-review. It never silently closes a rule or silently rewrites it.

**Rationale**: Constitution section 10 requires verification of currency and supersession before a source drives a rule. A stale source governing a benefit is exactly the failure the section exists to prevent. Surfacing it as an unresolved item (rather than as a silent patch or deletion) preserves the prior rule's immutable history and triggers human review — the same behavior Feature 009 uses for `rescreen-required`.

**Alternatives considered**:

- Auto-archive stale rules: rejected because the rule remains in effect until a human decides; auto-archiving silences the contradiction.
- Block all downstream use automatically: rejected because it would lock the case even when the staleness is informational; only a human can decide whether it blocks downstream work.
- Reuse Feature 009's `ScreeningResult` entity directly: rejected because currency is an evidence concept, not a quarantine concept. Reusing the entity would conflate them; the relationships and actions differ. `UnresolvedItem` is the correct first-class entity.

**Sources**:

- `web/src/domain/classification/models.ts` (`EvidenceRelationship`, `DecisionProjection`)
- Constitution section 10.

## Decision 6: Provision-candidate near-duplicate and supersession detection — deterministic restatement + locator, never collapse

**Decision**: `near-duplicates.ts` compares two `ProvisionCandidate` records by their normalized restatement hash plus a token-shingle similarity score (the same shape Feature 009's classification `near-duplicates.ts` uses for evidence relationships) and emits an `EvidenceRelationship` of type `near-duplicate` linking both candidates. `supersession.ts` detects predecessor/successor proposals (when a later amendment restates or replaces a prior provision text) and emits an `EvidenceRelationship` of type `supersession` or `amendment` with effective date and confidence. Neither detector discards a candidate; neither silently applies the successor to the predecessor's period.

**Rationale**: Constitution sections 5 and 8 require preserving competing interpretations and never collapsing history. Discarding a candidate as redundant would erase evidence; silently applying a successor to a prior period would violate effective-date boundaries. Feature 009's `near-duplicates.ts` already proves the token-shingle pattern works for evidence shapes; extending it to provision restatements is a small, well-bounded increment.

**Alternatives considered**:

- Verbatim-text-only near-duplicate (string equality): rejected because near-duplicates with cosmetic edits would be missed and the constitution expects them preserved.
- LLM-only similarity: rejected by the same reasoning as Decision 2 (LLM never authors the final relationship).
- Auto-promote the highest-confidence candidate to "primary": rejected because promotion is a human decision; the detector only proposes.

**Sources**:

- `web/src/domain/classification/near-duplicates.ts` (Feature 009)
- `web/src/domain/classification/models.ts` (`RelationshipType`, `EvidenceRelationship`)
- Constitution sections 5, 8.

## Decision 7: Unresolved-item entity — first-class, deterministic resolution, never a hidden default

**Decision**: `UnresolvedItem` is a first-class entity with `itemId`, `kind` (`ambiguous-text`, `conflicting-provisions`, `missing-sequencing`, `undefined-term`, `hidden-content-flag`, `stale-source`, `superseded-source`, `missing-required-value`, `other`), `affectedScope`, `competingInterpretations` (an array, never collapsed to a single "winner"), `evidence` (artifact hash + locator per interpretation), `consequence` (free text describing the calculation/liability implication), `responsibleReviewer`, `status` (`open` / `resolved` / `superseded`), and resolution history as a gapless content-hash-bound chain mirroring Feature 009's typed decision replay. A `PlanRuleRecord` cannot be authored if any outstanding unresolved item covers its scope unless the authoring explicitly links or resolves each affected item (FR-018).

**Rationale**: Constitution section 8 mandates that ambiguous plan language, conflicts, and competing interpretations become explicit unresolved items rather than hidden defaults. The existing `web/src/domain/review/unresolved-items.ts` (Feature 009) already models similar shape for acquisition/normalization; extending it is cheaper and more consistent than inventing a parallel entity. The `competingInterpretations` array is non-collapsing by design — the moment it collapses to one interpretation, the unresolved item stops being "unresolved."

**Alternatives considered**:

- Single-string "issue notes": rejected because they hide competing interpretations and aren't hash-replayable.
- Reuse Feature 009's `UnresolvedItem` verbatim: partially accepted, but the kind enum, the consequence field, and the suppression-on-authoring enforcement are specific to plan-rule authoring; extending with new typed kinds and a guarded authoring prerequisite is the conservative choice.
- "Auto-resolve on first interpretation": rejected by section 8 — the conflict must be visible until an authorized human resolves it.

**Sources**:

- `web/src/domain/review/unresolved-items.ts` (Feature 009)
- `web/src/domain/acquisition/models.ts` (Feature 009)
- Constitution section 8.

## Decision 8: Persistence — atomic JSON/JSONL under `cases/<caseId>/evidence/`, hash-verified

**Decision**: `evidence-workspace.ts` writes governed artifacts per case under `cases/<caseId>/evidence/`:

- `catalogs/<catalogContentSha256>.json` — immutable typed `EvidenceCatalog` snapshots, plus pointer-only `catalogs/current.json`, per ADR 010.
- `provision-candidates.jsonl`, `rule-records.jsonl`, `unresolved-items.jsonl`, `authority-overrides.jsonl` — append-only event logs (one canonical JSON value per line, `\n`-terminated) with post-write hash verification and read-back replay exactly like Feature 009's audit log.

Every write is atomic: encode canonical bytes → write to `objects/sha256/<prefix>/<hash>` create-once storage OR to the JSONL append target with content-addressed event hash, then read back, hash, and compare. Mutations to a prior event are structurally impossible; corrections append a new typed event that supersedes the prior one through the gapless replay rule.

**Rationale**: Constitution section 12 requires reproducibility and artifact lineage. Feature 009's persistence pattern (atomic encode + create-once + post-write hash verify) is the proven local-first model; replicating it for the four new artifact kinds yields consistent durability and a single test shape.

**Alternatives considered**:

- Single consolidated `evidence-state.json`: rejected because in-place state mutations invite silent overwrites and break audit replay.
- OPFS authoritative: rejected by Feature 009 ADR `009-local-first-evidence-intake.md` ("OPFS is cache-only"); Feature 001 inherits the same ADR.
- IndexedDB: rejected for the same reason plus quota/eviction risk.

**Sources**:

- `web/src/adapters/filesystem/case-workspace.ts` (Feature 009)
- `web/src/adapters/filesystem/content-store.ts` (Feature 009)
- `docs/adr/009-local-first-evidence-intake.md`
- Constitution section 12.

## Decision 9: Schema strategy — extend the existing Ajv contract, no new validator

**Decision**: The four new schemas (`evidence-catalog.schema.json`, `provision-candidate.schema.json`, `plan-rule-record.schema.json`, `unresolved-item.schema.json`) live under `web/src/contracts/schemas/` alongside the seven existing Feature 009 schemas. They are loaded by the existing `schema-validator.ts` and enumerated by `web/tools/validate-design-schemas.mjs` and `validate-contracts.mjs`. Each schema declares a `schemaVersion` and reuses Feature 009's `Sha256`, `Uuid`, `UtcTimestamp`, `HumanActor`, and `Result` primitives via `$ref` to the existing `governed-records.schema.json`. Cross-schema references are resolved offline exactly as Feature 009's `validate-contracts.mjs` already does.

**Rationale**:

**Alternatives considered**:

- A separate `evidence-contracts/` directory: rejected because the existing tool expects all schemas under one directory and a split would require tool-side changes that don't earn their keep.
- A hand-written validator: rejected because Ajv is already pinned, audited, and integrated; replacing it for one feature would break consistency.
- Inline-only types in `models.ts` without schemas: rejected because constitution section 13 demands evidence-based maturity claims, and a contract test is the cheapest way to claim "Implemented + Tested" for the schema layer.

**Sources**:

- `web/src/contracts/schemas/*.json` (Feature 009)
- `web/tools/validate-contracts.mjs` (Feature 009)
- Constitution section 13.

## Decision 10: Reviewer-assistance policy — LLM may draft, deterministic code signs, human approves

**Decision**: An LLM may participate in drafting `ProvisionCandidate` restatements, near-duplicate detection hints, and unresolved-item consequence language. The deterministic emit boundary is unchanged: every emitted candidate is computed from a deterministic restatement hash + locator, and a human must approve before any candidate becomes a `PlanRuleRecord`. The LLM never signs a record. No LLM call carrying participant PII, raw case evidence, or unresolved-item text is permitted to leave the device (zero-network guard inherited from Feature 009). Where an LLM-assisted draft would ease the caseworker's burden, the implementation may invoke a local-first model only if one is present on the user's device; the production single-HTML bundle never embeds an external LLM endpoint.

**Rationale**: Constitution section 3 prohibits narrative LLM output as the final benefit-calculation engine. Section 11 prohibits any transmission of participant PII. Together they bound the LLM's role to local, proposal-only, deterministic-wrapped drafting. Feature 001 must enforce these regardless of whether an LLM is used in a given install.

**Alternatives considered**:

- Embed a specific LLM in the bundle: rejected because it adds a network-capable dependency that violates the single-HTML zero-network guard.
- Reject any LLM assistance entirely: too restrictive given section 3 explicitly permits drafting assistance; the conservative position is "permitted if local and proposal-only."
- Off-device LLM with anonymization: deferred to a separately specified feature, not in scope here.

**Sources**:

- Constitution sections 3, 11, 16.
- `web/src/app/security-boundary.ts` (Feature 009).
