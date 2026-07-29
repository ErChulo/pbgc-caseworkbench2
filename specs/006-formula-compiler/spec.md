# Feature Specification: Formula Compiler

**Feature Branch**: `010-evidence-ingestion`
**Created**: 2026-07-28
**Status**: Clarified
**Input**: A validated V1 Build Specification containing formula definitions, named ranges, cell mappings, execution order, and reviewed formula provenance.

## Overview

The Formula Compiler converts reviewed formula definitions into a deterministic, versioned compilation artifact for the workbook builder. It validates a deliberately restricted workbook-formula language, resolves references without executing formulas, preserves source and review provenance, isolates failures by dependency, and reports every unsupported or unresolved construct explicitly.

The compiler does not calculate participant benefits, infer missing values, approve formula meaning, or claim successful execution in Excel or another external calculation system.

## Clarifications

### Session 2026-07-28

- Q: Which function-support policy should govern the Formula Compiler? -> A: A versioned allowlist of reviewed deterministic functions; unsupported and volatile functions are rejected with structured diagnostics.
- Q: How should Feature 006 handle incomplete formula provenance in Feature 005? -> A: Version the BuildSpec contract so each material FormulaDefinition carries reviewed source citations and effective-date metadata that compilation preserves.
- Q: What should happen when one formula fails compilation? -> A: Compile independent formulas, block the failed formula and all transitive dependents, and return a partial result with deterministic diagnostics.

## User Scenarios & Testing

### User Story 1 - Compile Reviewed Formulas (Priority: P1)

As a workbook-generation operator, I need reviewed formulas compiled into deterministic workbook-ready text so that the workbook builder receives an unambiguous and auditable instruction set.

**Why this priority**: Workbook generation cannot safely begin until formula syntax, references, provenance, and ordering are validated.

**Independent Test**: Compile a synthetic BuildSpec containing arithmetic, comparisons, named references, cell references, and allowlisted functions; verify the emitted formulas, resolved references, execution order, provenance, and artifact hash against fixed expected values.

**Acceptance Scenarios**:

1. **Given** a reviewed formula using supported operators and named references, **When** it is compiled, **Then** the result contains workbook-ready formula text, exact resolved references, source spans, scenario context, and preserved provenance.
2. **Given** two byte-equivalent validated inputs and the same compiler-policy version, **When** each is compiled, **Then** their deterministic payload bytes and content hashes are identical.
3. **Given** a supported formula with an optional leading equals sign, **When** it is compiled, **Then** the compiler normalizes it to one canonical workbook-ready representation.

---

### User Story 2 - Diagnose Unsupported or Invalid Formulas (Priority: P1)

As an actuarial reviewer, I need precise, actionable diagnostics for invalid formulas and unresolved references so that the source rule or build specification can be corrected rather than hidden behind workbook errors.

**Why this priority**: Silent pass-through would violate deterministic computation, traceability, and generated-workbook invariants.

**Independent Test**: Compile synthetic formulas containing malformed syntax, unknown names, external references, volatile functions, unsupported functions, and missing provenance; verify stable diagnostic codes, source locations, blocking behavior, and recovery guidance.

**Acceptance Scenarios**:

1. **Given** malformed syntax, **When** compilation runs, **Then** the result identifies the affected formula, source span, reason, and blocking severity without throwing an unhandled error.
2. **Given** a function absent from the active allowlist or designated volatile, **When** compilation runs, **Then** the function is rejected and no unresolved formula is emitted.
3. **Given** a reference to an external workbook or an undefined name, **When** compilation runs, **Then** the reference is rejected with a diagnostic that explains what must be corrected.

---

### User Story 3 - Preserve Unaffected Work During Failures (Priority: P2)

As a casework reviewer, I need independent formulas to compile even when another dependency chain fails so that diagnostics show the exact blast radius without presenting blocked formulas as usable.

**Why this priority**: Dependency-aware partial results improve review efficiency while preserving fail-closed behavior for affected calculations.

**Independent Test**: Compile a graph with one invalid formula, two transitive dependents, and an independent valid chain; verify that only the independent chain is emitted and all blocked formulas identify their causal dependency.

