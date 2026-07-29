# Implementation Plan: Workbook Builder

**Feature**: 007 Workbook Builder
**Date**: 2026-07-29
**Status**: Planning; implementation not yet started

## Summary

Feature 007 generates deterministic V1 workbooks from governed BuildSpecs (Feature 005) and population profiles (Feature 003). Workbooks are schema-valid XLSX artifacts with support sheets preserving complete lineage, formula cells in execution order, named ranges, cell mappings, and population data sources. Workbooks are generated artifacts fixed only by correcting their generator.

## Technical Context

- TypeScript 6 strict mode, exceljs library for XLSX generation
- Web Crypto for content hashing
- No external workbook execution (ValTool, Runtime, etc.)
- No formula execution during generation
- Input: `BuildSpecV2`, `PopulationDecisionProjection`, `WorkbookPopulationProfile`
- Output: Deterministic XLSX workbook or aggregated validation errors

## Architecture

```text
BuildSpecV2 ──+
              ├--> workbookBuilder() ──+
              |    |- validate BuildSpec
PopulationProfile ┤    |- validate population sources
              |    |- generate support sheets
              |    |- generate formula sheets
              |    |- populate I cells
              |    |- compute content hash
              ├--> V1 XLSX workbook
              |    or ValidationError[]
```

## Implementation Decisions

1. Workbook generation is deterministic; identical inputs produce byte-identical outputs.
2. Support sheets (Summary, Tables, UD Table) are required and embed complete lineage.
3. Formulas are copied exactly from BuildSpec without reordering or optimization.
4. Population data sources are validated; missing sources block generation.
5. I/B cells are populated from BuildSpec mappings; data is never invented.
6. Workbook content hash is deterministic and enables tamper detection.
7. All validation errors are reported together; partial workbooks are never generated.
8. Workbooks are fixed only by correcting the generator (BuildSpec, governance, population).

## Project Structure

```text
web/src/domain/workbook-builder/
├── models.ts
├── validation.ts
├── support-sheets.ts
├── formula-sheets.ts
├── data-sheets.ts
├── workbook-builder.ts
└── serialization.ts

web/tests/unit/domain/workbook-builder/
├── support-sheets.test.ts
├── formula-sheets.test.ts
├── data-sheets.test.ts
├── validation.test.ts
└── workbook-builder.test.ts

web/tests/integration/
├── build-spec-workbook-builder.test.ts
└── workbook-validation.test.ts

web/tests/fixtures/
└── workbook-fixtures.ts
```

## Constitution Check

| Requirement | Result |
|---|---|
| Deterministic actuarial computation | Pass: deterministic generation, no formula execution, no LLM output |
| Evidence and effective-date traceability | Pass: support sheets preserve BuildSpec lineage, plan rules, governance |
| Missing data | Pass: missing population sources block generation; no invented values |
| V1 concept separation | Pass: workbook is pure artifact; CALC, CALCULATION, I/O/B remain distinct |
| Human review | Pass: governance and approval decisions embedded in support sheets |
| Reproducibility | Pass: deterministic content hash, byte-identical outputs from same inputs |
| Validation evidence | Not yet implemented; to be tested post-implementation |

No constitutional exception required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, focused Feature 007 unit tests, Feature 007 integration tests, `npm test`.

## Known Risks and Dependencies

1. **XLSX Library Choice**: exceljs is the current choice; requires evaluation of determinism across library versions.
2. **Population Data Access**: Workbook generation requires working population adapters (Features 001, 003). Population data must be accessible and validated.
3. **BuildSpec Completeness**: Generation requires complete, schema-valid BuildSpecs. Partial or missing BuildSpecs block generation.
4. **Named Range Scope**: Excel named range scope (workbook vs. sheet) affects reference resolution. Exact scope must be preserved.
