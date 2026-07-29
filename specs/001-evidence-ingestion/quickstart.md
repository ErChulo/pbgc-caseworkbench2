# Quickstart: Evidence Ingestion

**Feature**: 001 Evidence Ingestion
**Branch**: `010-evidence-ingestion`
**Status**: Draft — Phase 1 design complete; Phase 2 task generation pending via `/speckit-tasks`.

## End-to-end sequence (target)

A reviewer who has already completed a Feature 009 intake and has a preserved, screened, and released case package performs the following on the local-first runtime:

1. **Open the case** in the Feature 009 workspace. Feature 009's intake pipeline has produced `ScreenedArtifactOutcome[]` with `downstreamBlocked: true` and `governedState: "provisional"`. US1 of Feature 009 (case creation) has run; the active case is `(caseId, authoritativeCaseId, purpose: "production")`.

2. **Build the evidence catalog** (`EvidenceCatalogReview.tsx`). Feature 001's `buildEvidenceCatalog(caseId, screenedOutcomes)` consumes the reactive Feature 009 state and writes `cases/<caseId>/evidence/catalog.json` containing:
   - `caseEvidence`: every released artifact, typed by `sourceRole`, with inherited `sha256`/`sizeBytes`/`locator`/`receiptId`/`exactDuplicateOfSha256`/`containedBySha256`/`importedAt`.
   - `referenceOnly`: every reference-library artifact imported separately (regulations, training, PBGC policy).
   - `excludedQuarantined`: every artifact excluded by Feature 009 screening, each linked to an `UnresolvedItem` so the omission is auditable.
   - `catalogContentSha256`: deterministic hash over the catalog, excluding operational `builtAt` for replayability.

3. **Extract provision candidates** (`ProvisionCandidateReview.tsx`). `candidate-extraction.ts` consumes Feature 009's passive parser output (text, PDF, OOXML, workbook, JSON, CSV/TSV) and emits `ProvisionCandidate` records to `cases/<caseId>/evidence/provision-candidates.jsonl`. Each candidate:
   - traces to one `EvidenceArtifact.sha256` and exact locator;
   - carries `verbatimText` (byte-exact) + `normalizedRestatement` (deterministic);
   - is `proposed` (never final);
   - opens an `UnresolvedItem` of kind `ambiguous-text` when text is ambiguous, never silently resolved.

4. **Detect near-duplicates and supersession**. `near-duplicates.ts` and `supersession.ts` emit Feature 009 `EvidenceRelationship` records linking candidates without discarding either. Supersession proposals carry `effectiveDate` and `confidence`; never silently apply the successor to the prior period.

5. **Author plan rules** (`PlanRuleAuthor.tsx`). An authorized reviewer promotes approved candidates into `PlanRuleRecord` records appended to `cases/<caseId>/evidence/rule-records.jsonl`. Each rule:
   - has exactly one primary `RuleCitation` from a released case-evidence artifact;
   - carries `effectiveDate`, optional `endDate`, applicability conditions, `confidence`, and `reviewStatus: "human-approved"`;
   - is rejected with `BLOCKED_BY_UNRESOLVED_ITEM` if any open `UnresolvedItem` covers its scope unless each item is explicitly linked;
   - has a deterministic `ruleContentSha256` (rule identity) and never silently covers a period outside `[effectiveDate, endDate]`;
   - when re-authored against a higher-authority source, creates a new linked rule (new id + new content hash + supersession link); the predecessor remains immutable.

6. **Track unresolved items** (`UnresolvedItemQueue.tsx`). Feature 001 surfaces ambiguous text, conflicting sources, missing sequencing, hidden-content flags inherited from Feature 009, and stale or superseded sources as first-class `UnresolvedItem` records. A human resolves them with typed decisions (accept/supersede/reject/branch) appended to `cases/<caseId>/evidence/unresolved-items.jsonl`. The chain is gapless and content-hash-bound exactly as Feature 009's `RelationshipDecision` chain.

