# Tasks: Case Intake and Evidence Normalization

**Input**: Design documents from `specs/009-case-intake-normalization/`

**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required. Write the listed tests before their corresponding implementation, confirm they fail for the intended reason, then make them pass.

**Organization**: Tasks are grouped by setup, blocking foundations, and the six user stories in priority order. Every path is repository-relative. Production runtime code is under `web/src/`; tests and synthetic fixtures are under `web/tests/`; development-only tools are under `web/tools/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: May run in parallel after its declared prerequisites because it uses different files.
- **[US#]**: Maps the task to a user story from `spec.md`.
- Tasks without a story label are shared setup, foundations, or cross-cutting gates.

---

## Phase 1: Setup and Development Tooling

**Purpose**: Establish the isolated React/TypeScript/Vite application and its test/build toolchain without changing the existing Python scaffold.

- [x] T001 Create the planned `web/src/{app,components,domain,adapters,workers,contracts,styles}` and `web/tests/{unit,contract,integration,browser,fixtures}` structure plus a minimal disposable bootstrap in `web/index.html` and `web/src/main.tsx`, without reusing any prior-repository GUI, layout, styling, or application shell
- [x] T002 Initialize the browser package with pinned React, React DOM, Vite, TypeScript, `vite-plugin-singlefile`, `hash-wasm`, `fflate`, SheetJS CE, PDF.js, and Ajv dependencies plus pinned development dependencies in `package.json` and `package-lock.json`
- [x] T003 [P] Configure strict TypeScript project references and browser/worker libraries in `tsconfig.json`, `web/tsconfig.app.json`, and `web/tsconfig.worker.json`
- [x] T004 [P] Configure ESLint and formatting rules, including prohibitions on production network APIs and unsafe dynamic evaluation, in `eslint.config.js` and `.prettierignore`
- [x] T005 Implement and execute the early go/no-go spike for direct `file://`, File System Access, Chromium/Edge, data-blind localhost/static-origin fallback, worker/WASM/schema/asset inlining, CSP, one-HTML output, and zero-network execution in `web/spikes/browser-feasibility/`, `vite.config.ts`, and `docs/feature-009-browser-feasibility.md`; stop substantive implementation if no approved production mode passes
- [x] T006 Write and obtain approval for the architecture decision covering the local-first trust boundary, single-HTML distribution, `file://` versus data-blind static origin, workspace/OPFS storage, deterministic versus operational state, browser support, security posture, dependency strategy, consequences, approving authority/date, and supersession in `docs/adr/009-local-first-evidence-intake.md`
- [x] T007 [P] Configure Vitest projects for unit, contract, worker, and integration suites in `vitest.config.ts`
- [x] T008 [P] Configure Playwright Chromium and installed Edge-channel projects, local workspace fixtures, offline request capture, and static-origin fallback in `playwright.config.ts`
- [x] T009 [P] Add repository-safe synthetic fixture-generation conventions and a real-PII prohibition in `web/tests/fixtures/README.md`
- [x] T010 Add package scripts for typecheck, lint, schema validation, unit/integration tests, browser E2E, build, single-file verification, and quality gates in `package.json`
- [x] T011 Add `dist/`, Playwright output, coverage, temporary workspace, and generated sensitive-fixture paths to `.gitignore` without weakening existing ignore rules
- [x] T012 Run and record the initial dependency, license, and browser-support review with exact pinned versions and unresolved license/security findings in `docs/feature-009-dependency-review.md`

**Checkpoint**: The browser project installs, typechecks at bootstrap, and exposes deterministic test/build commands; no production feature behavior exists yet.

---

## Phase 2: Foundational Deterministic and Local-Only Infrastructure

**Purpose**: Build the shared contracts, deterministic primitives, persistence ports, worker protocol, and security boundary that block all user-story implementation.

**Critical dependency**: Complete this phase before starting any user-story implementation.

### Contract and deterministic-core tests

- [x] T013 [P] Add positive, negative, unknown-field, reference-resolution, and version-mismatch fixtures for all seven design schemas, including de-identified-real, synthetic/mock, and evidence-acquisition/returned-extraction packages, in `web/tests/fixtures/contracts/`
- [x] T014 [P] Add failing schema and semantic-contract tests covering all prior controls plus lowercase candidateKey; single evidenceKey observation resolution; provisional-only UnresolvedItem source status; positive reopened→resolved/accepted-risk successors; invalid initial/successor linkage; quarantine ordinal-1 null and later required same-chain predecessors; initial inherit-approval linked only to a separate current-effective same-byte quarantine release; authority invalidation and renewal after classification revocation/supersession/stale hash/changed bytes; and every permitted/prohibited transition in all governed matrices in `web/tests/contract/schema-contracts.test.ts`
- [x] T015 [P] Add PBGC Case Workbench Canonicalization Profile v1 golden/property tests for recursive arrays/objects and every registered path; explicitly typed PopulationCandidate.evidence permutation invariance in every typed embedding; candidate-shaped arbitrary export objects retaining order-significant arrays with reordered hashes; genuine evidence-change propagation; RFC 8785 number vectors; canonical decimal-string vectors; repeated-run identity; and operational UUID/timestamp immunity in `web/tests/unit/domain/canonical-json.test.ts`
- [x] T016 [P] Add failing append-only JSONL tests for valid events, truncated final lines, invalid transitions, and retained prior history in `web/tests/unit/domain/audit-log.test.ts`
- [x] T017 [P] Add failing production network-boundary tests for `fetch`, XHR, WebSocket, EventSource, beacon, remote workers, service workers, and external asset URLs in `web/tests/unit/security/zero-network.test.ts`

### Contract and deterministic-core implementation

