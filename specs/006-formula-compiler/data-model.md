# Data Model: Formula Compiler

## Modeling Conventions

- SHA-256 values are lowercase 64-character hexadecimal strings.
- Dates are exact `YYYY-MM-DD` values and timestamps are UTC ISO 8601 strings.
- Source spans use zero-based, end-exclusive UTF-16 code-unit offsets.
- Set-like arrays are canonicalized by explicit stable keys; execution order and source-order references remain ordered.
- Parser AST nodes are internal and are not part of the durable Feature 007 interface.

## 1. CompilerPolicy

| Field                 | Type             | Rules                                               |
| --------------------- | ---------------- | --------------------------------------------------- |
| `policyId`            | string           | `excel-scalar-v1`                                   |
| `policyVersion`       | string           | `1.0.0`                                             |
| `policyContentSha256` | SHA-256          | Hash of canonical policy content                    |
| `functions`           | FunctionPolicy[] | Unique, case-insensitive names                      |
| `limits`              | CompilerLimits   | Formula length, nesting, token, and argument limits |

## 2. FormulaProvenance

| Field                   | Type                    | Rules                                                    |
| ----------------------- | ----------------------- | -------------------------------------------------------- |
| `sourcePlanRules`       | FormulaRuleProvenance[] | At least one; exactly one governing rule                 |
| `derivationDescription` | string                  | Nonempty reviewed explanation                            |
| `approvalRecordId`      | string                  | Immutable approval identity                              |
| `affectedTestIds`       | string[]                | Nonempty deterministic test-analysis references          |
| `regenerationImpact`    | string                  | Nonempty description of artifacts requiring regeneration |
| `validationOracleIds`   | string[]                | Nonempty independent deterministic oracle references     |

Each rule provenance preserves the rule UUID and hash, relationship, governing restatement, primary and supporting citations, effective/end/adoption dates, applicability conditions, supersession chain, confidence, review status, authority override link, and unresolved-item links. Only `human-approved` governing provenance with no linked unresolved item and complete material-change review evidence compiles.

## 3. CompiledFormulaArtifact

| Field                  | Type                   | Rules                            |
| ---------------------- | ---------------------- | -------------------------------- |
| `schemaVersion`        | string                 | `1.0.0`                          |
| `artifactType`         | string                 | `compiled-formula-artifact`      |
| `deterministicPayload` | CompiledFormulaPayload | Hash boundary                    |
| `contentSha256`        | SHA-256                | Canonical payload hash           |
| `operationalMetadata`  | OperationalMetadata    | Excluded from deterministic hash |

## 4. CompiledFormulaPayload

| Field              | Type                    | Rules                                           |
| ------------------ | ----------------------- | ----------------------------------------------- |
| `sourceBuildSpec`  | SourceBuildSpecIdentity | BuildSpec `2.0.0` identity and verified hash    |
| `compiler`         | CompilerIdentity        | Compiler, policy, and canonicalization versions |
| `status`           | enum                    | `complete`, `partial`, or `blocked`             |
| `compiledFormulas` | CompiledFormula[]       | Unique by formula ID                            |
| `blockedFormulas`  | BlockedFormula[]        | Unique by formula ID                            |
| `executionOrder`   | string[]                | Compiled formula IDs, dependencies first        |
| `diagnostics`      | CompilationDiagnostic[] | Deterministically sorted                        |

State rules:

- `complete`: all source formulas compiled and no blocking diagnostic exists.
- `partial`: at least one formula compiled and at least one formula is blocked.
- `blocked`: no formula compiled or artifact-level validation failed.

Artifact validation first verifies the JSON contract and deterministic payload hash, then verifies these status cardinalities, disjoint compiled/blocked IDs, execution-order membership and dependency order, and diagnostic linkage. Failures are returned as stable issue codes rather than exceptions.

## 5. CompiledFormula

Carries formula ID, scenario, target tab/cell/field, I/O/B value (`O` or `B`), original text, canonical text, resolved dependencies, source-ordered resolved references, and complete provenance.

Compilation requires exactly one BuildSpec `CellMapping` for this formula ID. Scenario, tab, cell, generic field, and I/O/B values must match exactly; only the affected formula and its dependency chain are blocked when this linkage is missing, ambiguous, or inconsistent.

## 6. BlockedFormula

Carries the same identity, target, source text, and provenance as a compiled formula but has no canonical text. Status is `failed`, `dependency-blocked`, or `cycle-blocked`; causal formula IDs and diagnostic keys explain the blast radius.

## 7. ResolvedReference

| Field                               | Type                 | Rules                                                  |
| ----------------------------------- | -------------------- | ------------------------------------------------------ |
| `originalText`                      | string               | Exact source slice                                     |
| `normalizedText`                    | string               | Canonical emitted reference                            |
| `sourceSpan`                        | SourceSpan           | UTF-16 offsets                                         |
| `referenceKind`                     | enum                 | `cell`, `named-range`, `formula`, `input`, `function`  |
| `resolvedIdentity`                  | string               | Stable target identity                                 |
| `scenarioId`                        | string               | Must match applicable scenario                         |
| `target`                            | discriminated object | Exact resolved cell, name, formula, input, or function |
| `provenanceRuleContentSha256Values` | SHA-256[]            | Set-like lineage links                                 |

## 8. CompilationDiagnostic

Carries a deterministic key, stable code, category, severity, downstream-blocking flag, optional formula/scenario/source span, plain-language message, and scalar structured context. Diagnostic identity excludes the human-facing message so wording can improve without changing issue identity.

## 9. Internal Formula AST

Internal node kinds are literal, unary, binary, reference, function call, and group. Every node carries a source span. The AST is immutable, bounded by policy limits, and discarded after resolution and canonical emission.

## Relationships

```text
BuildSpec 2.0.0
  └── FormulaDefinition * ── 1 FormulaProvenance
          │
          ▼
    CompiledFormulaArtifact 1 ── * CompiledFormula
                            1 ── * BlockedFormula
                            1 ── * CompilationDiagnostic

CompiledFormula 1 ── * ResolvedReference
BlockedFormula  * ── * CompilationDiagnostic (by diagnostic key)
```
