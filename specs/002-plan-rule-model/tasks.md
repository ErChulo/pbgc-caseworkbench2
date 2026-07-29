# Tasks: Plan Rule Model

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature 001 evidence ingestion

## Phase 1: Core Types and Models

- [x] T001 Define `PlanRuleRecord`, `RuleCitation`, `SupersessionLink`, `ApplicabilityCondition` types
- [x] T002 Define `UnresolvedItem`, `Interpretation`, `ResolutionEvent` types
- [x] T003 Define `AuthorityOverride`, `OverrideSupersessionLink`, `ConflictRecord` types
- [x] T004 Define `ProvisionCandidate` extraction model

## Phase 2: Rule Authoring

- [x] T005 Implement `authorRule` with complete citation, applicability, and governance validation
- [x] T006 Implement deterministic rule content hash computation
- [x] T007 Implement supersession chain assembly with predecessor hash binding
- [x] T008 Implement authority governance authentication against evidence catalog and overrides

## Phase 3: Supporting Services

- [x] T009 Implement authority override resolution with effective override selection
- [x] T010 Implement unresolved item projection and resolution history
- [x] T011 Implement candidate extraction from parsed evidence
- [x] T012 Implement near-duplicate detection for candidate deduplication
- [x] T013 Implement supersession chain validation and predecessor verification

## Phase 4: Tests

- [x] T014 Add authority-service tests for governance validation
- [x] T015 Add supersession chain tests for link ordering and predecessor binding
- [x] T016 Add unresolved-item tests for resolution history and blocking
- [x] T017 Add near-duplicate detection tests

## Phase 5: Quality Gate

- [x] T018 Run typecheck, lint, and format checks
- [x] T019 Run unit test suite
- [x] T020 Verify downstream consumption by Feature 004 and Feature 005

Feature 002 maturity: Tested (Constitution section 13 level 3). Not independently validated or human approved.

## Dependencies

Feature 001 evidence ingestion provides candidate extraction. Feature 004 and Feature 005 consume `PlanRuleRecord` for architecture and build specification.