- [x] T018 Copy all approved schemas without semantic drift into `web/src/contracts/schemas/`, resolve cross-schema references offline, and add a source-to-runtime drift check in `web/tools/validate-contracts.mjs`
- [x] T019 Implement versioned Ajv validation with structured blocking and nonblocking results in `web/src/contracts/schema-validator.ts`
- [x] T020 Implement shared branded IDs, SHA-256, UTC timestamp, decimal-string, result, and exhaustive-state types in `web/src/domain/shared/types.ts`
- [x] T021 Implement recursive canonical JSON serialization and deterministic-payload hashing for manifests and acquisition request/package/proposal payloads, applying exact-path registered array rules and an order-significant fallback to every otherwise-unregistered nested array while explicitly excluding all operational metadata, in `web/src/domain/manifests/canonical-json.ts`
- [x] T022 Implement append-only audit/review/provenance event validation and JSONL encoding/decoding in `web/src/domain/lineage/audit-log.ts`
- [x] T023 [P] Define browser-independent clock, UUID, chunk-reader, workspace, hashing-worker, parser, screening, and export ports in `web/src/domain/ports.ts`
- [x] T024 [P] Define structured error, limitation, validation, unresolved-item, and partial-package outcome types in `web/src/domain/shared/outcomes.ts`
- [x] T025 Define the typed worker request/progress/result/cancellation protocol with transferable chunk support in `web/src/workers/protocol.ts`
- [x] T026 Implement the worker pool, bounded queue, cancellation, crash recovery, and deterministic result ordering in `web/src/adapters/workers/worker-pool.ts`
- [x] T027 Implement the File System Access capability gate and clearly labeled non-production fallback mode in `web/src/adapters/filesystem/capability.ts`
- [x] T028 Implement the restrictive production CSP and runtime guard that disables network/service-worker paths in `web/index.html` and `web/src/app/security-boundary.ts`
- [x] T029 Add foundational tests proving contract validation, canonical serialization, JSONL history, worker cancellation, capability gating, and zero-network guards pass in `web/tests/unit/` and `web/tests/integration/foundation.test.ts`

**Checkpoint**: Shared contracts and deterministic primitives pass without React UI or case-specific defaults, and the production runtime has no usable network adapter.

---

## Phase 3: User Story 1 — Create a Controlled Case Intake (Priority: P1)

**Goal**: Create production and explicitly designated non-production cases with immutable UUID identity, local authoritative-identifier uniqueness, and traceable collision decisions.

**Independent test**: In a synthetic empty workspace, create one production case, reject a duplicate normal creation, then record resume-existing and approved non-production decisions without changing the original UUID.

### Tests for User Story 1

- [x] T030 [P] [US1] Add failing unit tests for case UUID immutability, required production identifier, allowed purposes, and absence of case-specific defaults in `web/tests/unit/domain/case/case.test.ts`
- [x] T031 [P] [US1] Add failing unit tests for identifier collision, closed-case presentation, resume-existing linkage, and authorized non-production override history in `web/tests/unit/domain/case/case-registry.test.ts`
- [x] T032 [P] [US1] Add failing workspace integration tests for atomic `case-index.json` and `case.json` persistence and reopening in `web/tests/integration/case-workspace.test.ts`
- [x] T033 [P] [US1] Add failing browser tests for the complete case-creation and duplicate-decision journey in `web/tests/browser/case-creation.spec.ts`

### Implementation for User Story 1

- [x] T034 [P] [US1] Implement immutable Case, CasePurpose, CaseStatus, and creation-provenance models in `web/src/domain/case/case.ts`
- [x] T035 [P] [US1] Implement identifier syntax validation as a configurable non-case-specific rule in `web/src/domain/case/case-identifier.ts`
- [x] T036 [US1] Implement local authoritative-identifier uniqueness, duplicate decisions, and collision review events in `web/src/domain/case/case-registry.ts`
- [x] T037 [US1] Implement atomic local case-index and case-record persistence with read-back validation in `web/src/adapters/filesystem/case-workspace.ts`
- [x] T038 [US1] Implement the workspace gate, case form, existing-case presentation, and explicit collision-decision UI in `web/src/components/case-intake/CaseCreation.tsx`
- [x] T039 [US1] Wire the case-creation command flow and asserted reviewer identity input into `web/src/app/App.tsx` and verify T030–T033 pass

**Checkpoint**: US1 works independently and no duplicate production case can be created silently within the selected workspace catalog.

---

## Phase 4: User Story 2 — Inventory and Preserve a Case Package (Priority: P1)

**Goal**: Discover, hash, preserve, inventory, resume, and reconcile submitted files and supported containers without changing source bytes or duplicating prior durable work.

**Independent test**: Intake a mixed synthetic folder with exact duplicates, corrupt files, ZIP/GZIP containers, nested members, and an interruption; verify independent hashes, immutable originals, lineage, partial continuation, and deterministic resume.

### Fixtures and tests for User Story 2

- [x] T040 [P] [US2] Create deterministic synthetic same-bytes/different-name, same-name/different-bytes, zero-byte, Unicode-name, large-stream, corrupt, unsupported, and mutable-source fixtures in `web/tests/fixtures/generators/artifacts.ts`
- [x] T041 [P] [US2] Create deterministic ZIP/GZIP fixtures for nested members, partial corruption, traversal, absolute paths, duplicate normalized paths, excessive depth/count/ratio/expanded bytes, and unsupported compression in `web/tests/fixtures/generators/archives.ts`
- [x] T042 [P] [US2] Add failing SHA-256 tests using published vectors, independent Web Crypto checks, chunk-boundary matrices, cancellation, and simulated large files in `web/tests/unit/workers/hash-worker.test.ts`
- [x] T043 [P] [US2] Add failing content-store tests for create-once paths, post-write verification, same-hash reuse, changed stored bytes, and no silent overwrite in `web/tests/integration/content-store.test.ts`
- [x] T044 [P] [US2] Add failing snapshot/resume tests proving lowercase SHA-256 snapshot identity, separate operational `snapshotRecordId`, and correct behavior for unchanged, added, removed, renamed, changed, and mid-read-mutated artifacts in `web/tests/unit/domain/attempts/snapshot.test.ts`
- [x] T045 [P] [US2] Add failing archive tests for container-first preservation, member hashing, parent-child lineage, limits, partial extraction, and zero invented members in `web/tests/integration/archive-intake.test.ts`
- [x] T046 [P] [US2] Add failing browser tests for folder intake, worker progress, interruption, unchanged resume, changed-snapshot linkage, and partial continuation in `web/tests/browser/package-intake.spec.ts`

