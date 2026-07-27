# Implementation Plan: Evidence Ingestion

**Branch**: `010-evidence-ingestion` | **Date**: 2026-07-26 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-evidence-ingestion/spec.md`

## Summary

Feature 001 ingests preserved case evidence (from Feature 009's screened-and-released inventory) into a structured, effective-dated, source-cited plan-rule model with supersession tracking and first-class unresolved-item reporting. It adds four production domain modules on top of the existing local-first runtime: an **EvidenceCatalog** (typed, hash-anchored entries from 009 inventory), **ProvisionCandidate** extraction (proposal-only, locator-anchored, near-duplicate and supersession detection), **PlanRuleRecord** authoring (effective-dated, immutable, one primary citation, applicability conditions), and explicit **UnresolvedItem** tracking. Every rule is human-approved; an LLM may assist drafting but never authors a final rule. Default source authority is enforced unless an explicit AuthorityOverride is recorded.

The feature reuses Feature 009's deterministic primitives (canonical JSON, hashTyped, append-only audit log, typed human-actor, gapless decision replay, content-hash-bound approvals) and matches the existing governance pattern (proposal-only models, timestamp-independent computed projections, immutable source artifacts). It introduces no new external dependency, no new worker, no new application shell, and no new storage boundary — the same `case-workspace` JSON persistence and zero-network guard apply.

## Technical Context

**Language/Version**: TypeScript 5.x (strict), React 18, Vite 5 — inherited from Feature 009.

**Primary Dependencies**: Ajv 8.20.0 (schema validation), `hash-wasm` (deterministic SHA-256 via existing `hashTyped`/`canonicalize`), fflate (container handling already done in 009). No new dependency is added. PDF text extraction is already provided by Feature 009's passive parsers (`web/src/adapters/parsers/pdf-parser.ts`, `text-parser.ts`, `json-parser.ts`, `delimited-parser.ts`, `ooxml-parser.ts`, `workbook-parser.ts`); Feature 001 consumes their output rather than re-parsing.

**Storage**: The same user-selected workspace directory enforced by `web/src/adapters/filesystem/case-workspace.ts`. New artifacts persist as JSON under `cases/<caseId>/evidence/`:

- `cases/<caseId>/evidence/catalog.json` — the typed EvidenceCatalog (case + reference sections)
- `cases/<caseId>/evidence/provision-candidates.jsonl` — append-only candidate events
- `cases/<caseId>/evidence/rule-records.jsonl` — append-only plan-rule authoring events
- `cases/<caseId>/evidence/unresolved-items.jsonl` — append-only unresolved-item events with chained resolutions
- `cases/<caseId>/evidence/authority-overrides.jsonl` — append-only AuthorityOverride events

All persistence uses the existing atomic `encode` + `createImmutable` + post-write hash-verify pattern (`web/src/adapters/filesystem/case-workspace.ts:408`, `web/src/adapters/filesystem/content-store.ts:23`). No new storage adapter is introduced.

**Testing**: Vitest (unit/contract/integration) + Playwright (browser E2E), inherited from Feature 009. Schema validation uses `web/tools/validate-design-schemas.mjs` and `web/tools/validate-contracts.mjs`, both extended to cover the four new schemas placed under `web/src/contracts/schemas/`.

**Target Platform**: Local-first Chromium/Edge single-HTML runtime established by Feature 009. No network, no server, no service worker, no external LLM call carrying participant PII. Runs identically from `file://` where supported and from the approved localhost/static-origin fallback.

**Project Type**: Local-first web application — domain logic added on top of `web/src/domain/`, contracts under `web/src/contracts/`, adapters reused from `web/src/adapters/`, review UI under `web/src/components/review/` and `web/src/components/evidence/`.

**Performance Goals**: Catalog build for the synthetic acceptance corpus (≥100 mixed artifacts) completes in < 2s. Provision-candidate extraction is bounded by Feature 009's already-completed passive parsing; Feature 001 adds no re-parse pass. Plan-rule authoring and unresolved-item resolution are interactive (< 200ms per human action).

**Constraints**: Strict zero-network boundary (no fetch/XHR/WebSocket/EventSource/beacon/remote-worker/external-LLM). No participant PII leaves the device. No claim of Excel/ValTool/Runtime/ATPBGC/BCV execution (Specified→Implemented maturity only). Deterministic-replay rule: every typed decision event is content-hash bound with gapless appendOrdinal, exactly mirroring Feature 009's `relationshipDecisionContentHash` and `AuthorityDecision` replay rules.

