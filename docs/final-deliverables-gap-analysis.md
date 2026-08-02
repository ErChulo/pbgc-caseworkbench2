# Final Deliverables Gap Analysis

**Date:** 2026-08-02

## Bottom line

The repository has implemented many governed domain building blocks and now includes a governed final-output package surface. The application still does not complete a real end-user casework package unless the required downstream artifacts are supplied.

I incorrectly treated controlled intake, synthetic rule review, schemas, tests, and documentation as if they were the final casework product. They are not. The final product must be a reproducible case-specific V1 calculation engine package with generated workbooks and validation or reconciliation evidence. The new final-output package implementation makes that boundary explicit and blocks missing artifacts instead of fabricating them.

## Governing requirement

The constitution requires PBGC CaseworkBench to produce auditable, reproducible, case-specific V1 calculation engines for terminated defined-benefit pension plans.

The required transformation is:

`authoritative plan evidence + case controls + approved assumptions + redacted/synthetic population data -> effective-dated plan rules + population-driven calculation architecture + generated workbooks + validation and reconciliation evidence`

Feature 009 cannot be treated as the finished product because it explicitly stops before downstream interpretation, calculation, report production, V1 generation, PBGC limitation processing, or actuarial-liability work.

## What exists now

| Area                                        | Current state                                                                                                                                                      | Evidence                                                                                                                               | Product gap                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Case intake and evidence normalization      | Implemented as local-first intake foundation with manifest, screening, quarantine, classification, relationships, population candidate review, and manifest export | `specs/009-case-intake-normalization/spec.md`, `web/src/app/App.tsx`                                                                   | Not a final casework product. It prepares governed evidence only.                                                                             |
| Evidence and plan-rule review               | Domain logic exists; UI uses synthetic demo candidates and now persists authored rule records when an active local case workspace exists                           | `web/src/app/App.tsx`, `cases/<caseId>/evidence/rule-records.jsonl` at runtime                                                         | Needs production extraction/review inputs instead of demo candidates.                                                                         |
| Effective-dated plan-rule model             | Implemented domain model and tests per Feature 001/002 tasks                                                                                                       | `web/src/domain/plan-rules/`, `specs/001-evidence-ingestion/tasks.md`, `specs/002-plan-rule-model/tasks.md`                            | Needs production case integration and approval workflow, not demo-only state.                                                                 |
| Population profile                          | Implemented and tested domain layer                                                                                                                                | `web/src/domain/population/`, `specs/003-population-profile/plan.md`, `specs/003-population-profile/tasks.md`                          | Needs visible production handoff into architecture/build pipeline.                                                                            |
| V1 architecture selector                    | Implemented deterministic domain layer                                                                                                                             | `web/src/domain/architecture/`, `specs/004-v1-architecture-selector/tasks.md`                                                          | Needs caseworker-facing generation, persistence, review, and export.                                                                          |
| BuildSpec 2.0.0                             | Implemented and tested handoff contract                                                                                                                            | `web/src/domain/build-spec/`, `specs/005-v1-build-spec/spec.md`, `specs/005-v1-build-spec/tasks.md`                                    | No production UI/orchestrator from approved architecture to BuildSpec artifact.                                                               |
| Formula compiler                            | Implemented and tested; does not execute formulas                                                                                                                  | `web/src/domain/formula-compiler/`, `specs/006-formula-compiler/tasks.md`                                                              | Needs orchestration into workbook generation and output package.                                                                              |
| Workbook builder                            | Implemented per tasks, but spec/plan status text is stale                                                                                                          | `web/src/domain/workbook-builder/`, `specs/007-workbook-builder/tasks.md`                                                              | Needs production case flow, export packaging, and generated artifact lineage in UI.                                                           |
| Validation and reconciliation               | Implemented per tasks, consumes oracles; no external execution claim                                                                                               | `web/src/domain/validation-reconciliation/`, `specs/008-validation-reconciliation/tasks.md`                                            | Needs production validation report export and independent oracle inputs.                                                                      |
| User manual and PDFs                        | Added                                                                                                                                                              | `docs/user-manual/`                                                                                                                    | Documentation is not a casework deliverable.                                                                                                  |
| Final casework output package               | Implemented as governed package contract, deterministic orchestrator, app readiness panel, workspace-artifact linker, and local export action                      | `specs/010-final-casework-output-package/`, `web/src/domain/case-output/`, `web/src/components/case-output/CaseOutputPackagePanel.tsx` | Package exports blocked status until required generated artifacts are linked or supplied. Linked workspace files are hashed before inclusion. |
| Section 436 evaluation or memo              | Deterministic evaluation artifact and Markdown report renderer implemented; missing approved facts/rules block completion                                          | `specs/011-section-436-evaluation/`, `web/src/domain/section-436/`                                                                     | No fact-entry UI or formatted DOCX/PDF memo generator yet. Reference materials remain source candidates only.                                 |
| Draft V1 summary scaffold                   | Implemented as a blocked pre-package artifact from R5 summary JSON to closest approved V1 reference-summary metadata                                               | `specs/012-draft-v1-summary/`, `web/src/domain/draft-v1-summary/`, `web/src/components/draft-v1-summary/DraftV1SummaryPanel.tsx`       | Does not replace governed architecture, BuildSpec, formula compiler, workbook, validation, reconciliation, or human approval.                 |
| Human approval and office/manual validation | Deferred                                                                                                                                                           | `docs/feature-009-usability-results.md`, SC-010/T124 context                                                                           | Cannot claim human-approved or externally executed maturity.                                                                                  |