### Implementation for User Story 2

- [x] T047 [P] [US2] Implement ReceiptRecord, ArtifactRecord, ContentObject, PackageSnapshot, SnapshotEntry, IntakeAttempt, and ContainmentEdge models in `web/src/domain/artifacts/models.ts` and `web/src/domain/attempts/models.ts`
- [x] T048 [P] [US2] Implement fixed-chunk incremental SHA-256 and progress/cancellation handling in `web/src/workers/hash.worker.ts`
- [x] T049 [US2] Implement content-addressed `objects/sha256/<prefix>/<hash>` create-once storage, post-copy hashing, and integrity-failure quarantine signal in `web/src/adapters/filesystem/content-store.ts`
- [x] T050 [P] [US2] Implement folder/file discovery with stable submitted paths and mutation detection in `web/src/adapters/filesystem/package-discovery.ts`
- [x] T051 [US2] Implement canonical package snapshots whose identity is lowercase SHA-256, separate operational `snapshotRecordId`, snapshot comparison, linked-attempt divergence reasons, and unchanged-work reuse in `web/src/domain/attempts/snapshot.ts` and `web/src/domain/attempts/resume.ts`
- [x] T052 [US2] Implement exact-duplicate finalization strictly on matching SHA-256 while preserving separate receipts in `web/src/domain/artifacts/exact-duplicates.ts`
- [x] T053 [P] [US2] Implement archive path canonicalization and traversal/absolute/control-character/collision rejection in `web/src/adapters/parsers/archive-path.ts`
- [x] T054 [US2] Implement bounded streaming ZIP/GZIP extraction, recursion/count/ratio/size limits, partial outcomes, and member sequencing in `web/src/adapters/parsers/archive-parser.ts`
- [x] T055 [US2] Implement the artifact pipeline coordinator with durable per-stage events, unaffected-artifact continuation, and a mandatory provisional/downstream-blocked state until the US3 minimum screening and quarantine gate passes in `web/src/domain/attempts/intake-pipeline.ts`
- [x] T056 [US2] Implement intake selection, discovery preview, hashing/preservation progress, interruption, resume, and per-artifact outcome UI in `web/src/components/case-intake/PackageIntake.tsx` and `web/src/components/inventory/ArtifactInventory.tsx`
- [x] T057 [US2] Reconcile every discovered artifact exactly once using origin and accounting-only terminal categories, prove both ledgers balance while all governed records remain provisional, prove ledger categories cannot grant release/final status, verify independent hashes and containment lineage, and make T040–T046 pass in `web/src/domain/manifests/reconciliation.ts`

**Checkpoint**: US2 preserves every original and successful member, resumes unchanged snapshots deterministically, and continues around isolated artifact failures, but every output remains explicitly provisional and blocked from production downstream use until US3 screening is complete.

---

## Phase 5: User Story 3 — Screen and Quarantine Unsafe Artifacts (Priority: P1)

**Goal**: Screen locally for risky structures and sensitive content, quarantine affected artifacts only, enforce hash-bound human release/revocation, and prevent real PII or untrusted execution from leaving the device.

**Independent test**: Intake clean, macro-enabled, secret-like, authorized-PII, unauthorized-PII, and executable fixtures; verify artifact-level quarantine, clean continuation, exact-hash release inheritance, changed-hash re-screening, and zero network or execution claims.

### Fixtures and tests for User Story 3

- [x] T058 [P] [US3] Create only synthetic ephemeral authorized-PII, unauthorized-PII, excessive-PII, and secret-pattern fixtures with teardown assertions in `web/tests/fixtures/generators/sensitive-data.ts`
- [x] T059 [P] [US3] Create inert plain-text, JSON, CSV/TSV, XLSX/XLSM, DOCX, PPTX, PDF, and executable parser fixtures covering valid content, malformed/corrupt/encrypted content, macro parts, embedded objects, external relationships, formula text, PDF actions, hidden structures, encoding errors, and executable signatures in `web/tests/fixtures/generators/passive-formats.ts` and `web/tests/fixtures/generators/unsafe-binaries.ts`
- [x] T060 [P] [US3] Add failing screening-policy tests for expected PII, unauthorized PII, secrets, active content, inconclusive checks, and fail-closed disposition in `web/tests/unit/domain/quarantine/screening-policy.test.ts`
- [x] T061 [P] [US3] Add failing release and artifact-eligibility tests proving automated actors create only provisional safety states; artifact source eligibility cannot be approved; accounting categories grant no governed status; only exact-hash typed human decision-chain replay computes eligibility; and standalone/incomplete approval, missing/system decisions, stale or mismatched artifact hash, invalid/ineffective/revoked/branched/superseded prior state, changed-byte inherited eligibility, revocation of an ineffective decision, and continued final quarantine without prior linkage all fail; add a positive computed-eligibility test that leaves the artifact source unchanged in `web/tests/unit/domain/quarantine/release.test.ts`
- [x] T062 [P] [US3] Add failing mixed-package integration tests proving quarantine does not abort unaffected intake and derivatives remain blocked in `web/tests/integration/quarantine-pipeline.test.ts`
- [x] T063 [P] [US3] Add failing privacy and export-contract tests proving real PII remains local, production has no outbound path or external-LLM client, local create/validate/import/store works, de-identified-real and synthetic/mock packages validate separately, raw direct/indirect identifiers and non-allowlisted fields are rejected, every retained generalized quasi-field has transformation/justification/residual-risk/validation evidence, and human export approval rejects system actors and mismatched payload hashes in `web/tests/integration/privacy-boundary.test.ts`
- [x] T064 [P] [US3] Add failing passive-parser tests for plain text, JSON, CSV/TSV, spreadsheets, PDF, DOCX, and PPTX covering extracted text/metadata, raw values, limitations, unsupported/encrypted/corrupt fail-closed results, and proof that formulas, macros, embedded scripts, links, and binaries are never executed or declared safe in `web/tests/integration/passive-inspection.test.ts`
- [x] T065 [P] [US3] Add failing browser tests for clearly distinct accounting, provisional-security, and human-final terminology; block cause/evidence/reviewer/next-action guidance; quarantine queue, release, inherited release, changed-hash re-screening, revocation, and partial-package status in `web/tests/browser/quarantine-review.spec.ts`