**Acceptance Scenarios**:

1. **Given** one invalid formula and an independent valid formula, **When** compilation runs, **Then** the valid formula is emitted and the result status is `partial`.
2. **Given** a valid formula that depends directly or transitively on a failed formula, **When** compilation runs, **Then** the dependent formula is blocked and cites the causal failed formula.
3. **Given** a dependency cycle, **When** compilation runs, **Then** every cycle member and dependent formula is blocked with deterministic cycle diagnostics.

### Edge Cases

- Empty formula text for an output or bidirectional field is a blocking error; input-only fields do not require formulas.
- Identifiers are matched as complete tokens, not substrings, and are resolved case-insensitively according to workbook naming rules.
- Sheet-scoped and workbook-scoped names may coexist only when resolution is unambiguous for the formula target.
- Special characters and quoted sheet names are normalized without changing the referenced sheet or cell.
- External workbook references, dynamic arrays, array formulas, user-defined functions, volatile functions, and unapproved functions are rejected.
- Missing required participant data remains an explicit downstream validation condition and is never replaced with zero by the compiler.
- Formula compilation does not perform material rounding or numeric evaluation.

## Requirements

### Functional Requirements

- **FR-001**: The system SHALL accept only a schema-valid BuildSpec whose content hash verifies and whose formulas carry the required reviewed provenance.
- **FR-002**: The system SHALL recognize numeric, text, and boolean literals; parentheses; unary and binary arithmetic operators; the text-concatenation operator; comparison operators; A1 cell references; sheet-qualified references; named references; and calls to functions in the active versioned allowlist.
- **FR-003**: The system SHALL normalize an optional leading equals sign and emit exactly one canonical workbook-ready formula representation.
- **FR-004**: The system SHALL reject malformed syntax, external workbook references, volatile functions, user-defined functions, array formulas, dynamic-array syntax, and functions absent from the active allowlist.
- **FR-005**: The system SHALL resolve each reference by exact token, workbook or sheet scope, target sheet, and scenario without substring matching or cross-scenario leakage.
- **FR-006**: Each resolved reference SHALL retain its original text, source span, reference kind, resolved identity, target location, scenario, and provenance link.
- **FR-007**: Formula-to-formula dependencies and execution order SHALL be derived from resolved references rather than raw text matching.
- **FR-008**: The compiler SHALL detect cycles and SHALL block every cycle member and every formula that transitively depends on a failed or cyclic formula.
- **FR-009**: Independent valid formulas SHALL compile when another dependency chain fails, and the overall result SHALL be `complete`, `partial`, or `blocked` according to emitted and blocked formulas.
- **FR-010**: Diagnostics SHALL include a stable code, severity, blocking status, formula identity, scenario, source span when available, plain-language message, and structured context.
- **FR-011**: Diagnostics and compiled formulas SHALL be sorted deterministically, independent of map insertion order or processing timing.
- **FR-012**: The compiled artifact SHALL preserve the BuildSpec identity and hash, compiler-policy version, formula source text, source citations, effective dates, supersession information, confidence, review status, approval record, affected-test analysis, regeneration impact, independent deterministic oracle references, resolved references, emitted text, execution order, and deterministic diagnostics.
- **FR-013**: Each source formula SHALL have exactly one `CellMapping`, and its formula ID, scenario, tab, cell, generic field, and I/O/B metadata SHALL agree with that mapping; a missing, ambiguous, or disagreeing mapping SHALL block the affected formula with a deterministic diagnostic.
- **FR-014**: Compiled-artifact validation SHALL enforce schema and content hash before semantic invariants, including status/cardinality consistency, disjoint compiled and blocked formula IDs, an exact dependency-valid execution order, and diagnostic/status consistency. Validation SHALL return stable issue codes and SHALL NOT throw for malformed runtime input.
- **FR-015**: BuildSpec import SHALL return a usable artifact only after schema and content-hash verification succeeds. Schema-invalid and hash-mismatched input SHALL return a fail-closed error result without a BuildSpec value.
- **FR-013**: The deterministic payload SHALL exclude operational timestamps and random run identifiers and SHALL have a reproducible SHA-256 content hash.
- **FR-014**: The system SHALL expose the compiled artifact through a closed, versioned contract suitable for Feature 007 without exposing parser internals as the consumer interface.
- **FR-015**: The initial reviewed function catalog SHALL be explicit, versioned, locally available, and usable without network access.