## Final deliverables still missing

| Required deliverable          | Required output                                                                                                                                             | Status                                                                                                                 |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Production plan-rule package  | Approved effective-dated rules with citations, supersession, applicability, unresolved items, reviewer approvals, and persisted lineage                     | Partially built; authored records now persist for an active case, but production extraction still uses demo candidates |
| Production population profile | Approved population profile with field inventory, missing-data exceptions, sensitivity status, and exact source lineage                                     | Partially built; not production-integrated end to end                                                                  |
| V1 architecture package       | Deterministic selected tabs, scenarios, fields, I/O/B mappings, dependencies, and governed policy approvals                                                 | Domain built; no final production UI/package                                                                           |
| BuildSpec package             | BuildSpec 2.0.0 artifact accepted by compiler, with governance and deterministic hash                                                                       | Domain built; no final production UI/package                                                                           |
| Compiled formula package      | Compiled deterministic formula artifact with diagnostics, dependencies, and provenance                                                                      | Domain built; no final production UI/package                                                                           |
| Generated V1 workbook         | Case-specific XLSX workbook generated from BuildSpec and population data                                                                                    | Generator built; not exposed as final production workflow                                                              |
| Validation package            | Structural validation, population mapping checks, reconciliation against independent oracle, reviewer rationale, deterministic evidence hash                | Domain built; no final production UI/package; external execution not done                                              |
| Final casework output bundle  | One exportable package containing workbook, BuildSpec, compiled formulas, validation report, unresolved-items report, lineage manifest, and maturity labels | Package contract/UI/export implemented; real package remains blocked until downstream artifacts are supplied           |
| Section 436 evaluation/report | Deterministic Section 436 applicability evaluation and case memo/report if required by the work product                                                     | Evaluation artifact and Markdown report renderer implemented; DOCX/PDF memo generation remains missing                 |
| Draft V1 summary scaffold    | Pre-package scaffold-selection record from R5 summary JSON and approved V1 reference-summary metadata                                                      | Implemented as blocked `draft-v1-summary`; not part of the final package until separately governed                     |

## Build plan to close the gap

### Phase 1: Correct the product boundary