### Implementation for User Story 3

- [x] T066 [P] [US3] Implement separate accounting classifications, proposal-only artifact eligibility, ScreeningResult/Finding provisional safety states, and human-only QuarantineDecision records with deterministic decision-content hash, appendOrdinal/predecessor linkage, and a non-mutating computed effective-eligibility projection in `web/src/domain/quarantine/models.ts`
- [x] T067 [P] [US3] Implement versioned deterministic secret and PII pattern screening with expected/unauthorized/excessive/unverifiable distinctions in `web/src/adapters/screening/sensitive-data.ts`
- [x] T068 [P] [US3] Implement byte-signature, extension mismatch, executable, script-capable, and unsupported/encrypted-content screening in `web/src/adapters/screening/binary-risk.ts`
- [x] T069 [P] [US3] Implement passive DOCX/PPTX text/metadata and XLSX/XLSM sheet/stored-value/formula-text extraction plus OOXML screening for macros, embeddings, external relationships, hidden structures, and formula-text presence without executing formulas, macros, scripts, links, or embedded code in `web/src/adapters/parsers/ooxml-parser.ts`, `web/src/adapters/parsers/workbook-parser.ts`, and `web/src/adapters/screening/ooxml-risk.ts`
- [x] T070 [P] [US3] Implement passive PDF text/metadata, plain-text, JSON, and streaming CSV/TSV extraction with raw-value preservation and structured screening for actions, JavaScript, attachments, links, encoding/structure failures, encryption, corruption, and parser limitations without execution in `web/src/adapters/parsers/pdf-parser.ts`, `web/src/adapters/parsers/text-parser.ts`, `web/src/adapters/parsers/json-parser.ts`, `web/src/adapters/parsers/delimited-parser.ts`, and `web/src/adapters/screening/pdf-risk.ts`
- [x] T071 [US3] Implement screening orchestration, explicit inconclusive/unsupported outcomes, automated `screening-pending`/`rescreen-required`/`provisional-quarantine`/`provisional-safety-block` states, proposal-only re-screening, and derivative gates without any path from accounting or automated state to final disposition in `web/src/domain/quarantine/screening-service.ts`
- [x] T072 [US3] Implement timestamp-independent typed human replay to final governed states, requiring current effective same-hash prior decision ID/content hash for revoke/inherit/supersede/continued-final-quarantine, exact-byte inherited release, changed-byte independent lifecycle, immutable artifact source state, and semantic rejection of orphan/system/stale/mismatched/branched/ineffective prior links in `web/src/domain/quarantine/release-service.ts`
- [x] T073 [US3] Implement the seven-schema-aligned local de-identification package builder/importer/store validator for de-identified-real and synthetic/mock modes, deterministic payload hashing, provenance, exact-payload-hash human approval, raw direct/indirect identifier blocking, generalized quasi-field evidence validation, unnecessary-field rejection, unresolved findings, and zero transmission/external-LLM clients in `web/src/domain/exports/deidentification-gate.ts`
- [x] T074 [US3] Implement non-visual-design-prescriptive status content that labels accounting, provisional security, and human-final decisions distinctly and shows block cause, evidence/review required, and next action alongside reviewer rationale, release, and revocation controls in `web/src/components/quarantine/QuarantineQueue.tsx`
- [x] T075 [US3] Integrate screening before passive extraction, enforce zero network/execution behavior, and make T058–T065 pass in `web/src/domain/attempts/intake-pipeline.ts`

**Checkpoint — recommended MVP**: Phases 1–5 provide the minimum safe production intake slice: controlled case creation, immutable inventory, deterministic hashing/resume, and artifact-level quarantine with local-only PII handling.

---

## Phase 6: User Story 4 — Classify Evidence and Propose Relationships (Priority: P2)

**Goal**: Produce deterministic, evidenced classification/date/relationship proposals while reserving all production authority decisions for authorized humans.

**Independent test**: Process similar plan-related synthetic documents, verify all automated results remain proposed at every confidence, then approve/reject/reclassify with complete history and traceable same-hash reuse.

### Tests for User Story 4

- [x] T076 [P] [US4] Create synthetic classification, conflicting-date, near-duplicate, amendment-like, and relationship fixtures in `web/tests/fixtures/generators/classification.ts`
- [x] T077 [P] [US4] Add failing classification and authority tests for immutable proposal-only category/source-role records, rejection of final proposal status, timestamp-independent human replay, and a positive computed projection without proposal mutation; separately test AuthorityDecision exact proposal/approval/artifact linkage plus automatic authority invalidation when its classification approval is revoked, superseded, ineffective, stale, or byte-mismatched, and require a new typed authority decision with current lineage for renewal in `web/tests/unit/domain/classification/classification.test.ts` and `web/tests/unit/domain/classification/authority-decision.test.ts`
- [x] T078 [P] [US4] Add failing relationship tests for exact versus near duplicates and proposed authority, amendment, supersession, replacement, conflict, and effective-period source states; reject final values in proposal status, orphan/system/missing/wrong-type/wrong-subject/wrong-target/stale-content-hash/ineffective/revoked/branched/superseded chains and incomplete manifests; and add a positive test deriving approved status from a valid effective typed human-decision chain without mutating the proposal in `web/tests/unit/domain/classification/relationships.test.ts`
- [x] T079 [P] [US4] Add failing date-candidate tests preserving raw values, source locators, competing values, and human-selected status in `web/tests/unit/domain/classification/date-candidates.test.ts`
- [x] T080 [P] [US4] Add failing browser tests for classification triage, relationship review, rationale, rejection, reclassification, and approval history in `web/tests/browser/classification-review.spec.ts`

### Implementation for User Story 4

