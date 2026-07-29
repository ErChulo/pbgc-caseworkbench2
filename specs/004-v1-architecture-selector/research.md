# Research: V1 Architecture Selector

**Feature**: 004-v1-architecture-selector
**Date**: 2026-07-27
**Status**: Complete

## Decision 1: Architecture Representation Format

**Decision**: The V1 Architecture shall be represented as a TypeScript interface `V1Architecture` containing `sourceTabs`, `runs`, `cells` (field inventory), `formulaDependencies`, and `namedRanges`.

**Rationale**: The reference V1 summaries (`reference/approved-v1-summaries/`) use a flat `cells` map keyed by `TAB::CELL_ADDRESS` with per-run I/O/B classification. This matches the TypeScript domain model pattern used throughout the codebase (e.g., `PlanRuleRecord`, `PopulationCandidateProfile`).

**Alternatives considered**:

- Hierarchical tree structure: Rejected because the flat key pattern (`TAB::CELL_ADDRESS`) is already established in reference data and is simpler to validate and replay.
- Database-backed: Rejected because the system must be offline-capable and deterministic (Constitution Section 3).

## Decision 2: Scenario Catalog Source

**Decision**: The scenario catalog shall be represented by governed candidates in `rules/scenario-selection.yaml` and loaded at runtime only in candidate mode until human approval evidence exists.

**Rationale**: The constitution requires deterministic computation (Section 3) and explicit rule justification (Section 6). A YAML rule set can be version-controlled, audited, and deterministically applied. The empty `scenario-selection.yaml` already exists and needs to be populated.

**Alternatives considered**:

- Hardcoded in TypeScript: Rejected because scenario rules are case-specific and must be modifiable without code changes.
- LLM-generated: Rejected because the constitution prohibits LLM output as the final calculation engine (Section 3).

## Decision 3: Tab Selection Logic

**Decision**: Tab selection shall be driven by the approved population profile. Each approved `PopulationCandidateProfile` with `status: "approved"` justifies including its source tab.

**Rationale**: Constitution Section 6 states "Tabs, scenarios, fields, formulas, and validations shall be justified by explicit population characteristics and documented rules." The population profile already tracks `observedFields` and `recordCounts` per candidate.

**Alternatives considered**:

- Manual tab selection: Rejected because it violates population-driven design (Section 6).
- Plan-rule-driven: Rejected because plan rules determine scenarios, not population tabs.

## Decision 4: I/O/B Classification Rule Engine

**Decision**: I/O/B classification shall use a rule-based engine with governed candidates in `rules/iob-classification.yaml`. Each candidate maps a generic field pattern + run context to an I/O/B value; production use requires hash-bound human approval and source evidence.

**Rationale**: The reference V1 summaries show consistent I/O/B patterns across cases (e.g., `CALC_INDICATOR` is always `B`, `CALCULATION` is always `N`). A rule engine captures these patterns deterministically while allowing case-specific overrides.

**Alternatives considered**:

- Heuristic-based: Rejected because heuristics are not deterministic or auditable.
- Per-case manual: Rejected because it doesn't scale and violates reproducibility (Section 12).

## Decision 5: Generic Field Name Mapping

**Decision**: Generic field names shall be mapped from workbook-specific cell descriptions using a normalized glossary. Candidate mappings are defined in `rules/field-name-glossary.yaml` and are not approved merely because they are present in the repository.

**Rationale**: Different workbooks use different cell descriptions for the same conceptual field (e.g., "Benefit Sex" vs "BSEX" vs "Sex"). A glossary normalizes these to a single generic field name, enabling cross-case comparison.

**Alternatives considered**:

- Use workbook-specific names: Rejected because it prevents cross-case analysis and validation.
- LLM-based mapping: Rejected because it violates deterministic computation (Section 3).

## Decision 6: Content Hash Integrity

**Decision**: The `V1Architecture` shall include a `architectureContentSha256` computed deterministically over all fields except the hash itself.

