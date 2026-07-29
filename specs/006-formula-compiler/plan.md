# Implementation Plan: Formula Compiler

**Branch**: `010-evidence-ingestion` | **Date**: 2026-07-28 | **Spec**: [spec.md](./spec.md)

## Summary

Implement a deep, local-first formula compiler module that accepts provenance-complete BuildSpec `2.0.0` input, parses the restricted `excel-scalar-v1.0.0` language, resolves exact references by sheet and scenario, derives dependencies from resolved syntax, isolates failed dependency chains, and emits a versioned deterministic artifact for Feature 007. The compiler never executes formulas. It uses the repository canonicalization profile and keeps operational metadata outside deterministic identity.

## Technical Context

**Language/Version**: TypeScript 6.0.3 in strict project mode; Node.js 22.13+ for tooling and tests

**Primary Dependencies**: Existing Ajv 8.20.0 for Draft 2020-12 contracts; Web Crypto through the existing canonical JSON module; no new runtime dependency

**Storage**: Immutable JSON artifact contract; local case-workspace persistence is deferred until a concrete Feature 007 consumer requires it

**Testing**: Vitest unit, contract, integration, deterministic golden-vector, and bounded performance tests

**Target Platform**: Offline-capable browser application and Node-based repository validation

**Project Type**: Compiler domain module inside the existing React/Vite application

**Performance Goals**: Compile 1,000 synthetic scalar formulas in no more than one second in the recorded project test environment

**Constraints**: Zero network at runtime; no formula evaluation; no invented provenance; no external links, volatile functions, UDFs, ranges, arrays, or dynamic arrays; no Excel execution claim

**Scale/Scope**: BuildSpec-sized formula sets, expected hundreds to low thousands of formulas, with source formulas limited to 8,192 UTF-16 code units and parser nesting limited to 64

## Constitution Check

_GATE: Passed before research and re-checked after design._

| Principle                                  | Design evidence                                                                                                                     |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Deterministic actuarial computation        | The compiler parses and emits text but never evaluates formulas; policy and output are versioned and hash-bound.                    |
| Evidence traceability and source authority | BuildSpec `2.0.0` requires formula provenance with rule hashes, citations, dates, supersession, confidence, and review status.      |
| Effective-dated history                    | Formula provenance preserves effective/end dates and applicability; the compiler does not collapse periods.                         |
| Missing data                               | The compiler never inserts zero or any participant value. Missing references block affected formulas.                               |
| V1 concept separation                      | I/O/B remains formula-target metadata; no `CALC_INDICATOR` or `CALCULATION` reinterpretation is introduced.                         |
| Human review                               | Only human-approved governing formula provenance compiles; provisional or unresolved formulas block.                                |
| Reproducibility and lineage                | Deterministic payload links source BuildSpec hash, compiler and policy versions, resolved references, diagnostics, and output hash. |
| Validation evidence                        | Grammar corpus, dependency isolation, contract, determinism, and performance tests are required. External execution is not claimed. |
| Workbook invariants                        | Feature 007 receives only compiled formulas. External references and unsupported names are rejected before workbook construction.   |

No constitutional violation or complexity exception is required.

## Architecture Decision

The feature uses one deep `formula-compiler` module. Its public interface accepts a BuildSpec and compiler policy and returns a complete, partial, or blocked compilation result. Tokenization, parsing, AST nodes, symbol lookup, reference resolution, dependency propagation, diagnostic normalization, and canonical emission remain internal. This maximizes locality and permits deletion of raw substring dependency matching after upstream migration.

Workbook dialect behavior is represented by a narrow reference codec and canonical emitter, not by SheetJS calls. Feature 007 may add a concrete workbook-writing adapter when a second consumer makes that seam real.

## Implementation Phases

### Phase 0: Research and Governance

1. Record grammar, function policy, artifact hashing, provenance, partial-result, and compatibility decisions in `research.md`.
2. Expand ADR-0001 with context, alternatives, consequences, status, authority, and supersession fields.

### Phase 1: Contracts and Data Model

1. Version the BuildSpec schema to accept historical `1.0.0` and provenance-complete `2.0.0` payloads.
2. Define `compiled-formula-artifact.schema.json` and mirror it byte-for-byte into runtime schemas.
3. Register the ninth schema and canonical array semantics.
4. Define compiler policy, provenance, compiled formula, resolved reference, blocked formula, and diagnostic entities.

### Phase 2: Restricted Formula Language

1. Implement a bounded lexer with UTF-16 source spans and prohibited-syntax recognition.
2. Implement a precedence parser for scalar literals, references, operators, parentheses, and function calls.
3. Implement canonical scalar emission without formula evaluation or algebraic simplification.

### Phase 3: Resolution and Dependency Analysis

1. Build a case-insensitive symbol table for sheets, workbook/sheet names, cells, inputs, and formulas.
2. Resolve complete tokens by target sheet and scenario; reject ambiguous, external, and cross-scenario references.
3. Derive formula dependencies from resolved references and reconcile them against upstream declarations.
4. Detect cycles and propagate failed or cycle-blocked status transitively while retaining independent output.

### Phase 4: Compiler Orchestration and Artifact Identity

1. Validate BuildSpec version, hash, provenance, and policy integrity before formula compilation.
2. Aggregate deterministic diagnostics and build complete, partial, or blocked results.
3. Canonicalize and hash the deterministic payload; inject operational clock and UUID metadata outside the hash.

### Phase 5: Documentation and Quality Gates

1. Publish formula-language, diagnostic, and Feature 007 handoff documentation.
2. Run typecheck, lint, formatting, schema and contract validation, all tests, build, single-file verification, and the recorded 1,000-formula performance test.

## Project Structure

### Documentation

```text
specs/006-formula-compiler/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── tasks.md
├── checklists/requirements.md
└── contracts/
    ├── compiled-formula-artifact.schema.json
    └── formula-language.md
```

### Source Code

```text
web/src/domain/formula-compiler/
├── models.ts
├── policy.ts
├── lexer.ts
├── parser.ts
├── reference-codec.ts
├── resolver.ts
├── dependency-analysis.ts
├── emitter.ts
├── serialization.ts
└── compiler.ts

web/src/contracts/schemas/
└── compiled-formula-artifact.schema.json

web/tests/unit/domain/formula-compiler/
├── lexer.test.ts
├── parser.test.ts
├── resolver.test.ts
├── dependency-analysis.test.ts
├── serialization.test.ts
└── compiler.test.ts

web/tests/contract/
└── compiled-formula-artifact.test.ts
```

**Structure Decision**: Keep formula semantics in a deep domain module and expose only policy, result, and compiled-artifact types. Do not add a workbook-library adapter until Feature 007 provides the concrete writer.

## Post-Design Constitution Check

Passed. The design fails closed on missing provenance, unsupported syntax, unresolved references, policy mismatch, and dependency failure. It adds no external dependency, does not execute formulas, does not fabricate data, and preserves all required lineage in deterministic output.