- [x] T081 [P] [US4] Implement immutable proposal-only ClassificationProposal and EvidenceRelationship, DateCandidate, typed append-only ClassificationApproval/RelationshipDecision chains, and computed effective-status projection models with visible decision provenance in `web/src/domain/classification/models.ts`
- [x] T082 [P] [US4] Implement deterministic category and source-role proposal rules with versioned evidence and confidence in `web/src/domain/classification/classifier.ts`
- [x] T083 [P] [US4] Implement normalized-text hashing and token-shingle similarity proposals without exact-duplicate finalization in `web/src/domain/classification/near-duplicates.ts`
- [x] T084 [P] [US4] Implement raw and normalized date-candidate extraction with explicit convention, validation, source locator, and unresolved conflict retention in `web/src/domain/classification/date-candidates.ts`
- [x] T085 [US4] Implement directional proposal-only relationship records and timestamp-independent computed status from gapless same-subject typed human-decision replay, rejecting orphan/system/missing/wrong-type/subject/target/hash/ineffective/branched/revoked/superseded/incomplete chains; implement the separate AuthorityDecision that resolves source-role proposal and classification approval, verifies all artifact SHA-256 values, requires a human approver, and preserves revocation/supersession lineage without mutating proposals or allowing classification approval to confer authority in `web/src/domain/classification/relationship-service.ts` and `web/src/domain/classification/authority-decision.ts`
- [x] T086 [US4] Implement authorized classification approval/rejection/revocation/supersession through gapless same-proposal typed decision replay, traceable same-hash approved-classification reuse, immutable proposal evidence, and computed UI status provenance while requiring AuthorityDecision for authoritative downstream use in `web/src/domain/classification/classification-review.ts`
- [x] T087 [US4] Implement classification proposal and date-candidate review UI in `web/src/components/review/ClassificationReview.tsx`
- [x] T088 [US4] Implement relationship evidence and immutable proposal UI plus a computed effective-status projection with visible typed-decision provenance in `web/src/components/review/RelationshipReview.tsx`
- [x] T089 [US4] Gate production downstream views to human-approved classifications/relationships and a separate active exact-hash AuthorityDecision wherever authority is required, then make T076–T080 pass in `web/src/domain/classification/production-gate.ts`

**Checkpoint**: US4 works independently over inventoried artifacts; no automated classification or non-exact relationship becomes authoritative.

---

## Phase 7: User Story 5 — Detect and Normalize Population Files (Priority: P2)

**Goal**: Detect and structurally profile likely population files while preserving every observed value and keeping ambiguous candidates unresolved.

**Independent test**: Process synthetic CSV/XLSX populations containing blanks, missing fields, malformed values, formulas, leading zeros, and literal zeros; verify distinct raw states, proposal-only detection, exact lineage, and no correction or imputation.

### Fixtures and tests for User Story 5

- [x] T090 [P] [US5] Create synthetic CSV/TSV/XLSX population fixtures covering blanks, missing columns, malformed values, formulas, leading zeros, mixed types, hidden sheets, repeated headers, and literal zeros in `web/tests/fixtures/generators/populations.ts`
- [x] T091 [P] [US5] Add failing population-adapter tests proving the shared plain-text, JSON, CSV, and TSV parser outputs preserve encoding, structural validity, row width, raw values, corruption findings, and fail-closed limitations when consumed for profiling in `web/tests/unit/domain/population/tabular-adapter.test.ts`
- [x] T092 [P] [US5] Add failing population-adapter tests proving shared workbook-parser outputs preserve sheets, stored cell values, formula text, hidden content, and zero formula execution when consumed for profiling in `web/tests/unit/domain/population/workbook-adapter.test.ts`
- [x] T093 [P] [US5] Add population tests for explicitly typed, path-independent evidence permutation invariance of candidate bytes/key and manifest bytes/hash; genuine evidence-change propagation; exact manifest-local resolution by the single evidenceKey; missing/zero/multiple/duplicate evidenceKey or citation IDs; artifact/locator/kind/value mismatch; changed observation, stale evidenceKey, incomplete manifest, malformed candidateKey forms; and full PopulationCandidateDecision replay without source mutation in `web/tests/unit/domain/population/population-detector.test.ts`
- [x] T094 [P] [US5] Add failing no-imputation property tests proving missing, blank, malformed, formula, leading-zero, and numeric-zero values remain distinguishable in `web/tests/unit/domain/population/raw-values.test.ts`
- [x] T095 [P] [US5] Add failing development-only mock-population tests proving field-structure use, synthetic values, deterministic seeds, provenance, and zero copied real values in `web/tests/integration/mock-population.test.ts`
- [x] T096 [P] [US5] Add failing browser tests for population candidate review, structural profile, unresolved routing, and local-only handling in `web/tests/browser/population-review.spec.ts`

### Implementation for User Story 5

- [x] T097 [P] [US5] Implement population-specific adapters over the completed T070 plain-text, JSON, CSV, and TSV parser outputs without reparsing or changing raw values in `web/src/domain/population/tabular-adapter.ts`
- [x] T098 [P] [US5] Implement the population-specific adapter over the completed T069 workbook parser output without calculation, correction, or imputation in `web/src/domain/population/workbook-adapter.ts`
- [x] T099 [US5] Implement proposal-only PopulationCandidateProfile with intrinsic evidence-set canonicalization wherever explicitly typed, PBGC Case Workbench Canonicalization Profile v1 evidenceKey/candidateKey construction, single-key typed manifest-local populationEvidenceObservation resolution, shared lowercase SHA validation, full PopulationCandidateDecision replay, raw-value preservation, and fail-closed incomplete/stale identity handling in `web/src/domain/population/population-profile.ts` and `web/src/domain/population/population-detector.ts`
- [x] T100 [US5] Implement the population structural-profile and human-review UI in `web/src/components/review/PopulationReview.tsx`
- [x] T101 [US5] Implement the development-only PBGC mock-population adapter and provenance record, isolated from production bundles, in `web/tools/mock-population/generate.ts` and `web/tools/mock-population/README.md`, then make T090–T096 pass

**Checkpoint**: US5 profiles likely populations without entitlement interpretation, correction, imputation, external transmission, or silent approval.

---

## Phase 8: User Story 6 — Produce Auditable Normalized Outputs (Priority: P2)