1. Completed: added governed feature spec and contract for `010-final-casework-output-package`.
2. Completed: defined the final output bundle contract with workbook, BuildSpec, compiled formula artifact, validation/reconciliation evidence, unresolved items, lineage manifest, and maturity labels.
3. Completed: updated stale status text in Feature 007 and Feature 008 specs/plans so repository status is not contradictory.

### Phase 2: Wire the production case pipeline

1. Completed in part: authored plan-rule records persist to real case workspaces when an active case exists.
2. Completed in part: added deterministic final-package orchestrator over supplied governed artifacts.
3. Completed: final-package orchestration fails closed at each missing stage instead of inventing artifacts.
4. Completed in part: generated workspace artifacts can now be linked by path, hashed locally, persisted, and mapped into the final package by artifact type.
5. Completed in part: R5 summary JSON can now generate a blocked draft V1 summary scaffold from approved reference-summary metadata.
6. Remaining: add one-click production generation for architecture, BuildSpec, compiled formulas, workbook, validation, and Section 436 from approved inputs.

### Phase 3: Build the caseworker output screen

1. Completed: added a final `Case Output Package` panel to the app.
2. Completed: readiness shows evidence, rules, population, architecture, BuildSpec, compiler, workbook, validation, and Section 436 stages.
3. Completed in part: final package JSON manifest export is implemented.
4. Remaining: generated XLSX workbook, validation report, and Section 436 memo exports require their concrete artifacts first.
5. Completed: maturity labels follow Constitution section 13 and do not claim external execution.

### Phase 4: Add Section 436 if it is part of the expected product

1. Completed: created dedicated `011-section-436-evaluation` spec and contract.
2. Completed: existing 436 web app and DOCX template remain reference candidates only.
3. Completed: deterministic Section 436 inputs, missing-fact rules, citations, and review status are modeled.
4. Completed in part: deterministic Section 436 evaluation artifact is implemented.
5. Completed in part: deterministic Markdown report generation from the evaluation artifact is implemented.
6. Remaining: formatted DOCX/PDF memo generation from the evaluation artifact.
7. Completed in part: tests cover missing required facts, rule approval, deterministic hash stability, report rendering, and contracts.

### Phase 5: Prove the output works

1. Add a synthetic end-to-end case test from intake through final output bundle.
2. Add browser verification for the final caseworker flow.
3. Add contract tests for the output bundle and Section 436 report if included.
4. Run focused tests plus schema/contract validation.
5. Do not claim Excel, ValTool, Runtime, ATPBGC, BCV, office validation, independent validation, or human approval unless actually performed and recorded.

## Immediate next engineering tasks

| Priority | Task                                                              | Files likely affected                                                                                       |
| -------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P0       | Create final output package spec and contract                     | Completed                                                                                                   |
| P0       | Add production pipeline orchestrator                              | Completed as fail-closed final-package orchestrator                                                         |
| P0       | Add final output UI                                               | Completed                                                                                                   |
| P0       | Persist plan-rule review output instead of synthetic-only preview | Completed for authored plan-rule records when an active case exists                                         |
| P1       | Export final output bundle with manifest and hashes               | Completed for final package manifest JSON; generated workbook/report artifacts still blocked until supplied |
| P1       | Add validation report export                                      | Still pending                                                                                               |
| P1       | Implement Section 436 as first-class governed feature             | Completed for deterministic evaluation artifact and Markdown report renderer; DOCX/PDF export pending       |
| P1       | Generate draft V1 summary scaffold from R5 summary JSON           | Completed as a blocked pre-package artifact; downstream governed generation still pending                   |

## Corrected status statement

What we have so far is a governed foundation, several deterministic domain engines, a draft V1 summary scaffold, a final-output package boundary, and a deterministic Section 436 evaluation/report artifact surface.

What we do not yet have is a complete end-user casework output flow that supplies all downstream artifacts from production inputs.

The next real deliverable must connect production evidence/rule/population/architecture/BuildSpec/workbook/validation artifacts into the final package so it can become complete instead of correctly blocked.