**Scale/Scope**: One case at a time. The synthetic pilot reduction uses de-identified or synthetic plan documents, not the real pilot package. Production tooling must handle a plan document set consisting of ~10–100 plan documents per case plus the reference library (~361 reference artifacts already inventoried).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| # | Constitution section | How this feature honors it | Pass |
|---|---|---|---|
| C-3 | Deterministic actuarial computation | Provision candidates are extracted by deterministic code; rule authoring is deterministic + human-approved. An LLM may draft candidates but never authors a final rule (FR-025). No narrative LLM output is the calculation engine. | Pass |
| C-4 | Evidence traceability and source authority | Every PlanRuleRecord has exactly one primary citation (artifact hash + locator) and optional supporting citations; default authority order enforced; AuthorityOverride path explicit (FR-015, FR-021, FR-022). | Pass |
| C-5 | Effective-dated plan history | PlanRuleRecord carries effective and adoption/execution dates; applicability conditions distinguish group/purpose/service/equivalence/freeze/amendment-period; successor provisions never silently apply to a prior period; predecessor and successor remain immutable through supersession (FR-013, FR-014). | Pass |
| C-6 | Population-driven design and missing data | This feature ingests plan evidence only; participant data is Feature 003. Where a plan rule value is missing or ambiguous, Feature 001 emits an unresolved item rather than fabricating, imputing, or zero-filling (FR-026, FR-017, FR-018). | Pass |
| C-7 | Separation of V1 concepts | `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata do not enter evidence ingestion; the plan-rule model does not collapse them and does not treat `B` as a `CALC_INDICATOR` (FR-027). | Pass |
| C-8 | Human review and unresolved issues | UnresolvedItem is a first-class entity; ambiguous text, conflicts, missing sequencing, hidden-content flags, and stale sources all become first-class records; typed decision replay governs resolution (FR-017, FR-018, FR-019, FR-020). | Pass |
| C-9 | Reference-library and canonical-artifact governance | Reference artifacts live in a distinct reference-only catalog section; no reference backs a rule without an AuthorityOverride designating a specific hash and version canonical for a stated purpose; filenames and historical use never confer canonical status (FR-024, FR-005). | Pass |
| C-10 | Regulatory and policy currency | Source currency and regulatory supersession are surfaced via authority queries; stale or superseded sources open unresolved items for re-review (FR-021, FR-023). | Pass |
| C-11 | Privacy, confidentiality, and artifact security | No real participant PII in fixtures/tests/docs; only de-identified or synthetic data committed. Quarantined artifacts excluded from the evidence catalog by contract (FR-003). Feature runs within the existing zero-network boundary (FR-029). | Pass |
| C-12 | Reproducibility and artifact lineage | Every catalog entry, candidate, rule, and unresolved item carries immutable source hashes; plan-rule records are immutable across supersession; regenerating the catalog from a preserved case package yields byte-identical deterministic output (FR-001, FR-014, SC-001, SC-004). | Pass |
| C-13 | Validation and implementation evidence | Maturity claims follow the six-level evidence scale; this feature reaches at most Implemented before tests, Tested after test authoring, and never claims Excel/ValTool/Runtime/ATPBGC/BCV execution unless actually performed and recorded (FR-030, SC-010). | Pass |
| C-14 | Workbook and generated-artifact invariants | This feature produces no workbook; it produces the plan-rule model consumed later by Feature 006. No `mySort` or prohibited structure is inherited from a reference workbook (FR-028). | Pass |
| C-16 | High-risk prohibitions | All listed prohibitions respected: no invented participant data, no narrative-LLM-as-engine, no hidden unresolved issue, no silent authority override, no `B`-as-`CALC_INDICATOR`, no committed PII, no canonical-status without approval, no `mySort` reproduction, no manual patching, no false execution claim. | Pass |

**Gate result**: All 13 entries pass before Phase 0. No Constitution Check violations require justification.

## Project Structure

### Documentation (this feature)

```text
specs/001-evidence-ingestion/
├── spec.md              # /speckit-specify output (committed, draft)
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 research decisions
├── data-model.md        # Phase 1 entity definitions, fields, transitions
├── quickstart.md        # Phase 1 end-to-end sequence + commands
├── contracts/           # Phase 1 JSON Schema sources-of-truth
│   ├── evidence-catalog.schema.json
│   ├── provision-candidate.schema.json
│   ├── plan-rule-record.schema.json
│   └── unresolved-item.schema.json
└── tasks.md             # Phase 2 output (/speckit-tasks — not created by /speckit-plan)
```

### Source Code (repository root)

```text
web/
├── src/
│   ├── contracts/
│   │   ├── schemas/                       # existing 009 schemas remain unchanged
│   │   │   ├── evidence-catalog.schema.json        # NEW (Feature 001)
│   │   │   ├── provision-candidate.schema.json     # NEW
│   │   │   ├── plan-rule-record.schema.json         # NEW
│   │   │   └── unresolved-item.schema.json          # NEW
│   │   └── schema-validator.ts           # unchanged; extended via new schema Ids
│   ├── domain/
│   │   ├── evidence/                      # NEW module
│   │   │   ├── catalog.ts                 # EvidenceCatalog build from 009 inventory
│   │   │   ├── models.ts                  # EvidenceArtifact, EvidenceCatalog types
│   │   │   └── source-roles.ts           # typed source-role catalog
│   │   ├── plan-rules/                    # NEW module
│   │   │   ├── models.ts                  # ProvisionCandidate, PlanRuleRecord types
│   │   │   ├── candidate-extraction.ts    # proposal-only extractor over 009 parser output
│   │   │   ├── near-duplicates.ts         # provision-level near-duplicate relationships
│   │   │   ├── supersession.ts            # explicit supersession proposals
│   │   │   ├── rule-authoring.ts          # authorized human + AuthorityOverride enforcement
│   │   │   ├── authority-service.ts       # authority-order enforcement + currency checks
│   │   │   └── authority-override.ts       # case-specific override records
│   │   ├── review/                        # EXTEND existing 009 module
│   │   │   └── unresolved-items.ts        # extend existing for evidence-specific item kinds
│   ├── adapters/
│   │   ├── filesystem/
│   │   │   └── evidence-workspace.ts      # NEW — atomic JSON/JSONL persistence under cases/<id>/evidence/
│   │   └── parsers/                       # unchanged; consumed read-only by candidate-extraction.ts
│   ├── components/
│   │   ├── evidence/                      # NEW review UI
│   │   │   ├── EvidenceCatalogReview.tsx
│   │   │   ├── ProvisionCandidateReview.tsx
│   │   │   ├── PlanRuleAuthor.tsx
│   │   │   └── UnresolvedItemQueue.tsx
│   │   └── review/                        # unchanged shared helpers (Tooltip, shared.ts)
│   └── app/
│       └── App.tsx                        # wire the evidence-review flows after classification
└── tests/
    ├── contract/
    │   └── evidence-contracts.test.ts     # NEW — six new schemas positive/negative/semantic
    ├── unit/
    │   └── domain/
    │       ├── evidence/
    │       │   ├── catalog.test.ts
    │       │   └── source-roles.test.ts
    │       └── plan-rules/
    │           ├── candidate-extraction.test.ts
    │           ├── near-duplicates.test.ts
    │           ├── supersession.test.ts
    │           ├── rule-authoring.test.ts
    │           └── authority-service.test.ts
    ├── integration/
    │   └── evidence-ingestion.test.ts     # catalog → candidates → rules → unresolved items E2E
    └── browser/
        └── evidence-review.spec.ts        # browser E2E for US1–US5
