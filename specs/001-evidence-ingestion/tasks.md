# Tasks: Evidence Ingestion

**Input**: Design documents from `/specs/001-evidence-ingestion/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per the feature specification requirements. All entities and services require contract + unit tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — schema validation extensions, directory scaffolding, evidence workspace adapter

- [x] T001 Create evidence directory structure: `web/src/domain/evidence/`, `web/src/domain/plan-rules/`, `web/src/components/evidence/`, `web/tests/unit/domain/evidence/`, `web/tests/unit/domain/plan-rules/`, `web/tests/contract/`, `web/tests/integration/`
- [x] T002 Register the four new schemas in `web/tools/validate-design-schemas.mjs` and `web/tools/validate-contracts.mjs` to pick up `evidence-catalog.schema.json`, `provision-candidate.schema.json`, `plan-rule-record.schema.json`, `unresolved-item.schema.json`
- [x] T003 [P] Create `web/src/domain/evidence/models.ts` — export `SourceRole`, `EvidenceArtifact`, `EvidenceCatalog`, `ExcludedQuarantinedEntry` types (all fields per data-model.md §Entity: EvidenceCatalog and §Entity: EvidenceArtifact)
- [x] T004 [P] Create `web/src/domain/plan-rules/models.ts` — export `ProvisionCandidate`, `NearDuplicateRelationship`, `SupersessionProposal`, `PlanRuleRecord`, `RuleCitation`, `ApplicabilityCondition`, `SupersessionLink`, `UnresolvedItem`, `Interpretation`, `ResolutionEvent`, `AuthorityOverride`, `ConflictRecord` types (all fields per data-model.md)
- [x] T005 [P] Create `web/src/domain/evidence/source-roles.ts` — export `SOURCE_ROLES` constant, `sourceRoleLabel()`, `isValidSourceRole()`, `defaultAuthorityOrder()` (constitution section 4 order: executed-plan-document > formal-legal > approved-summary > certified-case-report > supporting-administrative > approved-historical > inference)
- [x] T006 Create `web/src/adapters/filesystem/evidence-workspace.ts` — implement `EvidenceWorkspace` class with methods: `writeCatalog()`, `readCatalog()`, `appendCandidates()`, `readCandidates()`, `appendRules()`, `readRules()`, `appendUnresolved()`, `readUnresolved()`, `appendOverrides()`, `readOverrides()` — all using atomic JSON/JSONL persistence under `cases/<caseId>/evidence/` per Decision 8
- [x] T007 [P] Create `web/tests/contract/evidence-contracts.test.ts` — Ajv validation tests for all four schemas: positive (valid document), negative (missing required field), semantic (competingInterpretations.length < 2 when open)
- [x] T008 Verify schema validation passes: `npm run validate:schemas && npm run validate:contracts`

**Checkpoint**: Foundation ready — schema validation works, directory structure in place, shared types defined

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Create `web/src/domain/evidence/catalog.ts` — implement `buildEvidenceCatalog(caseId, screenedOutcomes, referenceArtifacts)` function that: (a) consumes Feature 009 `ScreenedArtifactOutcome[]`, (b) excludes quarantined artifacts and records each as `UnresolvedItem`, (c) deduplicates exact-duplicate artifacts by sha256, (d) separates `caseEvidence` from `referenceOnly`, (e) computes `catalogContentSha256` deterministically (excluding `builtAt`), (f) returns `Result<EvidenceCatalog, CatalogBuildError>`
- [x] T010 [P] Create `web/tests/unit/domain/evidence/catalog.test.ts` — unit tests covering: normal build from screened artifacts, quarantined exclusion with unresolved item creation, exact-duplicate deduplication, container containment lineage, reference-only separation
- [x] T011 [P] Create `web/tests/unit/domain/evidence/source-roles.test.ts` — unit tests covering: valid role detection, default authority order correctness, role label mapping
- [x] T012 Create `web/tests/integration/evidence-ingestion.test.ts` — end-to-end test: build catalog from synthetic inventory → extract candidates → author rules → resolve unresolved items → verify deterministic replay (SC-004, SC-006)
- [x] T013 [P] Create `web/src/domain/review/unresolved-items.ts` extension — add evidence-specific kinds (`ambiguous-text`, `conflicting-provisions`, `missing-sequencing`, `undefined-term`, `hidden-content-flag`, `stale-source`, `superseded-source`, `missing-required-value`, `ambiguous-source-role`) to existing unresolved-items module; implement `createUnresolvedItem()`, `resolveItem()` with gapless content-hash-bound chain

**Checkpoint**: Foundation ready — catalog builder works, unresolved items trackable, integration test validates E2E flow

---

## Phase 3: User Story 1 — Establish the Evidence Catalog (Priority: P1) 🎯 MVP

**Goal**: Every preserved case-evidence artifact that passes Feature 009 screening appears in the evidence catalog exactly once with correct type, hash, size, and locator; quarantined artifacts are excluded and recorded as unresolved items

**Independent Test**: Open a preserved case package with mixed plan-doc, amendment, CBA, notice, report, workpaper, and unrelated artifacts; verify every eligible artifact appears exactly once in the catalog with correct type, hash, size, locator, and inherited receipt provenance; quarantined artifacts are excluded with unresolved item records

### Implementation for User Story 1

- [x] T014 [P] [US1] Implement `evidence-workspace.ts` `writeCatalog()` method — atomic encode + createImmutable + post-write hash verify pattern matching `case-workspace.ts:408`
- [x] T015 [US1] Implement `evidence-workspace.ts` `readCatalog()` method — read and validate catalog JSON with schema validation via Ajv
- [x] T016 [US1] Implement `catalog.ts` `buildEvidenceCatalog()` — consume `ScreenedArtifactOutcome[]`, apply FR-001 through FR-005 (inherit hashes, type by source role, exclude quarantined, preserve duplicates, separate reference-only)
- [x] T017 [US1] Implement `catalog.ts` quarantine exclusion — for each quarantined artifact, create `ExcludedQuarantinedEntry` with `quarantineDecisionId` and `linkedUnresolvedItemId`, emit `UnresolvedItem` of kind `other`
- [x] T018 [US1] Implement `catalog.ts` exact-duplicate deduplication — when two artifacts share `sha256`, preserve both receipt records, create one canonical `EvidenceArtifact`, link second receipt via `exactDuplicateOfSha256`
- [x] T019 [US1] Implement `catalog.ts` containment lineage — when artifact is extracted from container, set `containedBySha256` to parent hash
- [x] T020 [US1] Implement `catalog.ts` reference-only separation — classify regulations, training, PBGC policy into `referenceOnly` section, never in `caseEvidence`
- [x] T021 [US1] Implement `catalog.ts` `catalogContentSha256` computation — deterministic hash over `catalogId`, `caseId`, sorted `caseEvidence`, sorted `referenceOnly`, sorted `excludedQuarantined` (excludes `builtAt`)
- [x] T022 [US1] Create `web/src/components/evidence/EvidenceCatalogReview.tsx` — React component showing catalog table with columns: artifact hash (truncated), source role, size, locator, receipt provenance, review status; filter by source role; highlight quarantined exclusions
- [x] T023 [US1] Wire `EvidenceCatalogReview` into `web/src/app/App.tsx` — add evidence review route after classification

**Checkpoint**: User Story 1 fully functional — catalog builds from Feature 009 inventory, quarantined excluded with unresolved items, deterministic replay verified

---

## Phase 4: User Story 2 — Extract Plan-Rule Candidates from Evidence (Priority: P1)

**Goal**: Every extracted candidate traces to a single source artifact and exact locator; candidates are proposed-only with verbatim text and normalized restatement; ambiguous text flagged as unresolved items

**Independent Test**: Extract provision text from two near-duplicate amendments; verify both candidates recorded with distinct locators, identical normalized restatement, explicit near-duplicate relationship, neither marked final until human approval

### Implementation for User Story 2

- [x] T024 [P] [US2] Implement `candidate-extraction.ts` — `extractCandidates(artifactSha256, parsedOutput)` function that: (a) consumes Feature 009 passive parser output (text, PDF, OOXML, workbook, JSON, CSV), (b) emits `ProvisionCandidate` records with `status: "proposed"`, (c) computes `candidateContentSha256` deterministically, (d) returns `Result<ProvisionCandidate[], ExtractionError>`
- [x] T025 [P] [US2] Implement `candidate-extraction.ts` date extraction — `extractEffectiveDate()` and `extractAdoptionDate()` with `dateExtractionConvention` field: "explicit" when source states date, "inferred-from-context" when inferred (proposal-only, linkable to UnresolvedItem), "unknown" when not extractable
- [x] T026 [US2] Implement `candidate-extraction.ts` verbatim text extraction — exact byte-exact text from source at locator; JSON Pointer for JSON, page/offset for PDF, sheet/cell for spreadsheets, line/offset for text
- [x] T027 [US2] Implement `candidate-extraction.ts` normalized restatement — deterministic restatement produced by extractor; parallel field to verbatim text, never alters verbatim
- [x] T028 [US2] Implement `candidate-extraction.ts` confidence scoring — deterministic score from extractor parameters, range [0, 1]
- [x] T029 [US2] Implement `near-duplicates.ts` — `detectNearDuplicates(candidates)` function using token-shingle similarity over normalized restatement hash; emit `EvidenceRelationship` of type `near-duplicate` linking both candidates without discarding either
- [x] T030 [US2] Implement `supersession.ts` — `detectSupersession(candidates)` function detecting predecessor/successor when later amendment restates prior provision; emit `EvidenceRelationship` of type `supersession` with effective date and confidence; never silently apply successor to prior period
- [x] T031 [US2] Implement unresolved-item emission for ambiguous text — when extractor encounters "may", "at the discretion of", undefined term, create `UnresolvedItem` of kind `ambiguous-text` with competing interpretations preserved
- [x] T032 [US2] Implement unresolved-item emission for formula vs. example — when document contains both formula text and worked numeric example, record separately with example marked as non-authoritative; emit `UnresolvedItem` if ambiguous which is governing
- [x] T033 [US2] Implement reference candidate handling — reference-artifact candidates recorded as non-authoritative context; never promotable to final plan rule without AuthorityOverride
- [x] T034 [US2] Create `web/src/components/evidence/ProvisionCandidateReview.tsx` — React component showing candidates with: source artifact hash, locator, verbatim text, normalized restatement, effective date, confidence, status; near-duplicate highlights; supersession links
- [x] T035 [US2] Wire `ProvisionCandidateReview` into `web/src/app/App.tsx` — add candidate review route
- [x] T036 [US2] Create `web/tests/unit/domain/plan-rules/candidate-extraction.test.ts` — unit tests for extraction from text, PDF, OOXML, JSON; verbatim text accuracy; date extraction; confidence scoring; ambiguous text flagging
- [x] T037 [US2] Create `web/tests/unit/domain/plan-rules/near-duplicates.test.ts` — unit tests for near-duplicate detection across amendments; verify no candidate discarded; verify relationship linking
- [x] T038 [US2] Create `web/tests/unit/domain/plan-rules/supersession.test.ts` — unit tests for supersession detection; verify effective date on link; verify no silent application to prior period

**Checkpoint**: User Stories 1 AND 2 fully functional — candidates extract from evidence, near-duplicates and supersession detected, ambiguous text flagged

---

## Phase 5: User Story 3 — Author an Effective-Dated Plan-Rule Record (Priority: P1)

**Goal**: An authorized reviewer promotes approved candidates into a single effective-dated plan-rule record; predecessor remains immutable; supersession chain links predecessor and successor with effective dates

**Independent Test**: Author one plan-rule record for a benefit-formula amendment effective 2020-07-31; verify the rule explicitly stops at that date for affected participant groups, preserves predecessor unchanged, rejects attempt to apply new rule to prior period

### Implementation for User Story 3

- [x] T039 [P] [US3] Implement `rule-authoring.ts` — `authorRule(proposedCandidates, primaryCitation, effectiveDate, applicabilityConditions, reviewer)` function that: (a) validates exactly one primary `RuleCitation`, (b) validates `effectiveDate <= endDate` when both present, (c) rejects if open `UnresolvedItem` covers scope (FR-018), (d) rejects if `primaryCitation.sourceRole` is `regulation`/`training-reference`/`other` without `authorityOverrideId`, (e) computes `ruleContentSha256` deterministically, (f) returns `Result<PlanRuleRecord, AuthoringError>`
- [x] T040 [US3] Implement `rule-authoring.ts` supersession chain — when authoring successor to existing rule: (a) predecessor remains immutable, (b) append `SupersessionLink` with `appendOrdinal` gapless, `predecessorRuleId`, `predecessorRuleContentSha256`, `effectiveDate`, `linkType`, (c) new rule gets new `ruleId` and `ruleContentSha256`
- [x] T041 [US3] Implement `rule-authoring.ts` unresolved-item blocking — when any open `UnresolvedItem` has `affectedScope` intersecting rule scope, reject authoring with `BLOCKED_BY_UNRESOLVED_ITEM`; require explicit linkage or resolution first
- [x] T042 [US3] Implement `rule-authoring.ts` applicability conditions — enforce that conditions distinguish participant group, benefit purpose, service definition, actuarial-equivalence purpose, freeze/restriction, amendment period whenever those distinctions affect results
- [x] T043 [US3] Implement `evidence-workspace.ts` `appendRules()` and `readRules()` — JSONL append with content-hash-bound events, gapless `appendOrdinal`, prior-linkage validation
- [x] T044 [US3] Create `web/src/components/evidence/PlanRuleAuthor.tsx` — React component for rule authoring: select candidates, set primary citation, enter effective date, define applicability conditions, review supersession chain, approve; show BLOCKED_BY_UNRESOLVED_ITEM warning when applicable
- [x] T045 [US3] Wire `PlanRuleAuthor` into `web/src/app/App.tsx` — add rule authoring route
- [x] T046 [US3] Create `web/tests/unit/domain/plan-rules/rule-authoring.test.ts` — unit tests for: valid authoring, supersession chain creation, unresolved-item blocking, effective-date boundary enforcement, authority override requirement for reference sources

**Checkpoint**: User Stories 1, 2, AND 3 fully functional — rules author with effective dates, supersession chains, unresolved-item blocking

---

## Phase 6: User Story 4 — Track Unresolved Evidence Issues (Priority: P2)

**Goal**: Ambiguous language, evidence conflicts, missing sequencing, hidden-content flags, and stale sources become first-class unresolved items with competing interpretations preserved; human resolution with typed decision record

**Independent Test**: Open a case where an amendment effective date is ambiguous; verify system records unresolved item with competing interpretations; downstream rule explicitly carries unresolved-item reference until resolved by authorized human

### Implementation for User Story 4

- [x] T047 [P] [US4] Implement `unresolved-items.ts` `createUnresolvedItem(kind, affectedScope, competingInterpretations, consequence, reviewer)` — gapless content-hash-bound chain, `itemContentSha256` computed deterministically, `status: "open"` initially
- [x] T048 [US4] Implement `unresolved-items.ts` `resolveItem(itemId, decisionType, selectedInterpretation, rationale, reviewer)` — append `ResolutionEvent` with gapless `appendOrdinal`, `priorEventId`, `priorEventContentSha256`; support `accept`, `supersede`, `reject`, `branch` decisions; `branch` spawns successor unresolved item preserving non-selected interpretation
- [x] T049 [US4] Implement unresolved-item kinds — create typed emitters for each kind: `ambiguous-text`, `conflicting-provisions`, `missing-sequencing`, `undefined-term`, `hidden-content-flag`, `stale-source`, `superseded-source`, `missing-required-value`, `ambiguous-source-role`
- [x] T050 [US4] Implement hidden-content flag surfacing — when Feature 009 screening flags hidden content, create `UnresolvedItem` of kind `hidden-content-flag` affecting candidate inclusiveness; candidate not silently authored
- [x] T051 [US4] Implement stale-source detection — when source artifact `reviewStatus` is `stale` or regulatory supersession date passed, flag affected rules and open `UnresolvedItem` of kind `stale-source` or `superseded-source`
- [x] T052 [US4] Create `web/src/components/evidence/UnresolvedItemQueue.tsx` — React component showing open unresolved items with: kind badge, affected scope, competing interpretations list, consequence, reviewer, resolution history; action buttons for accept/supersede/reject/branch
- [x] T053 [US4] Wire `UnresolvedItemQueue` into `web/src/app/App.tsx` — add unresolved items route
- [x] T054 [US4] Create `web/tests/unit/domain/plan-rules/unresolved-items.test.ts` — unit tests for: creation, resolution chain gapless replay, branch decision spawning, stale-source detection, hidden-content surfacing

**Checkpoint**: User Stories 1-4 fully functional — unresolved items tracked as first-class entities, human resolution with typed decisions

---

## Phase 7: User Story 5 — Maintain Source-Authority and Supersession Lineage (Priority: P2)

**Goal**: Query authority and currency of any plan-rule record; default authority order enforced; case-specific AuthorityOverride for non-default sources; supersession chain visible across amendments

**Independent Test**: Author a rule from plan summary, then import executed plan document covering same scope; verify system proposes re-authoring with higher-authority source, preserves prior summary-based record immutable, does not silently overwrite

### Implementation for User Story 5

- [x] T055 [P] [US5] Implement `authority-service.ts` `queryAuthority(ruleId)` — returns source hash, locator, source type, confidence, supersession status, review-status currency; opens `UnresolvedItem` when source is stale or superseded (FR-021, FR-023)
- [x] T056 [US5] Implement `authority-service.ts` `checkAuthorityOrder(rule, newSource)` — compare `rule.primaryCitation.sourceRole` against `newSource.sourceRole` using default authority order; when higher-authority source available, propose re-authoring rather than silent overwrite (FR-022)
- [x] T057 [US5] Implement `authority-override.ts` — `issueOverride(caseId, affectedRuleScope, authorizedSourceRole, authorizedArtifactSha256, rationale, issuer)` function creating `AuthorityOverride` with `overrideContentSha256`; validate one artifact hash per scope per override
- [x] T058 [US5] Implement `authority-service.ts` `enforceAuthorityOrder(rule)` — reject rule authoring if `primaryCitation.sourceRole` in `{regulation, training-reference, other}` without linked `AuthorityOverride` (FR-015, FR-024)
- [x] T059 [US5] Implement supersession chain query — `getSupersessionChain(ruleId)` returns full chain with predecessor/successor immutable, effective dates on every link, no collapsed single-current rule
- [x] T060 [US5] Implement `evidence-workspace.ts` `appendOverrides()` and `readOverrides()` — JSONL append for AuthorityOverride events with gapless replay
- [x] T061 [US5] Create `web/tests/unit/domain/plan-rules/authority-service.test.ts` — unit tests for: authority order enforcement, higher-authority re-authoring proposal, override issuance, stale-source detection, supersession chain query

**Checkpoint**: All user stories fully functional — authority order enforced, overrides work, supersession lineage visible

**Precommit review remediation**: Findings 2–9 are incorporated into the completed backend tasks above: authenticated catalog/unresolved/override authoring context, append-only unresolved revisions, concurrent append locking, symlink/substitution defenses, integrity-bound approvals, exact constitutional authority tiers, and fail-closed linear supersession queries.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T062 [P] Run quickstart.md end-to-end validation — follow `quickstart.md` steps 1-9 on synthetic data; verify deterministic content-hash replay and governed-record round trips (SC-004, SC-006)
- [x] T063 [P] Run quality gate: `npm run quality` (typecheck + lint + format:check + validate:schemas + validate:contracts + test + build + verify:single-file)
- [x] T064 [P] Create `docs/feature-001-validation-report.md` — record Constitution compliance, validation results, and performance-benchmark status
- [x] T065 [P] Create `docs/feature-001-constitution-review.md` — document how each Constitution section (3-16) is honored
- [x] T066 Run `npm run test:integration` — verify evidence-ingestion.test.ts passes
- [x] T067 Run targeted Playwright evidence review — verify evidence-review.spec.ts passes 2/2 in Chromium; Edge was not run
- [x] T068 Commit all Feature 001 work with descriptive commit messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — catalog must work before candidates
- **US2 (Phase 4)**: Depends on Foundational — candidates depend on catalog
- **US3 (Phase 5)**: Depends on US1 + US2 — rules cite candidates from catalog
- **US4 (Phase 6)**: Depends on Foundational — can run parallel with US2/US3
- **US5 (Phase 7)**: Depends on US3 — authority service checks rules
- **Polish (Phase 8)**: Depends on all user stories

### User Story Dependencies

- **US1 (P1)**: Catalog → no dependencies on other stories
- **US2 (P1)**: Candidates → depends on US1 (catalog provides artifacts to extract from)
- **US3 (P1)**: Rules → depends on US1 + US2 (rules cite candidates from catalog)
- **US4 (P2)**: Unresolved → depends on Foundational; can run parallel with US2/US3
- **US5 (P2)**: Authority → depends on US3 (authority checks rules)

### Within Each User Story

- Models/types before services
- Services before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T003, T004, T005 (Setup models) — parallel
- T007 (contract tests) — parallel with T006
- T010, T011, T013 (Foundational tests) — parallel
- T024, T025 (US2 extraction) — parallel
- T036, T037, T038 (US2 tests) — parallel
- T047 (US4 creation) — parallel with US2/US3 implementation
- T055 (US5 authority query) — parallel with US4

---

## Implementation Strategy

### MVP First (US1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Establish Evidence Catalog
4. **STOP and VALIDATE**: Test catalog independently
5. Commit and deploy if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 → Test independently → Commit (MVP!)
3. US2 → Test independently → Commit
4. US3 → Test independently → Commit
5. US4 → Test independently → Commit
6. US5 → Test independently → Commit
7. Polish → Quality gate → Commit

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