**Goal**: Export schema-valid, deterministic manifests and normalized evidence with complete lineage, validation, unresolved items, reconciliation totals, and separately identified operational metadata.

**Independent test**: Run the same immutable package and approved state twice and verify byte-identical deterministic payloads while tracing any value or decision to source hash, locator, attempt, and history.

### Tests for User Story 6

- [x] T102 [P] [US6] Add normalization/acquisition tests for the named project canonicalization profile, RFC 8785 number vectors, exact decimals, UUID/timestamp-immune hashes, and exhaustive transitions—including unresolved initial decisions and valid reopened→resolved/accepted-risk successors, quarantine same-chain predecessor rules, gaps, branches, cycles, broken/stale predecessors, wrong subjects, ineffective supersession, and timestamp disorder—in `web/tests/unit/domain/normalization/normalized-evidence.test.ts` and `web/tests/unit/domain/acquisition/evidence-acquisition.test.ts`
- [x] T103 [P] [US6] Add manifest tests for all prior accounting/governance controls plus deterministic population observation registry ordering/hash participation and exact resolution by evidenceKey; typed-candidate evidence permutation invariance; arbitrary candidate-shaped export array order significance; artifact inherit-approval from a separate effective same-byte quarantine release with UUID-only invariance; authority invalidation/renewal; provisional-only unresolved sources; and rejection of missing/stale/malformed/mismatched linkage, final source-state claims, incomplete manifests, or changed-byte inheritance in `web/tests/unit/domain/manifests/evidence-manifest.test.ts`
- [x] T104 [P] [US6] Add failing lineage tests for exact request → package → proposal → ordinal decision → promoted-fact paths and rejection of invalid JSON Pointer, missing/ambiguous fact key, fact-content hash mismatch, citation/artifact mismatch, cross-proposal or revoked approval, conflicting duplicate fact promotion, orphan proposals, broken rerun links, unresolved endpoints, and duplicate node/edge IDs in `web/tests/unit/domain/lineage/lineage-graph.test.ts`
- [x] T105 [P] [US6] Add failing repeatability integration tests requiring byte-identical deterministic exports for identical inputs/rules/approved state and explicit run-metadata differences in `web/tests/integration/deterministic-export.test.ts`
- [x] T106 [P] [US6] Add failing export/acquisition boundary tests proving quarantined, unapproved, unresolved, and automated extraction proposals remain blocked; local package create/validate/import/store performs zero transmission or external-LLM calls; source-priority recommendations confer no authority; and no unsupported execution, interpretation, calculation, or report claim appears in `web/tests/integration/export-boundaries.test.ts`
- [x] T107 [P] [US6] Add failing browser tests for manifest, normalized evidence, validation, unresolved queue, and one-view lineage export in `web/tests/browser/manifest-export.spec.ts`

### Implementation for User Story 6

- [x] T108 [P] [US6] Implement normalization models plus deterministic acquisition payloads, contract-registered array semantics, separate operational metadata, append-ordinal ProposalDecisionRecord, exact fact-pointer/hash/citation promoted-fact models, and typed lineage nodes in `web/src/domain/normalization/models.ts` and `web/src/domain/acquisition/models.ts`
- [x] T109 [P] [US6] Implement provisional-only UnresolvedItem sources plus computed typed-decision projections supporting valid reopened successors, and the reusable missing-fact, candidate-source, recommendation-only priority, extraction-schema/instruction, and rerun-trigger registry in `web/src/domain/review/unresolved-items.ts` and `web/src/domain/acquisition/registry.ts`
- [x] T110 [US6] Implement PBGC Case Workbench Canonicalization Profile v1, using RFC 8785 only for number serialization, canonical decimal strings, explicitly typed intrinsic arrays before exact-path/fallback rules, ascending priorities, exact citations, UUID-free hashes, and complete per-family replay in `web/src/domain/normalization/normalizer.ts` and `web/src/domain/acquisition/proposal-validator.ts`
- [x] T111 [US6] Implement EvidenceManifest assembly with typed populationEvidenceObservations keyed solely by evidenceKey, exact one-to-one citation/artifact/locator/kind/value resolution, explicitly typed candidate evidence ordering, path-independent candidate keys, provisional-only sources, operational typed decisions/promoted facts, authority dependency invalidation, complete replay, accounting-only ledgers, and schema/semantic validation in `web/src/domain/manifests/evidence-manifest.ts`
- [x] T112 [US6] Implement complete lineage with node-specific deterministic content hashes, exact fact pointer/value hash/citation/approval/target validation, uniqueness/orphan/rerun checks, conflicting-promotion rejection, and bounded trace queries in `web/src/domain/lineage/lineage-graph.ts`
- [x] T113 [US6] Implement atomic local JSON/JSONL export/import/storage for manifests and acquisition/extraction packages with read-back hash verification, version preservation, `local-only-no-transmission` enforcement, and no network adapter in `web/src/adapters/exports/workspace-export.ts` and `web/src/adapters/exports/acquisition-package.ts`
- [x] T114 [US6] Implement manifest summary, validation/unresolved queues, lineage explorer, and export controls whose terminology distinguishes accounting classifications, provisional blocks, and final human decisions and explains every block's cause, required review/evidence, and next action in `web/src/components/lineage/LineageExplorer.tsx` and `web/src/components/inventory/ManifestExport.tsx`
- [x] T115 [US6] Reprocess the golden corpus twice, compare deterministic bytes, resolve and validate all seven contracts offline, and make T102–T107 pass in `web/tests/integration/full-intake.test.ts`

**Checkpoint**: All six stories produce controlled, reproducible evidence outputs suitable for later separately specified downstream capabilities.

---

## Phase 9: Production Hardening, Documentation, and Quality Gates

**Purpose**: Verify the complete bounded feature, single-HTML deployment, performance target, security boundary, and constitutional compliance.

