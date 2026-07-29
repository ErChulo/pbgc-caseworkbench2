# Implementation Plan: V1 Architecture Selector

**Branch**: `010-evidence-ingestion` | **Date**: 2026-07-27 | **Spec**: `specs/004-v1-architecture-selector/spec.md`

**Input**: Feature specification from `/specs/004-v1-architecture-selector/spec.md`

## Summary

The V1 Architecture Selector consumes approved plan rules (Feature 002), raw evidence-backed population candidates, observations, and decision histories (Feature 003), authenticated case controls, and governed architecture policies. Repository YAML remains provisional: production use requires a separate gapless human `ArchitecturePolicyApproval` chain binding the exact policy kind, version, parsed-content hash, source-file hash, and citations to a hash-valid released EvidenceCatalog. The resulting deterministic architecture records these approvals and all governed input hashes for replay before feeding the formula compiler (Feature 006) and workbook builder (Feature 007).

## Technical Context

**Language/Version**: TypeScript 5.x strict mode

**Primary Dependencies**: None new — uses existing project toolchain (TypeScript, Ajv 8, hash-wasm, Vitest)

**Storage**: Case-workspace JSON files under `cases/<caseId>/architecture/` following the atomic encode + createImmutable + post-write hash-verify pattern

**Testing**: Vitest (unit + contract), Playwright (browser), manual validation against reference V1 summaries

**Target Platform**: Web (Vite + React 19) with offline-first, zero-network boundary

**Project Type**: Web application with domain-driven design

**Performance Goals**: Architecture selection for a single case completes in <5s (deterministic, no network)

**Constraints**: No new external dependencies; offline-capable; deterministic output; Constitution Section 3 compliance (no LLM output as calculation engine)

**Scale/Scope**: Single-case architecture; ~80 reference V1 summaries for validation; ~10 generic field types per tab

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Section | Requirement                                | Status  | Notes                                                                              |
| ------- | ------------------------------------------ | ------- | ---------------------------------------------------------------------------------- |
| §3      | Deterministic actuarial computation        | ✅ PASS | Architecture selector uses deterministic rule-based logic; no LLM output           |
| §5      | Effective-dated plan history               | ✅ PASS | Scenarios modeled with effective date ranges; no silent collapse                   |
| §6      | Population-driven design                   | ✅ PASS | Tabs justified by approved population candidates                                   |
| §7      | Separation of V1 concepts                  | ✅ PASS | CALC_INDICATOR (I/O/B=B), CALCULATION (I/O/B=N), I/O/B are distinct concepts       |
| §8      | Human review and unresolved issues         | ✅ PASS | Ambiguity emits UnresolvedItems; no silent resolution                              |
| §9      | Reference-library governance               | ✅ PASS | Reference V1 summaries are read-only; not treated as approved without human record |
| §12     | Reproducibility and artifact lineage       | ✅ PASS | Content-hash-bound architecture; deterministic replay verified                     |
| §13     | Validation and implementation evidence     | ✅ PASS | Contract tests for schema; unit tests for each service                             |
| §14     | Workbook and generated-artifact invariants | ✅ PASS | Architecture preserves required field and scenario semantics                       |
| §16     | High-risk prohibitions                     | ✅ PASS | No invented data, no LLM as engine, no concealed ambiguity                         |

**Post-implementation review re-check**: Population requirements and scenario population conditions are evaluated from approved, hash-bound characteristic evidence. The effective population decision binds the exact source artifact and a builder-recomputed workbook-profile hash covering sheets, cells, and named ranges. Normalized tab identities are unique across approved profiles; only exact profile/source/tab duplicates deduplicate, while other collisions block before field or range extraction. Canonical support sheets are explicit support-role source tabs with null population linkage. Split plan-rule scenarios emit unique interval runs from all-condition date intersections and retain every contributor hash. Plan-rule absence requires an explicit applicability value of `absent`; omitted dimensions remain unknown. Replay is established by deterministic content hash, not by an operational-envelope byte identity unless injected IDs and times are equal.

## Project Structure

### Documentation (this feature)

```text
specs/004-v1-architecture-selector/
├── plan.md              # This file
├── spec.md              # Feature specification with user stories and FRs
├── research.md          # Phase 0 output — 11 design decisions
├── data-model.md        # Phase 1 output — 12 entity definitions
├── quickstart.md        # Phase 1 output — end-to-end sequence
├── contracts/           # Phase 1 output
│   └── v1-architecture.schema.json
└── tasks.md             # 50 tasks organized by user story
```

### Source Code (repository root)

```text
web/src/domain/architecture/
├── models.ts                 # V1Architecture, SourceTab, RunDescriptor, CellDescriptor, IoBValue, etc.
├── rule-loader.ts            # Load YAML rule files into typed policy objects
├── scenario-selector.ts      # Select applicable calculation scenarios
├── tab-selector.ts           # Select population tabs
├── field-inventory.ts        # Build field inventory with generic field names
├── iob-classifier.ts         # Classify I/O/B per run
├── dependency-graph.ts       # Compute formula dependency graph
└── architecture-builder.ts   # Orchestrates full architecture selection

web/src/adapters/filesystem/
└── architecture-workspace.ts # Save/load architecture to case workspace

web/tests/unit/domain/architecture/
├── rule-loader.test.ts
├── scenario-selector.test.ts
├── tab-selector.test.ts
├── field-inventory.test.ts
├── iob-classifier.test.ts
├── dependency-graph.test.ts
└── named-ranges.test.ts

web/tests/contract/
└── v1-architecture-contracts.test.ts

web/tests/integration/
└── architecture-selection.test.ts

rules/
├── scenario-selection.yaml    # Governed scenario-policy candidates
├── tab-selection.yaml         # Governed tab-policy candidates
├── iob-classification.yaml    # Governed I/O/B-policy candidates
└── field-name-glossary.yaml   # Governed field-mapping candidates
```

**Structure Decision**: Single domain module under `web/src/domain/architecture/` following the established pattern from `plan-rules/`, `population/`, and `evidence/`. YAML rule files in the top-level `rules/` directory for case-specific configurability.

## Complexity Tracking

> **No Constitution violations identified — all gates pass**

No complexity justification required.