```

Also touched (in-place extension, not new structure):

- `web/tools/validate-design-schemas.mjs` and `web/tools/validate-contracts.mjs` — must pick up the four new schemas; the existing pattern already enumerates by name.
- `docs/security-and-pii.md` and `docs/feature-001-validation-report.md` — validation evidence recorded after tests run.

**Structure Decision**: Single local-first web project under `web/`, matching Feature 009. New domain logic under `web/src/domain/evidence/` and `web/src/domain/plan-rules/`, new review UI under `web/src/components/evidence/`, new persistence adapter under `web/src/adapters/filesystem/evidence-workspace.ts`. No backend, no separate frontend/backend split, no mobile target.

## Complexity Tracking

> No Constitution Check violations. This table intentionally left blank.

## Post-Design Constitution Re-Check

*GATE: Re-check after Phase 1 design. The Constitution Check above passed before Phase 0; this section confirms it still passes against the concrete decisions in `research.md`, `data-model.md`, `contracts/`, and `quickstart.md`.*

| # | Section | Pre-Phase-0 result | Post-Phase-1 confirmation | Pass |
|---|---|---|---|---|
| C-3 | Deterministic actuarial computation | Pass | Decision 10 (research.md) codifies "LLM may draft, deterministic code signs, human approves." `ProvisionCandidate` is proposal-only by schema (`plan-rule-record.schema.json` `not` block rejects `status: "approved"`). No narrative LLM authority enters the rule identity chain. | Pass |
| C-4 | Evidence traceability and source authority | Pass | `PlanRuleRecord.primaryCitation` is exactly one `RuleCitation` (schema requires `required: ["primaryCitation"]` and `supportingCitations` as a separate array). `AuthorityOverride` schema enforces one artifact hash for one scope per override. Default authority order recorded on every override. | Pass |
| C-5 | Effective-dated plan history | Pass | `PlanRuleRecord` carries `effectiveDate`/`endDate` with `formatMinimum` schema check (`effectiveDate <= endDate` whenever `endDate` is present). `SupersessionLink` is appended, never mutated; predecessor identity (`predecessorRuleContentSha256`) is immutable. Deterministic projection returns the rule effective on any queried date. | Pass |
| C-6 | Population-driven design and missing data | Pass | Feature 001 ingests plan evidence only. `UnresolvedItem.kind: "missing-required-value"` and `"ambiguous-text"` cover every ambiguation; schema enforces `competingInterpretations.minItems: 2`. No fabrication or zero-fill exists in the data model. | Pass |
| C-7 | Separation of V1 concepts | Pass | `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata do not appear in any of the five schemas. `AuthorityOverride.defaultAuthorityOrder` lists `SourceRole` values only; `B` is not a `SourceRole`. | Pass |
| C-8 | Human review and unresolved issues | Pass | `UnresolvedItem.status` is a computed projection; the schema requires `resolutionHistory` to be empty while `status: "open"`. `ResolutionEvent.actor` is `$ref` to `humanActor` (no automated actor). Branch decision preserves the non-selected interpretation. | Pass |
| C-9 | Reference-library and canonical-artifact governance | Pass | `EvidenceCatalog.referenceOnly` is a distinct section by schema (`caseEvidence` and `referenceOnly` are separate required arrays). `PlanRuleRecord` `allOf` block rejects primary citations with `sourceRole` in `{regulation, training-reference, other}` unless `authorityOverrideId` is a non-null uuid. | Pass |
| C-10 | Regulatory and policy currency | Pass | `EvidenceArtifact.reviewStatus` enum includes `stale`. Decision 5 (research.md) defines that staleness opens an `UnresolvedItem` (`stale-source`/`superseded-source`) instead of silently archiving the rule. | Pass |
| C-11 | Privacy, confidentiality, and artifact security | Pass | `ExcludedQuarantinedEntry` schema makes quarantine exclusion explicit (required `quarantineDecisionId` + `linkedUnresolvedItemId`). Feature 001 inherits the existing zero-network guard; no new dependency, no new worker. Quickstart explicitly forbids real PII in fixtures. | Pass |
| C-12 | Reproducibility and artifact lineage | Pass | Every governed record carries a `*ContentSha256` excluded from operational UUID/timestamp fields. `quickstart.md` step 9 asserts byte-identical replay as SC-004 + SC-006. Persistence is atomic + post-write hash-verified (Decision 8) matching Feature 009's `case-workspace.ts` pattern. | Pass |
| C-13 | Validation and implementation evidence | Pass | Five schemas placed under `contracts/` are Draft 2020-12 and `$ref` into Feature 009's `governed-records.schema.json#/$defs` for primitives. `tasks.md` (Phase 2) will author contract + unit + integration tests; maturity stops at Implemented before tests run, then Tested. No Excel/ValTool/Runtime/ATPBGC/BCV claim appears in the plan or schemas. | Pass |
| C-14 | Workbook and generated-artifact invariants | Pass | Feature 001 produces no workbook. The `SourceRole` enum includes `approved-historical-calculation-artifact`; quickstart constraints section explicitly bans `mySort` reproduction when importing from `reference/approved-v1-workbooks/`. | Pass |
| C-16 | High-risk prohibitions | Pass | All ten listed prohibitions are honored by the data model: no invented participant data (no participant data in scope); no narrative-LLM-as-engine (Decision 10); no hidden unresolved issue (schema requires `competingInterpretations` while open); no silent authority override (AuthorityOverride entity); no `B`-as-`CALC_INDICATOR` (not present); no committed PII (constraint recorded); no canonical-status without approval (schema-required `authorityOverrideId`); no `mySort` reproduction (quickstart ban); no manual patching (records append, never mutate); no false execution claim (SC-010 caps maturity). | Pass |

**Gate result**: 13/13 sections still pass against the concrete Phase 1 design. No Complexity Tracking entries are required.