- [x] T116 [P] Add the full synthetic acceptance corpus generator for at least 100 mixed artifacts and a scalable 1,000-artifact/10-GB sparse or generated corpus with independent hashes in `web/tests/fixtures/generators/acceptance-corpus.ts`
- [x] T117 [P] Add Chromium and Edge workspace-selection, permission-denial/revocation, local reopen, and unsupported-browser non-production-mode tests in `web/tests/browser/workspace-capabilities.spec.ts`
- [x] T118 [P] Add nested-archive, large-file worker responsiveness, interrupted/resumed intake, quarantine/release, classification review, and manifest-export E2E coverage in `web/tests/browser/end-to-end-intake.spec.ts`
- [x] T119 [P] Add direct `file://` acceptance checks where supported and an approved localhost/static-origin fallback test with no server-side data path in `web/tests/browser/delivery-modes.spec.ts`
- [x] T120 Implement the build verifier that fails unless `dist/` contains only `pbgc-caseworkbench.html`, all runtime assets/workers/WASM are inlined, CSP is restrictive, no service worker exists, and no external URL is referenced in `web/tools/verify-single-html.mjs`
- [x] T121 Run the complete offline single-HTML flow with outbound requests blocked and assert zero production network requests or uncaught console errors in `web/tests/browser/single-html-offline.spec.ts`
- [x] T122 Run and document the 1,000-artifact/10-GB acceptance benchmark, including browser/OS/hardware, elapsed time, UI responsiveness, and limitations, in `docs/feature-009-performance-results.md`
- [x] T123 [P] Document production workspace selection, backups, local PII handling, quarantine limitations, recovery, static-origin fallback, keyboard operation, and built-in help in `docs/feature-009-operator-guide.md` and `web/tests/browser/accessibility.spec.ts`
- [ ] T124 Conduct the SC-010 usability protocol after T123 with at least 20 authorized caseworkers, no task-specific coaching after start, all four required first-attempt tasks, a 19-of-20 success threshold, and anonymized retained evidence in `docs/feature-009-usability-results.md`
- [x] T125 [P] Document supported/unsupported formats, passive-inspection limitations, and the explicit absence of antivirus/Office execution claims in `docs/feature-009-format-support.md`
- [x] T126 Run `npm run typecheck`, `npm run lint`, `npm test`, schema validation, integration tests, and `npm run test:browser:e2e`; record only actually executed results in `docs/feature-009-validation-report.md`
- [x] T127 Run dependency vulnerability and license review against the pinned lockfile, resolve release-blocking findings, and update `docs/feature-009-dependency-review.md`
- [x] T128 Run the production build and build-size review, document total/inlined dependency sizes and approved exceptions in `docs/feature-009-build-review.md`
- [x] T129 Run `git diff --check`, scan staged/untracked content for secrets, credentials, real PII, raw case evidence, caches, and temporary artifacts, and record the release result in `docs/feature-009-validation-report.md`
- [x] T130 Complete the constitution compliance review against every Feature 009 prohibition and evidence-maturity claim, recording pass/fail evidence and unresolved blockers in `docs/feature-009-constitution-review.md`

**Final checkpoint**: All quality gates pass with recorded evidence; no deferred enterprise capability, actuarial logic, plan interpretation, V1 generation, benefit determination, backend, cloud dependency, or real-PII LLM path has entered scope.

---

## Dependencies and Execution Order

### Phase dependencies

- **Phase 1 — Setup**: Starts immediately. T005 depends on T001–T004. T006 depends on T005 and is a go/no-go approval gate. T007–T012 may be prepared in parallel where safe, but Phase 2 and all substantive implementation are blocked until T006 is approved. T010 depends on T002 and T007–T008.
- **Phase 2 — Foundations**: Depends on Phase 1. Tests T013–T017 may be authored in parallel; T018–T028 implement them; T029 closes the phase and blocks all stories.
- **Phase 3 — US1**: Depends on T029. It establishes the Case needed by every subsequent intake story.
- **Phase 4 — US2**: Depends on US1 and T029 because artifacts and attempts belong to a Case.
- **Phase 5 — US3**: Depends on US2's artifact pipeline and content identity; it implements and tests all shared passive parsers before classification or population profiling. This completes the recommended MVP.
- **Phase 6 — US4**: Depends on T069–T070 and completion of US3, so every content-dependent classifier receives only screened shared-parser output; it does not depend on US5.
- **Phase 7 — US5**: Depends on T069–T070 and completion of US3, then adds population-specific adapters; it may proceed in parallel with US4.
- **Phase 8 — US6**: Depends on US1–US5 because it consolidates all entity, review, validation, and lineage outputs.
- **Phase 9 — Hardening**: Depends on the stories included in the intended release; the full production gate depends on US1–US6.

### User-story dependency graph

```text
Setup → Foundations → US1 → US2 → US3 ─┬→ US4 ─┐
                                       └→ US5 ─┴→ US6 → Production gates
```

### Critical path

`T001–T005 → T006 ADR approval → T007–T012 → T013–T029 → T030–T039 → T040–T057 provisional-only → T058–T075 minimum production gate → (T076–T089 and T090–T101) → T102–T115 → T116–T130`

The critical path prioritizes all P1 safety boundaries before review automation. US4 and US5 can run concurrently after US3; US6 and final gates follow both.

---

## Parallel Execution Examples

### Setup and foundations

- Run T003, T004, T007, T008, and T009 in parallel after T002.
- Author T013–T017 in parallel; implement T023–T025 in parallel once shared types are agreed.

### US1

- Author T030–T033 in parallel.
- Implement T034 and T035 in parallel before T036.

### US2

- Generate fixtures T040–T041 and author T042–T046 in parallel.
- Implement T048 and T050 in parallel; implement T053 alongside artifact/snapshot models.

### US3

- Generate T058–T059 and author T060–T065 in parallel.
- Implement screeners and shared passive parsers T067–T070 in parallel after T066; T075 must integrate them before US4 or US5 begins.

### US4 and US5

- After US3, the entire US4 and US5 phases may be assigned concurrently.
- Within US4, T082–T084 are parallel over completed shared-parser outputs; within US5, T097–T098 are parallel adapters over T070 and T069 respectively.

### US6 and hardening

