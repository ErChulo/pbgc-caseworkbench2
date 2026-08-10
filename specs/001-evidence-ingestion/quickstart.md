# Quickstart: Evidence Ingestion

**Feature**: 001 Evidence Ingestion
**Branch**: `010-evidence-ingestion`
**Status**: Implemented and tested on deterministic synthetic evidence. The full quality gate must be rerun after this documentation update.

## Implemented end-to-end sequence

A reviewer who has already completed a Feature 009 intake and has a preserved, screened, and released case package performs the following on the local-first runtime:

1. **Open the case** in the Feature 009 workspace. Feature 009's intake pipeline has produced `ScreenedArtifactOutcome[]` with `downstreamBlocked: true` and `governedState: "provisional"`. US1 of Feature 009 (case creation) has run; the active case is `(caseId, authoritativeCaseId, purpose: "production")`.

2. **Build the evidence catalog** (`EvidenceCatalogReview.tsx`). Feature 001's `buildEvidenceCatalog(caseId, screenedOutcomes)` consumes the reactive Feature 009 state and writes an immutable `cases/<caseId>/evidence/catalogs/<catalogContentSha256>.json` snapshot, then updates pointer-only `cases/<caseId>/evidence/catalogs/current.json` per ADR 010. The catalog contains:
   - `caseEvidence`: every released artifact, typed by `sourceRole`, with inherited `sha256`/`sizeBytes`/`locator`/canonical `receiptId`/all sorted `receiptIds`/`exactDuplicateOfSha256`/`containedBySha256`/`importedAt`.
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

6. **Track unresolved items** (`UnresolvedItemQueue.tsx`). Feature 001 surfaces ambiguous text, conflicting sources, missing sequencing, hidden-content flags inherited from Feature 009, and stale or superseded sources as first-class `UnresolvedItem` records. `resolveItem()` validates typed accept/supersede/reject/branch decisions and emits content-hash-bound revisions. The browser reviewer currently retains those outputs only as a labeled synthetic session preview; durable JSONL append/read is exercised separately through the evidence workspace adapter.

7. **Issue authority overrides when needed**. When a rule's primary citation would otherwise come from a `regulation`, `training-reference`, or `other` source, the reviewer authors an `AuthorityOverride` first (`authority-override.ts` writing to `cases/<caseId>/evidence/authority-overrides.jsonl`) and links it from the rule. The override authorizes exactly one artifact hash for exactly one rule scope.

8. **Query authority and currency**. `authority-service.queryAuthority(ruleId)` returns source hash, locator, source type, confidence, supersession status, and review-status currency. A stale or superseded source opens an `UnresolvedItem` (`stale-source` or `superseded-source`) — it never silently archives a rule.

9. **Run the deterministic replay**. Running the same workflow twice on the same preserved case package and approved state MUST yield identical governed content hashes (matching `SC-004` and `SC-006`). `web/tests/integration/evidence-ingestion.test.ts` exercises the synthetic catalog-to-candidate-to-resolution-to-rule path, rebuilds the catalog with a different operational `builtAt`, verifies the same `catalogContentSha256`, persists the governed records, and reads them back through the validated workspace adapter.

## Recorded synthetic replay

The 2026-07-29 validation pass used only deterministic synthetic records and fixed test identifiers. It established the following end-to-end evidence:

1. A released synthetic text artifact was cataloged with its source role, locator, receipt provenance, and content hash.
2. A synthetic amendment provision was extracted as a proposed candidate with an explicit effective date and source citation.
3. Two competing interpretations were recorded, then one was accepted through a typed human-resolution event.
4. A governed, effective-dated rule was authored only after resolution of the blocking item.
5. Catalog, candidate, unresolved-item, and rule records were persisted and read back through `EvidenceWorkspace`.
6. Rebuilding the synthetic catalog with only `builtAt` changed produced the same `catalogContentSha256`.

The integration command passed 54/54 tests across the integration project. This replay establishes Tested maturity; it is not an independent external-system validation.

## Commands

The implementation extends the existing Feature 009 npm scripts; no new top-level command is introduced.

### Typecheck, lint, schema validation

```bash
npm run typecheck
npm run lint
npm run validate:schemas    # validates 14 design schemas, including five Feature 001 schemas
npm run validate:contracts  # verifies all 14 runtime schemas against approved source bytes
```

### Tests

```bash
npm test                                       # full Vitest (unit + contract + integration + worker)
npm run test:unit                              # unit + contract + worker only
npm run test:integration                       # integration only (includes evidence-ingestion.test.ts)
npm run test:browser:chromium                   # Playwright Chromium project
npx playwright test web/tests/browser/evidence-review.spec.ts --project=chromium
```

### Build and single-HTML verify

```bash
npm run build
npm run verify:single-file   # confirms dist/ is a single pbgc-caseworkbench.html, no external URLs, no SW
```

### Quality gate (must be rerun after documentation changes)

```bash
npm run quality    # typecheck + lint + format:check + validate:schemas + validate:contracts + test + build + verify:single-file
```

## Verification evidence

- Constitution compliance review — `docs/feature-001-constitution-review.md`
- Validation report — `docs/feature-001-validation-report.md`
- No performance benchmark was run in this polish pass; no performance result is claimed.

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
