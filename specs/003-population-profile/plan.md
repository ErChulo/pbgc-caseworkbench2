# Implementation Plan: Population Profile

**Feature**: 003 Population Profile
**Date**: 2026-07-29
**Status**: Implemented and tested; ready for human approval

## Summary

Feature 003 transforms approved population evidence into deterministic candidate profiles and governed decision chains. Population profiles identify observed fields, record counts, sensitivity level, and workbook structure without formula execution. The model prevents invented participant data and drives architecture selection with human-approved population observations.

## Technical Context

- TypeScript 6 strict mode, Web Crypto, canonical JSON
- No new dependencies, network access, formula execution, or UI
- Input: Passive extraction results, population evidence, human decisions
- Output: `PopulationCandidateProfile`, `PopulationDecisionProjection`, `WorkbookPopulationProfile`
- Consumers: Feature 004 (V1 Architecture Selector)

## Architecture

```text
PassiveExtraction (workbook/tabular) ──+
                                       ├--> workbookProfileContentHash()
                                       |    adaptWorkbookExtraction()
                                       ├--> WorkbookPopulationProfile
                                       |
PopulationEvidenceObservation[] ──+
PopulationCandidateProfile ───────┼--> validatePopulationEvidence()
                                  |    replayPopulationCandidateDecisions()
PopulationCandidateDecision[] ────┼--> PopulationDecisionProjection
                                  |
ManifestArtifacts[] ───────────────+
```

## Implementation Decisions

1. Population candidate keys are deterministic SHA-256 hashes of candidate content.
2. Evidence observations preserve artifact hash, citation ID, locator, and observed value.
3. Sensitivity is classified (authorized-real, de-identified, synthetic-mock, unknown) and never inferred.
4. Decision chains are gapless, unbranched, with only human actors.
5. Workbook profiling preserves sheet names, cell addresses, and raw value kinds without formula execution.
6. Named ranges are observed and preserved exactly from workbook metadata.
7. Content hashes are deterministic and enable tamper detection and governance binding.

## Project Structure

```text
web/src/domain/population/
├── population-profile.ts
├── population-detector.ts
├── tabular-adapter.ts
└── workbook-adapter.ts

web/tests/unit/domain/population/
├── population-detector.test.ts
└── tabular-adapter.ts (future)

web/tests/integration/
├── mock-population.test.ts
└── population-intake.test.ts (future)

web/tests/browser/
└── population-review.spec.ts
```

## Constitution Check

| Requirement | Result |
|---|---|
| Deterministic actuarial computation | Pass: deterministic hashing, no LLM output, no formula execution |
| Evidence and effective-date traceability | Pass: evidence observations preserved, artifact hashes bound |
| Missing data | Pass: no invented participant values; missing data blocks approval |
| V1 concept separation | N/A: population profile is upstream of V1 concepts |
| Human review | Pass: human decisions required, decision rationale recorded |
| Reproducibility | Pass: deterministic candidate and decision hashes |
| Validation evidence | Tested (automated unit, integration, browser tests pass); not independently validated |

No constitutional exception is required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, focused Feature 003 unit tests, Feature 003 integration/browser tests, `npm test`.
