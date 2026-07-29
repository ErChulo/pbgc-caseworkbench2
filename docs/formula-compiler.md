# Formula Compiler

## Purpose

Feature 006 converts provenance-complete BuildSpec `2.0.0` formulas into a deterministic artifact for Feature 007. It validates and normalizes formula structure; it does not execute formulas, calculate participant benefits, infer missing data, or approve actuarial meaning.

## Public Interface

`compileBuildSpec` accepts:

- a BuildSpec `2.0.0` with a verified content hash;
- complete formula provenance and independent oracle references;
- a compiler version;
- local clock and UUID ports for operational metadata;
- optionally, an explicit versioned compiler policy.

It returns a `complete`, `partial`, or `blocked` result. Schema-invalid, historical v1, or duplicate-identity inputs return no artifact. Accepted inputs return a `CompiledFormulaArtifact`. Feature 007 must call `validateCompiledArtifact` before consumption and must consume only `deterministicPayload.compiledFormulas`; `blockedFormulas` are review evidence and must never be written to a workbook.

## Language Boundary

The active policy is `excel-scalar-v1.0.0`. The authoritative grammar and function catalog are in `specs/006-formula-compiler/contracts/formula-language.md`.

The compiler accepts deterministic scalar expressions and rejects external links, ranges, arrays, dynamic arrays, volatile functions, active functions, UDFs, and unlisted functions. Canonical output omits the leading equals sign because the planned workbook adapter stores formula bodies separately from display notation.

## Diagnostic Categories

| Category          | Meaning                                                                                   | Typical recovery                                                       |
| ----------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `contract`        | Input shape or V1 metadata is invalid                                                     | Regenerate the BuildSpec from approved inputs                          |
| `integrity`       | BuildSpec or policy identity cannot be verified                                           | Restore the exact approved artifact                                    |
| `provenance`      | Citation, approval, review, affected-test, regeneration, or oracle evidence is incomplete | Complete human review and regenerate                                   |
| `syntax`          | Formula text is malformed or outside the scalar grammar                                   | Correct the source formula definition                                  |
| `function-policy` | Function is volatile, active, a UDF, has wrong arity, or is not allowlisted               | Replace it with approved deterministic structure or version the policy |
| `reference`       | Sheet, cell, name, scope, or scenario cannot be resolved exactly                          | Correct BuildSpec mappings and names                                   |
| `dependency`      | Declarations disagree, a cycle exists, or an upstream formula failed                      | Correct the formula graph and regenerate                               |
| `compiler`        | An unexpected compiler failure occurred                                                   | Preserve diagnostics and investigate before downstream use             |

Every diagnostic has a stable code and deterministic key. Human-facing wording may improve without changing issue identity.

## Partial Compilation

The compiler derives dependencies from parsed and resolved references. A directly invalid formula is `failed`; formulas in a cycle are `cycle-blocked`; transitive dependents are `dependency-blocked`. Independent valid formulas remain compiled. This isolates the blast radius without passing unsafe text downstream.

## Deterministic Identity

The content hash covers source BuildSpec identity, compiler and policy identity, compiled and blocked formulas, resolved references, provenance, execution order, and deterministic diagnostics. Compilation timestamp and run UUID are operational metadata outside the hash.

The implementation uses the PBGC CaseworkBench canonical JSON profile. Set-like formula, blocked-formula, dependency, and diagnostic arrays are sorted by explicit stable identities; source references and execution order preserve semantic order.

## Evidence and Maturity

- Parser and compiler tests establish structural behavior only.
- Each emitted material formula must retain an independent deterministic oracle reference.
- Actuarial approval requires the upstream human approval record and separate oracle/reconciliation evidence.
- No Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution is performed or claimed by Feature 006.
- Workbook defects must be corrected in the BuildSpec, compiler, or future generator and regenerated; manual workbook patching is not an accepted correction path.
