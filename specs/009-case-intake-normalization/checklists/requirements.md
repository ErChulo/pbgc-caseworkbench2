# Specification Quality Checklist: Case Intake and Evidence Normalization

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-07-18
**Last re-run**: 2026-07-19
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Cross-Artifact Traceability

- [x] Every functional requirement maps to architecture and an implementation task
- [x] Every success criterion maps to a test, acceptance protocol, or quality gate
- [x] Every governed entity is represented in the data model where applicable
- [x] Every machine-validated governed record is represented by a typed contract where applicable
- [x] Deterministic content and operational metadata are separate and testable
- [x] Snapshot identity is consistently defined as lowercase SHA-256
- [x] Authority classification and human authority designation are separate
- [x] Human-final classification, relationship, authority, quarantine, and governed-export decisions reject system actors
- [x] AuthorityDecision requires a source-role proposal, separate classification approval, and matching artifact SHA-256 linkage
- [x] De-identified-real and synthetic/mock packages have a dedicated Draft 2020-12 contract with field allowlisting, raw direct/indirect-identifier rejection, generalized quasi-field evidence, and exact-payload-hash human approval
- [x] Validation results identify the exact check through check text or a stable definition identifier and version
- [x] Fail-closed screening, validation, extraction, and partial-package continuation are representable and testable
- [x] Promised PDF, DOCX, PPTX, text, JSON, spreadsheet, archive, and nested-archive behavior maps to parser fixtures and tests
- [x] Shared passive parsers precede content-dependent source-role classification, near-duplicate analysis, and population profiling
- [x] Quickstart journeys match the ADR gate, approved startup modes, seven contracts, separate source-role/authority decisions, human quarantine controls, deterministic verification, and zero-network/no-execution gates
- [x] Canonical technical terminology uses source-role; authority-candidate is limited to the pre-AuthorityDecision candidate state
- [x] All final governed eligibility decisions require human actors; automated screening/re-screening creates findings or proposals only
- [x] Changed bytes create a new artifact and screening lifecycle while preserving the old disposition history
- [x] Reconciliation uses two explicit balancing equations and mutually exclusive terminal categories with overlap/imbalance negative tests
- [x] Feature 009 locally creates, validates, imports, and stores packages but contains no transmission path or external-LLM client
- [x] The Evidence Acquisition & Structured Extraction Framework is bounded to reusable intake primitives, exact-hash citations/approval, local packages, and downstream blocking without interpretation, calculation, or report production
- [x] All seven Draft 2020-12 schemas and local references are represented in contract fixtures, tasks, and quickstart acceptance journeys
- [x] Acquisition request, package, and proposal hashes cover canonical deterministic payloads only; operational UUIDs, timestamps, paths, state, actors, decisions, and transport metadata are excluded and hash-invariant
- [x] Intrinsic `PopulationCandidate.evidence` ordering is limited to explicitly typed values; arbitrary export records are not duck typed; FR-035/FR-037C, contracts, and T015 specify the contrasting permutation/order tests. Ordinary local validation and fresh independent `$speckit-analyze` confirmation passed.
- [x] Unannotated arrays inside proposedExtractedFacts are valid order-significant deterministic content under the recursive fallback and change hashes when reordered
- [x] EvidenceRelationship and PopulationCandidate deterministic sources permit proposal/provisional states only; human-final status is a non-mutating computed projection from a valid same-subject typed human-decision chain, and orphan/system/mismatched/ineffective/incomplete claims remain blocked
- [x] Population evidence uses one `evidenceKey` for typed references and manifest-local observations; FR-035 and manifest invariants specify exact one-entry citation/artifact/locator/kind/value resolution, while T093/T103 specify positive and negative cases. Ordinary local validation and fresh independent `$speckit-analyze` confirmation passed.
- [x] ClassificationProposal and artifact downstreamEligibility remain proposal/provisional only; their effective final projections require exact-subject typed human-decision replay and never mutate source evidence
- [x] Source priorities remain order-significant and accept only ascending unique-priority input; nonascending and duplicate priorities fail validation while valid semantic priority changes change hashes
- [x] Typed decision matrices now specify ordinal/predecessor structure, including unresolved-item successors, quarantine same-chain linkage, initial inherit-approval cross-chain release lineage, and authority dependency invalidation; T014/T077/T102/T103 provide validation evidence tasks. Ordinary local validation and fresh independent `$speckit-analyze` confirmation passed.
- [x] Evidence-manifest lineage covers request/package/proposal/decision/exact promoted fact plus schema/instruction/module/rerun links and rejects invalid pointers, content/citation/artifact mismatches, revoked approvals, conflicting promotions, and every orphan or duplicate path
- [x] Automated `provisional-safety-block` and `provisional-quarantine` states are distinct from human-final dispositions, and prior-dependent final quarantine actions require a current effective same-hash human decision
- [x] Reconciliation uses accounting-only terminal categories, permits US2 balance while records remain provisional, grants no governed status, and requires exactly one independently balanced entry in each ledger
- [x] User-facing requirements distinguish accounting, provisional-security, and human-final terminology and explain each block's cause, required evidence/review, and next action
- [x] The SC-010 human usability protocol has an objective population, procedure, evidence set, and threshold
- [x] The early browser feasibility gate and required ADR block substantive implementation on failure
- [x] Feature scope excludes downstream DOPT, PBGC analysis-template population, Data Elements List generation, actuarial calculation, plan interpretation, benefit determination, and V1 generation

