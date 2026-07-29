# ADR-0001: Deterministic V1 Compiler Architecture

**Status**: Accepted
**Date**: 2026-07-28
**Approving authority**: Repository owner through the ratified constitution and Feature 006 direction
**Supersedes**: Original five-line ADR-0001 placeholder
**Superseded by**: None

## Context

PBGC CaseworkBench must transform reviewed plan rules and population-driven architecture into reproducible workbook formulas without using narrative model output as a calculation engine. Formula text can contain ambiguous references, unsupported workbook behavior, external links, volatile functions, or missing evidence. Passing such text directly to a workbook library would defer failures and weaken auditability.

## Decision

Use deterministic code and formulas for calculations and workbook generation. LLM assistance may support evidence interpretation and drafting but never supplies the final calculation engine.

Feature 006 is a deep compiler module with one narrow interface. It validates BuildSpec `2.0.0`, parses the restricted `excel-scalar-v1.0.0` language, resolves references by sheet and scenario, derives dependencies from resolved syntax, isolates failed dependency chains, and emits a versioned canonical artifact. Parser AST nodes remain internal. Workbook-library writing is deferred to a Feature 007 adapter.

Only a reviewed, versioned deterministic function allowlist is accepted. External references, volatile functions, UDFs, ranges, arrays, dynamic arrays, and unapproved syntax fail closed. The compiler does not evaluate formulas.

The artifact hash covers deterministic content only. Operational timestamps and run identifiers remain outside deterministic identity. Material formula provenance is required and preserved end-to-end.

## Alternatives Considered

- **Pass formulas through to SheetJS**: Rejected because it does not validate policy, provenance, references, or dependencies.
- **Support the complete Excel language**: Rejected because the scope includes unreviewed volatile, external, locale, array, and UDF semantics.
- **Expose parser and resolver interfaces separately**: Rejected as shallow seams that would leak compiler internals and reduce locality.
- **Block all output after one formula failure**: Rejected because dependency-aware partial output can preserve independent reviewed formulas without weakening fail-closed behavior.
- **Infer missing provenance**: Rejected because citations, effective dates, and approval status may not be invented.

## Consequences

- Formula-policy changes require versioning and conformance tests.
- Feature 005 must provide provenance-complete BuildSpec `2.0.0` output before end-to-end compilation is available.
- Feature 007 consumes only compiled formulas and must never write blocked formula text.
- Compiler tests prove structural compilation behavior, not actuarial approval or external workbook execution.
- The restricted v1 language intentionally defers ranges, lookups, financial functions, and advanced workbook syntax.
