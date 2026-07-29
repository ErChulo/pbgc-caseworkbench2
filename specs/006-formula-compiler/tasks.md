# Tasks: Formula Compiler

**Input**: Design documents from `specs/006-formula-compiler/`
**Tests**: Required by the specification and constitution. Tests precede implementation within each story.

## Phase 1: Setup and Contracts

- [x] T001 Extend BuildSpec types with versioned formula provenance in `web/src/domain/build-spec/models.ts`
- [x] T002 Extend the approved and runtime BuildSpec contracts for version `2.0.0` provenance in `specs/005-v1-build-spec/contracts/build-spec.schema.json` and `web/src/contracts/schemas/build-spec.schema.json`
- [x] T003 Record the complete compiler architecture decision in `docs/decisions/ADR-0001-v1-compiler-architecture.md`
- [x] T004 Create the compiled artifact contract in `specs/006-formula-compiler/contracts/compiled-formula-artifact.schema.json`
- [x] T005 Mirror the compiled artifact contract byte-for-byte in `web/src/contracts/schemas/compiled-formula-artifact.schema.json`
- [x] T006 Register Feature 006 in `web/tools/validate-design-schemas.mjs`, `web/tools/validate-contracts.mjs`, and `web/src/contracts/schema-validator.ts`
- [x] T007 Register compiled-artifact array semantics in `web/src/domain/manifests/canonical-json.ts`
- [x] T008 Add compiled-artifact contract and byte-equivalence tests in `web/tests/contract/compiled-formula-artifact.test.ts`
- [x] T009 Add concept-separation contract tests for `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata in `web/tests/contract/compiled-formula-artifact.test.ts`

**Checkpoint**: BuildSpec v1 remains valid for historical data, BuildSpec v2 provenance is representable, and the ninth design/runtime contract validates offline.

## Phase 2: Foundational Compiler Model

- [x] T010 Define compiler policy, AST, artifact, reference, diagnostic, and result types in `web/src/domain/formula-compiler/models.ts`
- [x] T011 Define `excel-scalar-v1.0.0` limits and function catalog in `web/src/domain/formula-compiler/policy.ts`
- [x] T012 [P] Add shared synthetic BuildSpec v2 and compiler fixture builders in `web/tests/fixtures/formula-compiler.ts`

**Checkpoint**: All user stories can use one versioned policy and one durable compiler interface.

## Phase 3: User Story 1 - Compile Reviewed Formulas (P1)

**Goal**: Compile supported reviewed scalar formulas into canonical workbook-ready text with resolved references and deterministic identity.

**Independent Test**: A synthetic BuildSpec v2 compiles to fixed canonical text, exact references, preserved provenance, deterministic order, and a reproducible payload hash.

- [x] T013 [P] [US1] Add lexer and parser conformance tests including quoted sheet names and concatenation in `web/tests/unit/domain/formula-compiler/parser.test.ts`
- [x] T014 [P] [US1] Add exact reference-resolution tests in `web/tests/unit/domain/formula-compiler/resolver.test.ts`
- [x] T015 [P] [US1] Add deterministic serialization and input-permutation tests in `web/tests/unit/domain/formula-compiler/serialization.test.ts`
- [x] T016 [US1] Implement the bounded lexer in `web/src/domain/formula-compiler/lexer.ts`
- [x] T017 [US1] Implement the precedence parser in `web/src/domain/formula-compiler/parser.ts`
- [x] T018 [US1] Implement A1/name validation and canonical workbook-reference formatting in `web/src/domain/formula-compiler/reference-codec.ts`
- [x] T019 [US1] Implement BuildSpec symbol-table construction and exact scenario-aware resolution in `web/src/domain/formula-compiler/resolver.ts`
- [x] T020 [US1] Implement canonical AST emission in `web/src/domain/formula-compiler/emitter.ts`
- [x] T021 [US1] Implement canonical payload hashing and operational envelope creation in `web/src/domain/formula-compiler/serialization.ts`
- [x] T022 [US1] Implement complete-result compiler orchestration in `web/src/domain/formula-compiler/compiler.ts`

**Checkpoint**: Supported formulas compile deterministically without execution.

## Phase 4: User Story 2 - Diagnose Invalid Formulas (P1)

**Goal**: Reject malformed, unsupported, external, volatile, UDF, array, unresolved, and unapproved formulas with stable actionable diagnostics.

**Independent Test**: Every negative corpus case returns its expected code and source span without throwing or emitting unsafe formula text.

- [x] T023 [P] [US2] Add negative syntax, policy, reference, hash, provenance, oracle, approval, and concept-separation tests in `web/tests/unit/domain/formula-compiler/compiler.test.ts`
- [x] T024 [US2] Implement stable diagnostic construction and deterministic issue keys in `web/src/domain/formula-compiler/diagnostics.ts`
- [x] T025 [US2] Implement BuildSpec v2 hash, provenance, policy, oracle, approval, and source-formula validation in `web/src/domain/formula-compiler/compiler.ts`
- [x] T026 [US2] Aggregate parser, policy, and resolver diagnostics in `web/src/domain/formula-compiler/compiler.ts`

**Checkpoint**: Unsupported inputs fail closed with complete diagnostics and no external execution.

## Phase 5: User Story 3 - Preserve Unaffected Work (P2)

**Goal**: Compile independent valid chains while blocking failed formulas and their transitive dependents.

**Independent Test**: An invalid dependency chain and an independent valid chain produce a partial artifact containing only the independent compiled formulas.

- [x] T027 [P] [US3] Add cycle, declaration-reconciliation, and transitive failure-isolation tests in `web/tests/unit/domain/formula-compiler/dependency-analysis.test.ts`
- [x] T028 [P] [US3] Add end-to-end partial compilation tests in `web/tests/integration/formula-compiler.test.ts`
- [x] T029 [US3] Implement AST-derived dependency reconciliation, cycle detection, and deterministic topological order in `web/src/domain/formula-compiler/dependency-analysis.ts`
- [x] T030 [US3] Implement partial and blocked orchestration in `web/src/domain/formula-compiler/compiler.ts`

**Checkpoint**: Failed formulas never enter usable output, and independent reviewed formulas remain available.

## Phase 6: Documentation and Quality

- [x] T031 [P] Document the formula language, diagnostics, Feature 007 handoff, and evidence boundaries in `specs/006-formula-compiler/contracts/formula-language.md` and `docs/formula-compiler.md`
- [x] T032 Add and record the offline 1,000-formula performance regression in `web/tests/unit/domain/formula-compiler/performance.test.ts` and `specs/006-formula-compiler/quickstart.md`
- [x] T033 Run `npm run quality` and record actual validation evidence in `specs/006-formula-compiler/quickstart.md`
- [x] T034 Mark completed tasks in `specs/006-formula-compiler/tasks.md` and verify no unsupported maturity or external-execution claim remains

## Dependencies

```text
Phase 1 -> Phase 2 -> US1 -> US2 -> US3 -> Documentation and Quality
```

- US1 establishes parsing, resolution, emission, and hashing.
- US2 depends on US1 phases to normalize diagnostics at the compiler interface.
- US3 depends on resolved references and diagnostics to propagate failure accurately.

## Parallel Opportunities

- T012 can proceed while contract registration is completed.
- T013, T014, and T015 are independent failing test surfaces before their implementations.
- T027 and T028 cover independent unit and integration surfaces.
- T031 can proceed after the public compiler interface stabilizes while performance tests run.

## Implementation Strategy

1. Preserve historical BuildSpec v1 validation while introducing the fail-closed v2 compiler seam.
2. Deliver US1 as the minimum useful compiler slice.
3. Add complete negative diagnostics before partial compilation.
4. Add failure isolation only after dependencies are AST-derived.
5. Finish with documentation, performance evidence, and the complete repository quality command.

## Format Validation

All implementation tasks use the required checkbox, sequential task ID, optional parallel marker, user-story label where applicable, and exact file path format.