## Notes

- Validation iteration 1 passed all checklist items on 2026-07-18.
- Validation iteration 2 passed after analyze-remediation on 2026-07-19, including contract, task, parser, browser-feasibility, ADR, authority-governance, and usability traceability checks.
- Validation iteration 3 passed after the second analyze remediation on 2026-07-19, including all then-current schemas and local references, human-only final-decision negative cases, authority-linkage semantic checks, export allowlist/direct-identifier rejection, sequential acyclic task dependencies, and 100% requirement-to-task coverage.
- Validation iteration 4 passed after the latest analyze remediation on 2026-07-19, including all seven schemas, human-only re-screening boundaries, export/proposal approval-hash invariants, generalized quasi-field evidence, changed-byte lifecycle isolation, reconciliation overlap/imbalance rejection, local-only acquisition packages, acyclic tasks, and 100% requirement-to-task coverage.
- Validation iteration 5 passed on 2026-07-19 after deterministic-acquisition, append-only-decision, acquisition-lineage, provisional/final-quarantine, and two-ledger remediation, including all required semantic negative cases and unchanged constitutional hash.
- Validation iteration 6 passed on 2026-07-19 after accounting-ledger, canonical-array, ordinal-decision-chain, exact promoted-fact, quarantine-prior-linkage, and provisional-state UX remediation, with 100% requirement/task coverage and unchanged constitutional hash.
- Validation iteration 7 passed on 2026-07-19 after recursive nested-array canonicalization, proposal-only relationship/population governance, and ascending unique source-priority remediation, including positive computed-status projection and required negative tests.
- Validation iteration 8 recorded the proposed-fact, candidate-identity, and proposal-only remediation, but its population embedding/citation, eligibility UUID-hash, numeric, and transition-matrix completion claims were superseded by iteration 9.
- Validation iteration 9 on 2026-07-19 recorded ordinary local checks for the then-current candidate-evidence, population-observation, candidateKey, eligibility-linkage, numeric, and transition specifications; later independent analysis identified I1–I5, U1, A1–A2, and C1. The current remediation is specified with validation tasks but remains awaiting fresh independent `$speckit-analyze` confirmation.
- SHA-256 hashing and immutable UUID requirements are explicit business controls supplied by the feature owner, not implementation-architecture choices.
- No `[NEEDS CLARIFICATION]` markers remain; planning decisions are listed under Assumptions, Dependencies, Risks, and Unresolved Questions.