**Rationale**: The codebase pattern (e.g., `PlanRuleRecord.ruleContentSha256`, `PopulationCandidateProfile.candidateKey`) uses content hashes for integrity verification and immutable replay. This is essential for reproducibility (Section 12).

**Alternatives considered**:

- File-level hash only: Rejected because it doesn't enable field-level integrity checking.
- No hash: Rejected because it violates the immutable replay pattern.

## Decision 7: Unresolved Item Integration

**Decision**: The architecture selector shall use the existing `UnresolvedItem` system from `web/src/domain/review/unresolved-items.ts` for ambiguity reporting.

**Rationale**: The unresolved item system is already implemented with content-hash-bound chains, typed decision records, and gapless replay. The architecture selector needs to emit items of kind `ambiguous-text`, `conflicting-provisions`, `missing-sequencing`, and `missing-required-value`.

**Alternatives considered**:

- Separate error system: Rejected because it would duplicate the unresolved item infrastructure.
- Silent resolution: Rejected because it violates Section 8 (Human review and unresolved issues).

## Decision 8: Effective-Dated Scenario Applicability

**Decision**: Scenario applicability shall be modeled as effective-dated records, matching the plan rule pattern.

**Rationale**: Constitution Section 5 requires effective-dated plan history. Scenarios that apply to specific date ranges (e.g., pre-amendment vs. post-amendment) must preserve this distinction.

**Alternatives considered**:

- Current-state only: Rejected because it violates effective-dated history (Section 5).
- Boolean flag: Rejected because it cannot represent date ranges.

## Decision 9: TypeScript Domain Location

**Decision**: The architecture selector domain code shall live in `web/src/domain/architecture/` with the following modules:

- `models.ts` - V1Architecture, CellDescriptor, RunDescriptor, NamedRange, IoBValue types
- `scenario-selector.ts` - Scenario selection logic
- `tab-selector.ts` - Tab selection logic
- `field-inventory.ts` - Field inventory construction
- `iob-classifier.ts` - I/O/B classification engine
- `dependency-graph.ts` - Formula dependency computation
- `architecture-builder.ts` - Orchestrates the full architecture selection

**Rationale**: This follows the existing domain module pattern (e.g., `plan-rules/`, `population/`, `evidence/`).

## Decision 10: Schema Contract Location

**Decision**: The V1 Architecture schema shall be placed in `specs/004-v1-architecture-selector/contracts/v1-architecture.schema.json` and registered in the validation tools.

**Rationale**: This follows the established pattern from Feature 001 where schemas live in the feature's contracts directory and are registered in `validate-design-schemas.mjs` and `validate-contracts.mjs`.

## Decision 11: No New External Dependencies

**Decision**: The architecture selector shall use only existing project dependencies (TypeScript, Ajv, hash-wasm).

**Rationale**: The project has no new external dependencies allowed per the established pattern. The architecture selector is pure domain logic that can be implemented with the existing toolchain.

## Summary of Design Decisions

| #   | Decision                                  | Key Rationale                                |
| --- | ----------------------------------------- | -------------------------------------------- |
| 1   | Flat cell map with TAB::CELL_ADDRESS keys | Matches reference data pattern               |
| 2   | YAML rule set for scenario catalog        | Deterministic, auditable, version-controlled |
| 3   | Population-driven tab selection           | Constitution Section 6 requirement           |
| 4   | Rule-based I/O/B classification           | Deterministic and reproducible               |
| 5   | Generic field name glossary               | Cross-case normalization                     |
| 6   | Content hash integrity                    | Immutable replay pattern                     |
| 7   | Existing UnresolvedItem system            | No duplication                               |
| 8   | Effective-dated scenario applicability    | Constitution Section 5 requirement           |
| 9   | Domain in web/src/domain/architecture/    | Follows established pattern                  |
| 10  | Schema in feature contracts directory     | Follows Feature 001 pattern                  |
| 11  | No new dependencies                       | Project constraint                           |