- Author T102–T107 in parallel.
- After functional completion, T116–T119, T123, and T125 may run in parallel; T124 depends on the completed T123 operator guide, and execution/report gates T126–T130 remain ordered by evidence availability.

---

## Recommended Minimum Viable Implementation Sequence

1. Complete Phase 1 and Phase 2.
2. Complete US1 and prove production identifier collision handling.
3. Complete US2 and prove immutable preservation, hashes, containers, snapshots, and deterministic resume.
4. Complete US3 and prove artifact-level quarantine, local-only PII, zero network, and hash-bound release.
5. Run the applicable parts of T116–T121, T126–T130 for the P1 slice.
6. Stop and obtain human acceptance before adding P2 classification, population, and consolidated-output stories.

This MVP is intentionally all P1 stories. US1 alone is not a production-safe evidence intake capability.

---

## Deferred and Optional Work — Excluded from Initial Implementation

The following items are not tasks in T001–T130 and require separate approved specifications or ADRs:

- OCR, handwriting recognition, and scan-to-text authority claims.
- Legacy binary DOC/XLS/PPT, TAR, RAR, 7z, password cracking, or encrypted-file decryption.
- Authoritative antivirus, cloud scanning, or remote evidence conversion.
- Server, database, cloud storage, shared enterprise catalog, cross-device uniqueness, or synchronization.
- Cryptographically signed reviewer identity and enterprise authentication.
- External LLM processing inside the production runtime or any transmission of real participant PII.
- Plan-rule interpretation, benefit/entitlement/guarantee calculations, actuarial liabilities, formula compilation, workbook generation, or V1 generation.

---

## Requirement and Acceptance Coverage Index

| Requirement group | Architecture/data/contract locus                                                                                                                      | Implementation tasks            | Test or gate tasks                           |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| FR-001–FR-007     | Case, workspace, attempt, actor/status contracts                                                                                                      | T034–T039                       | T030–T033                                    |
| FR-008–FR-015     | Artifact, receipt, content store, exact duplicate                                                                                                     | T047–T057                       | T040,T042–T046                               |
| FR-015A–FR-015D   | ContainmentEdge, failed-member observation, extraction contract                                                                                       | T053–T057                       | T041,T045–T046                               |
| FR-016–FR-016E    | Classification proposal/approval contracts                                                                                                            | T081–T089                       | T076–T080                                    |
| FR-017–FR-017B    | Source-role proposal and separate AuthorityDecision                                                                                                   | T082,T085–T089                  | T077,T080                                    |
| FR-018–FR-023     | Date candidates, relationships, relationship decisions                                                                                                | T083–T089                       | T078–T080                                    |
| FR-024–FR-031     | Typed screening, validation, quarantine, and passive parsers                                                                                          | T066–T075                       | T058–T065                                    |
| FR-031A–FR-031E   | Local-only PII, zero network/client, local de-identification/mock package contract                                                                    | T018,T028,T073,T075,T101,T113   | T013–T014,T017,T058,T063,T095,T106,T121,T129 |
| FR-032–FR-036     | Shared passive parsers plus population candidate/raw-value adapters                                                                                   | T069–T070,T097–T101             | T059,T064,T090–T096                          |
| FR-037–FR-037C    | Canonical deterministic payload, path-specific array semantics, and separate operational metadata                                                     | T018–T022,T108–T115             | T013–T015,T102–T107,T115                     |
| FR-038–FR-041     | Extraction, normalization, reviews, validation, and UX status semantics                                                                               | T069–T075,T081–T089,T097–T114   | T059–T065,T076–T080,T090–T107                |
| FR-041A–FR-044    | Blocking-state explanations, unresolved and partial outcomes                                                                                          | T074,T087–T088,T100,T109,T114   | T065,T080,T096,T107                          |
| FR-045–FR-045E    | SHA-256 snapshot identity and linked resume                                                                                                           | T047,T051,T055                  | T044,T046,T105,T118                          |
| FR-046–FR-049     | Deterministic regeneration, reconciliation, lineage                                                                                                   | T110–T115                       | T103–T107,T115–T118                          |
| FR-050            | Explicit downstream exclusions                                                                                                                        | No prohibited production module | T106,T121,T126,T130                          |
| FR-051–FR-051K    | Deterministic acquisition payloads, operational separation, append-only decisions, manifest lineage, local package I/O, approval gate, rerun metadata | T018,T021,T023,T108–T115        | T013–T015,T102–T107,T115,T121,T130           |

| Success criterion | Test or quality-gate tasks                             |
| ----------------- | ------------------------------------------------------ |
| SC-001            | T057,T116                                              |
| SC-002            | T042,T043,T116                                         |
| SC-003            | T040,T042,T052                                         |
| SC-004            | T031,T033,T036                                         |
| SC-005            | T060,T062,T065,T071                                    |
| SC-006            | T061,T077–T080,T085                                    |
| SC-007            | T015,T103,T105,T115                                    |
| SC-008            | T090–T095,T099                                         |
| SC-009            | T104,T107,T112,T114                                    |
| SC-010            | T123–T124                                              |
| SC-011            | T116,T118,T122                                         |
| SC-012            | T064,T106,T121,T126                                    |
| SC-013            | T058,T063,T073,T121,T129                               |
| SC-014            | T041,T045,T054,T057,T118                               |
| SC-015            | T061,T062,T065,T072                                    |
| SC-016            | T044,T046,T051,T105,T118                               |
| SC-017            | T077,T080,T086,T089                                    |
| SC-018            | T013–T014,T102,T104,T106,T108–T110,T113,T115,T121,T130 |

---

## Task Format and Scope Validation

- Every executable task uses `- [ ] T### [P?] [US#?]` and names an exact target path.
- Story tasks carry their required `[US#]` label; setup, foundation, and hardening tasks intentionally do not.
- `[P]` appears only where the task can proceed in a separate file after its declared phase prerequisites.
- Tests precede implementation within every story and cover the clarified constitutional boundaries.
- Production code, tests, fixtures, contracts, documentation, and development-only tooling use separate paths.
- No task authorizes a backend, cloud dependency, real-PII external LLM use, actuarial calculation, plan interpretation, benefit determination, or V1 generation.