7. **Issue authority overrides when needed**. When a rule's primary citation would otherwise come from a `regulation`, `training-reference`, or `other` source, the reviewer authors an `AuthorityOverride` first (`authority-override.ts` writing to `cases/<caseId>/evidence/authority-overrides.jsonl`) and links it from the rule. The override authorizes exactly one artifact hash for exactly one rule scope.

8. **Query authority and currency**. `authority-service.queryAuthority(ruleId)` returns source hash, locator, source type, confidence, supersession status, and review-status currency. A stale or superseded source opens an `UnresolvedItem` (`stale-source` or `superseded-source`) — it never silently archives a rule.

9. **Run the deterministic replay**. Running the same workflow twice on the same preserved case package and approved state MUST yield byte-identical `catalog.json`, `provision-candidates.jsonl`, `rule-records.jsonl`, `unresolved-items.jsonl`, and `authority-overrides.jsonl` content hashes (matching `SC-004` and `SC-006`). This is asserted by the integration test in `web/tests/integration/evidence-ingestion.test.ts`.

## Commands

The implementation extends the existing Feature 009 npm scripts; no new top-level command is introduced.

### Typecheck, lint, schema validation

```bash
npm run typecheck
npm run lint
npm run validate:schemas    # extends to the four new schemas under web/src/contracts/schemas/
npm run validate:contracts  # extends to the four new schemas' contract tests
```

### Tests

```bash
npm test                                       # full Vitest (unit + contract + integration + worker)
npm run test:unit                              # unit + contract + worker only
npm run test:integration                       # integration only (includes evidence-ingestion.test.ts)
npm run test:browser:e2e                       # Playwright Chromium/Edge (includes evidence-review.spec.ts)
```

### Build and single-HTML verify

```bash
npm run build
npm run verify:single-file   # confirms dist/ is a single pbgc-caseworkbench.html, no external URLs, no SW
```

### Quality gate (run before PR)

```bash
npm run quality    # typecheck + lint + format:check + validate:schemas + validate:contracts + test + build + verify:single-file
```

## Verification evidence (recorded after implementation in `docs/feature-001-validation-report.md`)

- Constitution compliance review — `docs/feature-001-constitution-review.md`
- Validation report — `docs/feature-001-validation-report.md`
- Performance results — `docs/feature-001-performance-results.md` (if scaled corpus relevant; this feature is bounded by Feature 009's already-completed passive parsing)

## Constraints to honor during implementation

- **Zero-network**: every Feature 001 code path runs under Feature 009's `security-boundary.ts` guard. No new external dependency, no service worker, no remote worker.
- **No real PII**: `web/tests/fixtures/` for Feature 001 must use only synthetic or de-identified plan language; never the real College of Saint Rose plan documents or participant data.
- **No execution claim**: the feature never claims Excel/ValTool/Runtime/ATPBGC/BCV execution; maturity caps at Implemented before tests and Tested after.
- **No `mySort`**: when reading from `reference/approved-v1-workbooks/` or `reference/approved-v1-summaries/` to author an `EvidenceArtifact` of `sourceRole: "approved-historical-calculation-artifact"`, the feature MUST NOT reproduce `mySort` or any other prohibited legacy structure (constitution section 14, FR-028).
- **Deterministic replay**: every governed record is content-hash-bound with gapless `appendOrdinal` and `prior*` linkage. Mutations append, never overwrite.

## Pilot context

Feature 001 is exercised against a de-identified or synthetic reduction of the College of Saint Rose Non-Contract Employees Pension Plan (PBGC case 24884900, DOPT 2024-06-30, benefit/participation freeze 2020-07-31). The pilot has:

- A plan document set with amendments and a benefit/participation freeze effective 2020-07-31 (used to exercise effective-date boundaries and supersession chains across that date).
- The reference library under `reference/regulations/`, `reference/training/`, `reference/approved-v1-summaries/`, `reference/approved-v1-workbooks/`, `reference/canonical-v1/` — used to exercise the reference-only catalog section and the AuthorityOverride path when a non-default source becomes canonical for a specific case purpose.

The real pilot package is not committed; only synthetic or de-identified reductions are used in tests, fixtures, examples, and documentation (constitution section 11).
