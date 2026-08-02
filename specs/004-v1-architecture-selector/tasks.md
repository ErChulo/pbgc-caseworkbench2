# Tasks: V1 Architecture Selector

**Input**: Design documents from `/specs/004-v1-architecture-selector/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Tests are included per the feature specification requirements. All entities and services require contract + unit tests.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization — schema validation extensions, directory scaffolding, rule file population

- [x] T001 Create architecture directory structure: `web/src/domain/architecture/`, `web/tests/unit/domain/architecture/`, `web/tests/integration/`
- [x] T002 Register `v1-architecture.schema.json` in `web/tools/validate-design-schemas.mjs` and `web/tools/validate-contracts.mjs`
- [x] T003 [P] Create `web/src/domain/architecture/models.ts` — export `V1Architecture`, `SourceTab`, `RunDescriptor`, `DateRange`, `RunJustification`, `CellDescriptor`, `IoBClassification`, `IoBValue`, `FormulaDependency`, `NamedRange`, `ScenarioSelectionPolicy`, `TabSelectionPolicy`, `IoBClassificationRule`, `TriggerCondition`, `ArchitectureBuildError` types (all fields per data-model.md)
- [x] T004 [P] Populate `rules/scenario-selection.yaml` — define approved scenarios (DOR, NRD, ERD, EURD, DORNSF, QPSA, QPSALIAB, RBD, XRD) with trigger conditions derived from reference V1 summaries
- [x] T005 [P] Populate `rules/tab-selection.yaml` — define tab selection rules based on population characteristics
- [x] T006 [P] Populate `rules/iob-classification.yaml` — define I/O/B classification rules for generic fields per run
- [x] T007 Create `web/src/domain/architecture/rule-loader.ts` — implement `loadRuleSets()` function that reads YAML rule files and returns typed policy objects
- [x] T008 [P] Create `web/tests/contract/v1-architecture-contracts.test.ts` — Ajv validation tests for `v1-architecture.schema.json`: positive (valid document), negative (missing required field), semantic (empty cells map)
- [x] T009 Verify schema validation passes: `npm run validate:schemas && npm run validate:contracts`

**Checkpoint**: Foundation ready — schema validation works, directory structure in place, rule files populated

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T010 Create `web/src/domain/architecture/field-name-glossary.ts` — implement `mapGenericField(workbookDescription, tabContext)` function that normalizes workbook-specific field names to generic field names using `rules/field-name-glossary.yaml`
- [x] T011 [P] Populate `rules/field-name-glossary.yaml` — map common workbook field descriptions to generic names (DOB, BSEX, COMP, FV, BENEFIT, etc.) based on reference V1 summaries
- [x] T012 [P] Create `web/tests/unit/domain/architecture/rule-loader.test.ts` — unit tests for YAML rule loading, validation, and policy construction
- [x] T013 Create `web/src/adapters/filesystem/architecture-workspace.ts` — implement `saveArchitecture()`, `loadArchitecture()` methods using atomic JSON persistence under `cases/<caseId>/architecture/`

**Checkpoint**: Foundation ready — rule loading works, field mapping works, workspace persistence works

---

## Phase 3: User Story 1 — Determine Applicable Calculation Scenarios (Priority: P1) 🎯 MVP

**Goal**: Given approved plan rules and case controls, the system determines which calculation scenarios/runs apply to the case with traceable justification

**Independent Test**: Load a case with early-retirement and normal-retirement provisions; verify DOR, NRD, ERD scenarios are selected and QPSA is excluded; verify each selection is traceable to a plan rule

### Implementation for User Story 1

- [x] T014 [P] [US1] Create `web/src/domain/architecture/scenario-selector.ts` — implement `selectScenarios({planRules, population, caseControls, scenarioPolicy})` so trigger combinations may be satisfied across the complete approved rule set, governed population triggers/exclusions use validated evidence dimensions, every contributing rule remains traceable, and missing/conflicting combinations return aggregate unresolved items
- [x] T015 [US1] Implement scenario trigger evaluation — `evaluateTriggerCondition(condition, planRules)` function that checks plan rule applicability conditions against trigger dimensions
- [x] T016 [US1] Implement scenario exclusion evaluation — `evaluateExclusionCondition(condition, planRules)` function that prevents scenario selection when exclusion conditions are met
- [x] T017 [US1] Implement effective date range derivation — `deriveDateRange(planRules, scenario)` function that computes the date range where a scenario applies based on plan rule effective dates
- [x] T018 [US1] Implement scenario conflict detection — when two plan rules suggest conflicting scenarios, emit UnresolvedItem of kind "conflicting-provisions" rather than silently selecting one
- [x] T019 [US1] Create `web/tests/unit/domain/architecture/scenario-selector.test.ts` — unit tests for: basic scenario selection, exclusion conditions, effective date derivation, conflict detection, deterministic replay

**Checkpoint**: User Story 1 fully functional — scenarios selected with traceable justification

---

## Phase 4: User Story 2 — Select Population Tabs (Priority: P1)

**Goal**: Given an approved population profile, the system selects which source tabs to include in the workbook, justified by population characteristics

**Independent Test**: Load a case with Retirees and Separated Vesteds populations; verify both tabs are selected; load a case with only Retirees; verify only the Retirees tab is selected

### Implementation for User Story 2

- [x] T020 [P] [US2] Create `web/src/domain/architecture/tab-selector.ts` — implement `selectTabs({population, tabPolicy})` so `populationRequirement` is established by approved, hash-bound population characteristic evidence rather than a matching sheet name alone
- [x] T021 [US2] Implement population-to-tab mapping — `mapPopulationToTab(candidate, tabPolicy)` matches observed sheets only after the governed population characteristic satisfies the matching rule
- [x] T022 [US2] Implement required field validation — `validateRequiredFields(tab, population)` function that checks all required generic fields are present in the population candidate's observed fields
- [x] T023 [US2] Implement empty population handling — when no approved population candidates exist, emit UnresolvedItem of kind "missing-required-value" and return empty tab list
- [x] T024 [US2] Create `web/tests/unit/domain/architecture/tab-selector.test.ts` — unit tests for: basic tab selection, required field validation, empty population, deterministic replay

**Checkpoint**: User Story 2 fully functional — tabs selected from population profile

---

## Phase 5: User Story 3 — Build Field Inventory with I/O/B Classification (Priority: P1)

**Goal**: For each selected tab and run, the system produces the complete field inventory with generic field names and per-run I/O/B classification

**Independent Test**: For a case with two tabs and three runs, verify every cell in the source workbooks is mapped to a generic field with correct I/O/B assignment per run; verify CALC_INDICATOR and CALCULATION fields are correctly classified

### Implementation for User Story 3

- [x] T025 [P] [US3] Create `web/src/domain/architecture/field-inventory.ts` — inventory mapped observed headers, every observed formula cell including formulas below headers, and relevant observed cells on canonical support sheets; derive actual descriptions from observed headers, exclude participant values, and never invent cells
- [x] T026 [US3] Create `web/src/domain/architecture/iob-classifier.ts` — implement `classifyIoB({cells, scenarios, iobPolicy})` function that: (a) applies I/O/B classification rules to each cell per run, (b) handles CALC_INDICATOR (I/O/B = B), (c) handles CALCULATION (I/O/B = N), (d) returns classified cells with perRunClassification populated
- [x] T027 [US3] Implement CALC_INDICATOR handling — when genericField is "CALC_INDICATOR", force I/O/B = B across all runs; never conflate with other B values (Constitution Section 7)
- [x] T028 [US3] Implement CALCULATION handling — when genericField is "CALCULATION", force I/O/B = N across all runs; record calculation run identifier
- [x] T029 [US3] Implement unmapped field detection — when a workbook field has no generic field mapping, emit UnresolvedItem of kind "ambiguous-source-role"
- [x] T030 [US3] Create `web/tests/unit/domain/architecture/field-inventory.test.ts` — unit tests for: field mapping, CALC_INDICATOR handling, CALCULATION handling, unmapped field detection
- [x] T031 [US3] Create `web/tests/unit/domain/architecture/iob-classifier.test.ts` — unit tests for: I/O/B rule application, priority resolution, deterministic classification

**Checkpoint**: User Stories 1, 2, AND 3 fully functional — field inventory built with I/O/B classification

---

## Phase 6: User Story 4 — Compute Formula Dependencies (Priority: P2)

**Goal**: The system computes the formula dependency graph showing which cells reference which other cells, enabling the formula compiler to produce correct output

**Independent Test**: Load a workbook with a formula referencing another cell; verify the dependency graph captures this relationship; verify circular dependencies are detected and flagged

### Implementation for User Story 4

- [x] T032 [P] [US4] Create `web/src/domain/architecture/dependency-graph.ts` — implement `computeDependencies({cells, scenarios})` function that: (a) parses formula text to extract cell references, (b) resolves named range references, (c) constructs FormulaDependency edges, (d) detects circular dependencies, (e) returns `Result<readonly FormulaDependency[], ArchitectureBuildError>`
- [x] T033 [US4] Implement formula reference extraction — `extractFormulaRefs(formulaText, currentTab)` function that parses Excel formula syntax to extract cell references (e.g., A1, B15, Sheet2!A1)
- [x] T034 [US4] Implement named range resolution — `resolveNamedRange(name, namedRanges)` function that maps named range references to cell addresses
- [x] T035 [US4] Implement circular dependency detection — `detectCycles(dependencies)` function that identifies and flags circular references as UnresolvedItem of kind "missing-sequencing"
- [x] T036 [US4] Create `web/tests/unit/domain/architecture/dependency-graph.test.ts` — unit tests for: reference extraction, named range resolution, cycle detection, deterministic replay

**Checkpoint**: User Stories 1-4 fully functional — formula dependencies computed

---

## Phase 7: User Story 5 — Identify Named Ranges (Priority: P2)

**Goal**: The system identifies and catalogs named ranges from the source workbook that represent plan-level parameters

**Independent Test**: Load a workbook with named ranges for Freeze_Date and Benefit_Factor; verify both appear in the architecture output with correct cell references

### Implementation for User Story 5

- [x] T037 [P] [US5] Implement named range extraction in `field-inventory.ts` — `extractNamedRanges(tabs, population)` function that: (a) identifies cells with plan-level parameter names, (b) maps to generic field names via glossary, (c) returns `readonly NamedRange[]`
- [x] T038 [US5] Implement named range scope detection — determine whether a named range is workbook-scoped or sheet-scoped based on definition location
- [x] T039 [US5] Create `web/tests/unit/domain/architecture/named-ranges.test.ts` — unit tests for: extraction, scope detection, generic field mapping

**Checkpoint**: User Stories 1-5 fully functional — named ranges identified

---

## Phase 8: Integration & Assembly

**Purpose**: Wire everything together and validate end-to-end

- [x] T040 Create `web/src/domain/architecture/architecture-builder.ts` — implement `buildArchitecture({caseId, planRules, population, ...})` orchestrator that calls scenario-selector, tab-selector, field-inventory, iob-classifier, dependency-graph in sequence and assembles V1Architecture
- [x] T041 Implement `architectureContentSha256` computation — deterministic hash over all V1Architecture fields except the hash itself
- [x] T042 Implement unresolved item integration — aggregate all material unresolved items from scenario, population/tab, field/classification, and dependency stages before blocking architecture output
- [x] T043 Create `web/tests/integration/architecture-selection.test.ts` — end-to-end governed build with below-header and support-sheet formulas, deterministic content-hash replay, and multi-stage blocker aggregation
- [x] T044 Verify schema validation passes with new architecture schema: `npm run validate:schemas && npm run validate:contracts`

**Checkpoint**: Full integration complete — architecture selector produces valid, deterministic output

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T045 [P] Run quickstart.md end-to-end validation — verify equal deterministic content hashes; verify byte-identical operational envelopes only when IDs and timestamps are injected equally
- [x] T046 [P] Run quality gate: `npm run quality`
- [x] T047 [P] Create `docs/feature-004-validation-report.md` — record Constitution compliance, validation results
- [x] T048 [P] Create `docs/feature-004-constitution-review.md` — document how each Constitution section (3, 5, 6, 7, 12, 14) is honored
- [x] T049 Run `npm run test:integration` — verify architecture-selection.test.ts passes
- [x] T050 Commit all Feature 004 work with descriptive commit messages

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — scenarios must work before tabs
- **US2 (Phase 4)**: Depends on Foundational — tabs depend on rule loading
- **US3 (Phase 5)**: Depends on US1 + US2 — field inventory needs scenarios and tabs
- **US4 (Phase 6)**: Depends on US3 — dependencies need field inventory
- **US5 (Phase 7)**: Depends on US3 — named ranges need field inventory
- **Integration (Phase 8)**: Depends on all user stories
- **Polish (Phase 9)**: Depends on Integration

### User Story Dependencies

- **US1 (P1)**: Scenarios → depends on Foundational
- **US2 (P1)**: Tabs → depends on Foundational
- **US3 (P1)**: Field Inventory → depends on US1 + US2
- **US4 (P2)**: Dependencies → depends on US3
- **US5 (P2)**: Named Ranges → depends on US3

### Within Each User Story

- Models/types before services
- Services before UI components
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- T003, T004, T005, T006 (Setup rules and models) — parallel
- T008 (contract tests) — parallel with T007
- T010, T011 (glossary) — parallel
- T012, T013 (tests and workspace) — parallel
- T014, T020 (US1 and US2 core) — parallel after Foundational
- T025, T026 (US3 inventory and classifier) — parallel
- T032, T037 (US4 and US5 core) — parallel after US3

---

## Implementation Strategy

### MVP First (US1 + US2 + US3)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 — Scenario Selection
4. Complete Phase 4: US2 — Tab Selection
5. Complete Phase 5: US3 — Field Inventory + I/O/B
6. **STOP and VALIDATE**: Test field inventory independently
7. Commit and deploy if ready

### Incremental Delivery

1. Setup + Foundational → Foundation ready
2. US1 + US2 + US3 → Test independently → Commit (MVP!)
3. US4 → Test independently → Commit
4. US5 → Test independently → Commit
5. Integration → Quality gate → Commit
6. Polish → Documentation → Commit

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
