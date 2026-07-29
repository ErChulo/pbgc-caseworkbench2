# Implementation Plan: Plan Rule Model

**Feature**: 002 Plan Rule Model
**Date**: 2026-07-29
**Status**: Implemented and tested; ready for human approval

## Summary

Feature 002 provides the effective-dated, traceable plan-rule model consumed by Feature 004 (V1 Architecture Selector) and Feature 005 (V1 Build Specification). Rules are authored from evidence candidates with complete provenance, supersession chains, applicability conditions, authority governance, and human approval. The model implements Constitution sections 3-6 and 8.

## Technical Context

- TypeScript 6 strict mode, Web Crypto, canonical JSON
- No new dependencies, network access, or UI
- Input: `ProvisionCandidate[]`, `EvidenceCatalog`, `AuthorityOverride[]`, `UnresolvedItem[]`, human governance
- Output: `PlanRuleRecord` or governed failure
- Consumers: Feature 004 (architecture), Feature 005 (build spec formula governance)

## Architecture

```text
ProvisionCandidate[] -- evidence extraction output --+
EvidenceCatalog -- released artifact hashes ----------+
AuthorityOverride[] -- case-specific authority -------+--> authorRule()
UnresolvedItem[] -- resolution state -----------------+    |- citation validation
HumanActor -- reviewer/approver ---------------------+    |- applicability validation
                                                          |- authority governance
                                                          |- supersession chain
                                                          |- content hash
                                                          +--> PlanRuleRecord
```

## Implementation Decisions

1. Rule IDs are deterministic UUIDs derived from SHA-256 content hashes.
2. Effective dates, end dates, and adoption dates are validated ISO date strings.
3. Supersession chains are ordinal-indexed with predecessor hash binding.
4. Applicability conditions are typed dimensions with evidence citations.
5. Authority governance authenticates citations against evidence catalog and authority overrides.
6. Unresolved items with "open" status block rule authoring.
7. Content hash is computed over canonical JSON excluding mutable metadata.

## Project Structure

```text
web/src/domain/plan-rules/
├── models.ts
├── rule-authoring.ts
├── authority-override.ts
├── authority-service.ts
├── candidate-extraction.ts
├── near-duplicates.ts
├── supersession.ts
└── unresolved-items.ts

web/tests/unit/domain/plan-rules/
├── authority-service.test.ts
├── governed-fixtures.ts
├── near-duplicates.test.ts
├── supersession.test.ts
└── unresolved-items.test.ts
```

## Constitution Check

| Requirement | Result |
|---|---|
| Deterministic actuarial computation | Pass: deterministic content hashes, canonical JSON, no LLM computation |
| Evidence and effective-date traceability | Pass: citations, effective dates, adoption dates, supersession chains |
| Missing data | Pass: missing applicability, citations, or unresolved items block authoring |
| V1 concept separation | N/A: plan-rule model is upstream of V1 concepts |
| Human review | Pass: reviewer, approval rationale, and review status required |
| Reproducibility | Pass: deterministic content hash over canonical payload |
| Validation evidence | Tested (automated unit tests pass); not independently validated |

No constitutional exception is required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, focused Feature 002 unit tests, `npm test`.
