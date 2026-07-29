# Quickstart: Formula Compiler

## Purpose

Verify the deterministic compiler using synthetic data only. These steps do not execute Excel or calculate participant benefits.

## Input Preconditions

1. Use a BuildSpec `2.0.0` fixture with a verified content hash.
2. Give every material formula exactly one human-approved governing plan-rule provenance record.
3. Use the local `excel-scalar-v1.0.0` compiler policy.

## Expected Flow

```text
BuildSpec 2.0.0
  -> validate hash and provenance
  -> parse restricted formula syntax
  -> resolve sheet/name/cell/formula references
  -> derive dependency graph
  -> isolate failed dependency chains
  -> emit canonical formulas
  -> canonicalize and hash deterministic payload
  -> return complete | partial | blocked artifact
```

## Verification Commands

```bash
npm run typecheck
npm run validate:schemas
npm run validate:contracts
npx vitest run --project unit web/tests/unit/domain/formula-compiler
npx vitest run --project contract web/tests/contract/compiled-formula-artifact.test.ts
npm run test:integration
npm run quality
```

## Required Scenarios

1. Supported scalar formula compiles to fixed canonical text.
2. Optional leading `=` does not change canonical output.
3. Unknown, volatile, external, array, and UDF syntax is blocked.
4. Exact identifiers do not collide by substring.
5. A failed formula blocks its transitive dependents but not an independent chain.
6. Equivalent input permutations produce byte-identical deterministic payloads and hashes.
7. Operational timestamp and run UUID changes do not change content identity.
8. The 1,000-formula corpus completes within the specification threshold.

## Evidence Boundaries

- Passing tests support the `Tested` maturity claim only.
- No independent actuarial reconciliation is claimed by compiler tests alone.
- No Excel, ValTool, Runtime, ATPBGC, BCV, or other external execution is claimed.

## Recorded Validation Evidence

Recorded on 2026-07-28 in the local repository environment:

- `npm run typecheck`: passed with zero TypeScript errors.
- `npm run validate:schemas`: passed; 9 Draft 2020-12 design schemas resolved offline.
- `npm run validate:contracts`: passed; 9 runtime schemas matched approved source bytes.
- Feature 006 targeted ESLint command: passed with zero errors.
- `npm test`: passed; 69 files and 563 tests.
- `npm run build`: passed; Vite produced the single-file application artifact.
- `npm run verify:single-file`: passed.
- 1,000-formula performance regression: passed; 714 ms in the dedicated targeted run, below the one-second threshold.
- `npm run quality`: executed but stopped at repository-wide lint with 193 pre-existing errors in older evidence, architecture, plan-rule, Feature 004, and Feature 005 files. Feature 006 files are clean; unrelated files were not modified to conceal the baseline.

No browser development server or external workbook/calculation system was run for Feature 006.