### Governance Requirements

- **GR-001**: Compilation SHALL never execute formula text or use narrative model output as a calculation engine.
- **GR-002**: The compiler SHALL not invent source citations, effective dates, review status, participant values, formulas, or missing references.
- **GR-003**: A material formula lacking required provenance or review status SHALL be blocked rather than compiled provisionally.
- **GR-004**: Formula compilation and tests SHALL keep `CALC_INDICATOR`, `CALCULATION`, and I/O/B metadata distinct.
- **GR-005**: The feature SHALL not claim Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution unless such execution is actually performed and recorded separately.
- **GR-006**: Every emitted material formula SHALL identify at least one independent deterministic calculation or test oracle; parser self-round-trips alone do not satisfy this requirement.

## Key Entities

- **CompilerPolicy**: Versioned rules for accepted syntax, deterministic function names and arities, volatile or prohibited functions, reference forms, and canonical emission.
- **FormulaProvenance**: Reviewed evidence links, precise locators, effective dates, supersession, confidence, review status, approval record, affected-test analysis, regeneration impact, and independent oracle references inherited from the BuildSpec.
- **CompiledFormulaArtifact**: Versioned deterministic payload linking the source BuildSpec to compiled formulas, execution order, and diagnostics.
- **CompiledFormula**: One emitted formula with source text, canonical text, target, scenario, resolved references, dependencies, provenance, and status.
- **ResolvedReference**: A source-spanned reference classified as input, named range, cell, formula, function, or prohibited external reference and linked to its resolved target when valid.
- **CompilationIssue**: Stable, structured warning or error describing the affected formula, location, blocking effect, and corrective context.
- **CompilationResult**: `complete`, `partial`, or `blocked` outcome containing all independently valid compiled formulas and all deterministic issues.

## Success Criteria

- **SC-001**: All supported formulas in the reviewed synthetic conformance corpus compile to their fixed expected canonical text and resolved references.
- **SC-002**: Every malformed, unresolved, external, volatile, or non-allowlisted construct in the negative corpus produces the expected stable diagnostic and emits no unsafe formula.
- **SC-003**: Repeated compilation of equivalent inputs and policy versions produces byte-identical deterministic payloads and identical hashes in 100% of regression runs.
- **SC-004**: In dependency-isolation tests, 100% of independent valid formulas compile and 100% of failed or transitively blocked formulas are excluded from usable output.
- **SC-005**: A corpus of 1,000 synthetic formulas compiles locally in no more than one second on the project test environment, with the measured command and result recorded.
- **SC-006**: Every emitted material formula retains complete required provenance and a link to its source BuildSpec formula.
- **SC-007**: Contract, unit, integration, determinism, and performance tests pass without network access or external workbook execution.

## Assumptions

- Feature 005 will receive a versioned contract extension for complete formula provenance before Feature 006 accepts its output.
- The initial function allowlist is intentionally smaller than the complete workbook function language and grows only through reviewed policy changes and tests.
- Feature 007 consumes canonical compiled formula text and resolved references but owns workbook file creation and library-specific writing behavior.
- Formula semantic equivalence to controlling plan rules remains subject to independent deterministic test oracles and human review; successful compilation proves structural validity, not actuarial approval.

## Dependencies

- Feature 005 V1 Build Specification and its versioned formula-provenance extension.
- The repository canonicalization profile and content-hash rules.
- The approved workbook structural contract, including canonical support sheets and the prohibition on recreating `mySort`.

## Out of Scope

- Executing or evaluating participant formulas.
- Inferring or approving actuarial meaning, rounding, date conventions, or missing participant data.
- Creating or manually patching workbook files.
- External workbook links, volatile functions, user-defined functions, array formulas, and dynamic arrays.
- Claiming compatibility through actual Excel or other external-system execution.
