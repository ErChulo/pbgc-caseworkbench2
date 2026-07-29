# Tasks: Governed V1 Build Specification

**Input**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, Feature004 governed architecture, Feature006 compiler contract

## Phase 1: Setup and Contracts

- [x] T001 Verify `web/src/domain/build-spec/` and unit-test structure
- [x] T002 Harden Draft 2020-12 BuildSpec schema to require `2.0.0`
- [x] T003 Verify schema registration in design/runtime validation tools
- [x] T004 Mirror approved BuildSpec schema byte-for-byte to runtime contracts
- [x] T005 Add v2 acceptance and v1/missing-governance contract tests

## Phase 2: Core Types and Models

- [x] T006 Define BuildSpecV2, governance, provenance, range, mapping, ordering, validation, and operational envelope types
- [x] T007 Test the v2-only public model version

## Phase 3: Formula Definition Generator

- [x] T008 Implement deterministic collision-safe formula identities from exact scenario/cell identity
- [x] T009 Generate formulas only from observed nonempty O/B formula cells
- [x] T010 Extract dependencies only from `architecture.formulaDependencies`
- [x] T011 Test exact dependencies, collision resistance, observed formulas, and missing governance

## Phase 4: Named Range Builder

- [x] T012 Generate ranges only from architecture named ranges
- [x] T013 Validate case-insensitive identity uniqueness by exact scope
- [x] T014 Preserve exact workbook/sheet scope, target, name, and nullable generic field
- [x] T015 Test exact range preservation and no invented ranges

## Phase 5: Cell Mapping Generator

- [x] T016 Generate deterministic exact per-cell/per-run mappings
- [x] T017 Preserve every I/O/B classification without CALC reinterpretation
- [x] T018 Generate input sources only from exact population source tabs and retain both sides of B
- [x] T019 Test deterministic mappings, I/O/B preservation, and B dual mapping

## Phase 6: Execution Order Calculator

- [x] T020 Implement deterministic Kahn topological ordering
- [x] T021 Implement stable cycle-node reporting
- [x] T022 Implement deterministic level count and maximum depth
- [x] T023 Test acyclic ordering/depth and cycles

## Phase 7: Validation Engine

- [x] T024 Validate observed O/B formula completeness
- [x] T025 Validate named-range, formula, and mapping uniqueness
- [x] T026 Validate dependencies, exact mappings, data sources, and provenance
- [x] T027 Validate execution completeness, ordering, and acyclicity
- [x] T028 Test aggregated fail-closed validation

## Phase 8: Deterministic Serialization

- [x] T029 Canonicalize deterministic BuildSpec payload with stable sorting
- [x] T030 Compute canonical SHA-256 excluding self-hash/operational event metadata
- [x] T031 Export only schema/validation/hash-valid v2 with injected operational metadata
- [x] T032 Import only schema/hash-valid v2 with injected operational metadata
- [x] T033 Test determinism, round-trip, schema failure, and tamper detection

## Phase 9: Build Spec Engine

- [x] T034 Orchestrate architecture authentication, governance resolution, mapping, ordering, validation, schema, and hash
- [x] T035 Aggregate and deterministically sort architecture/governance/build errors
- [x] T036 Add synthetic governed Feature004-to-Feature006 `compileBuildSpec` integration test

## Phase 10: Quality Gate

- [x] T037 Run typecheck, lint, and format checks
- [x] T038 Run design schema validation (16 schemas)
- [x] T039 Run runtime contract validation (16 schemas)
- [x] T040 Run focused and full automated test suites after review remediation
- [x] T041 Run deterministic payload/hash and compiler handoff regressions
- [x] T042 Update Feature005 documentation and `AGENTS.md` SPECKIT marker

## Review Remediation

- [x] T043 Reuse Feature004 governed-record replay for BuildSpec architecture re-authentication
- [x] T044 Replace formula approval flags/identifiers with hash-bound approval decision chains
- [x] T045 Preserve complete plan-rule provenance and architecture lineage in BuildSpec v2
- [x] T046 Add recomputed-forgery, tampered, revoked, stale-source, and authority rejection tests
- [x] T047 Verify automated test completion; document independent-validation scope
- [x] T048 Align source/runtime schema requiredness and nullable named-range fields with TypeScript and Feature006
- [x] T049 Recompute transfer semantics and execution metadata; reject rehashed semantic and embedded-validation tampering
- [x] T050 Report SCC cycle members separately from downstream blocked formulas and enforce canonical in-grid A1 cells
- [x] T051 Bind BuildSpec identity/content to architecture identity/content and codepoint-canonicalize set-like governance inputs
- [x] T052 Add schema omission, reordered input, grid bound, SCC downstream, tampered/rehashed import, and compiler-handoff regressions

Full quality was attempted twice on 2026-07-29. All Feature005 tests and all non-performance checks passed; the parallel full suite remained blocked only by the pre-existing Formula Compiler 1,000-formula wall-clock test (1.321s and 1.189s against 1.000s). The complete 689-test suite then passed with one worker, including the same benchmark at 0.864s. T047 is complete at maturity level "Tested" (Constitution §13 level 3). Independent validation (level 4) and human approval (level 6) are deferred to the approval stage. No independent-validation, external-execution, or human-approval claim is made.

## Dependencies

Architecture authentication and governance resolution precede trusted generation. Formula mapping precedes exact cell formula links and execution ordering. Validation precedes hashing. Generation, export, and import each validate the v2 contract and fail closed.
