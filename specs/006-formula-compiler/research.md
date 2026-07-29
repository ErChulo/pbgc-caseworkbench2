# Research: Formula Compiler

## Decision 1: Deep Compiler Module

**Decision**: Hide lexing, parsing, resolution, dependency analysis, diagnostics, and emission behind one compiler interface.

**Rationale**: This concentrates formula complexity, improves locality, and makes the interface the test surface.

**Alternatives considered**: Independent public parser/resolver modules were rejected as shallow seams; raw formula pass-through was rejected as unsafe.

## Decision 2: Restricted Language Policy

**Decision**: Use `excel-scalar-v1.0.0`, accepting scalar literals, operators, parentheses, A1 references, names, and a reviewed function allowlist.

**Rationale**: Full workbook syntax includes volatile, external, array, locale, and UDF behavior outside the approved deterministic scope.

**Alternatives considered**: Full Excel syntax and all nonvolatile functions were rejected because they cannot be validated safely with current evidence and dependencies.

## Decision 3: Function Catalog

**Decision**: V1 allows `ABS`, `AND`, `DATE`, `DAY`, `DAYS`, `IF`, `INT`, `ISBLANK`, `ISLOGICAL`, `ISNUMBER`, `ISTEXT`, `MAX`, `MIN`, `MOD`, `MONTH`, `NOT`, `OR`, `PRODUCT`, `ROUND`, `ROUNDDOWN`, `ROUNDUP`, `SIGN`, `SUM`, `TRUNC`, and `YEAR`, with explicit arities.

**Rationale**: These deterministic scalar functions cover initial formula structure without requiring range, lookup, iterative, or external semantics.

**Alternatives considered**: Lookup and financial functions are deferred pending reviewed range and convention policies.

## Decision 4: Canonical Emission

**Decision**: Accept zero or one leading `=`, emit no leading `=`, uppercase functions/booleans/cell columns, remove insignificant whitespace, and fully parenthesize binary expressions.

**Rationale**: SheetJS formula bodies omit `=`, and fully explicit precedence is deterministic and auditable.

**Alternatives considered**: Minimal-parenthesis pretty printing was rejected because it increases emitter complexity and precedence drift risk.

## Decision 5: No Evaluation

**Decision**: Parse, validate, resolve, and emit formulas without calculating values or folding constants.

**Rationale**: Evaluation would create an incomplete calculation engine and could alter rounding, error propagation, or missing-data behavior.

## Decision 6: Exact Reference Resolution

**Decision**: Resolve complete tokens case-insensitively by sheet scope, workbook scope, target sheet, and scenario. Derive dependencies only from resolved formula references.

**Rationale**: Raw substring matching confuses identifiers and leaks dependencies across scenarios.

## Decision 7: Dependency-Aware Partial Results

**Decision**: Compile independent valid chains, block failed formulas and all transitive dependents, and return `complete`, `partial`, or `blocked`.

**Rationale**: This exposes the precise blast radius while preventing Feature 007 from consuming unresolved formulas.

## Decision 8: Provenance-Bearing BuildSpec 2.0.0

**Decision**: Preserve historical BuildSpec `1.0.0` validation, add provenance-complete `2.0.0`, and reject v1 at the compiler seam.

**Rationale**: Required source citations and review facts cannot be inferred or synthesized.

## Decision 9: Deterministic Payload Boundary

**Decision**: Hash only the canonical deterministic payload through the repository canonicalization profile. Keep compilation timestamp and run UUID outside the hash.

**Rationale**: Operational metadata must not change artifact identity.

## Decision 10: Purpose-Built Parser

**Decision**: Implement a bounded lexer and recursive-descent parser with no new dependency.

**Rationale**: Installed libraries do not expose a reviewed restricted parser, and accepting a general grammar would weaken policy enforcement.

## Decision 11: Resource Limits

**Decision**: Limit formulas to 8,192 UTF-16 code units, nesting to 64, tokens to 4,096, and function arguments to 255.

**Rationale**: Explicit bounds produce predictable local performance and structured failures for malformed inputs.

## Decision 12: External Execution Claims

**Decision**: Tests establish parser, resolver, contract, determinism, and performance behavior only.

**Rationale**: No Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution is part of this feature.
