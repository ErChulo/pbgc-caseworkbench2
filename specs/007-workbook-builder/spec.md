# Feature Specification: Workbook Builder

**Feature Branch**: `007-workbook-builder`
**Created**: 2026-07-18
**Last governed update**: 2026-07-29
**Status**: Planning; not yet implemented

## Purpose

Generate V1 workbooks from a governed BuildSpec (Feature 005) and population profile (Feature 003). Workbooks are deterministic, schema-valid Excel artifacts containing support sheets (Summary, Tables, UD Table), formula cells, named ranges, cell mappings, and validation evidence. Generated workbooks are fixed by correcting their generator, never by manual patching.

## User Stories

### US1 - Generate deterministic V1 workbook (P1)

Given a valid BuildSpec and population profile, produce a byte-equivalent V1 workbook with all required support sheets, formulas, named ranges, and mappings.

Acceptance:

1. Repeated identical inputs produce byte-identical workbooks.
2. Workbooks contain only schema-valid named structures.
3. Support sheets (Summary, Tables, UD Table) exist and are populated per contract.
4. Formula cells match BuildSpec with exact dependencies and execution order.
5. Cell mappings drive input population data into I cells.
6. Workbook content hash is deterministic.

### US2 - Validate workbook integrity (P1)

Generation rejects invalid BuildSpecs, incomplete population profiles, or structural violations.

Acceptance:

1. Missing or incomplete BuildSpec data blocks generation.
2. Unsatisfied population data sources block generation.
3. Broken references, undefined named ranges, or duplicate names are rejected.
4. Execution order cycles are rejected.
5. All errors are reported together before workbook creation.

### US3 - Preserve formula semantics (P1)

Workbook formulas preserve exact BuildSpec semantics without reordering, simplification, or re-optimization.

Acceptance:

1. Formula text matches BuildSpec exactly.
2. Formula target cells (A1 notation) are canonical and preserved.
3. Dependencies are preserved in execution order.
4. Named range references use exact scope and case.
5. External and missing dependencies are reported without silent fallback.

### US4 - Enable reconciliation and validation (P2)

Workbooks embed validation metadata, lineage, and oracle IDs for independent reconciliation.

Acceptance:

1. Support sheets preserve complete BuildSpec lineage.
2. Formula approval decisions and regeneration impact are visible.
3. Validation errors and warnings are recorded.
4. Oracle IDs enable cross-system reconciliation.

## Functional Requirements

- **FR-001** Consume `BuildSpecV2` and `PopulationProfile` and emit deterministic XLSX workbook.
- **FR-002** Generate support sheets: Summary (metadata), Tables (plan rules), UD Table (user-defined ranges/mappings).
- **FR-003** Populate formula cells with exact BuildSpec formulas in execution order.
- **FR-004** Generate named ranges from BuildSpec with exact scope, name, and target.
- **FR-005** Populate I cells from population data sources; validate sources exist and are accessible.
- **FR-006** Reject workbook generation if any required data source is missing or validation fails.
- **FR-007** Compute deterministic workbook content hash excluding mutable metadata.
- **FR-008** Preserve complete lineage: architecture ID/hash, build spec ID/hash, population ID/hash.
- **FR-009** Record formula governance, approval decisions, affected tests, and oracle IDs.
- **FR-010** Never invent cells, formulas, names, or data.
- **FR-011** Emit only schema-valid, referenceable XLSX structure.

## Success Criteria

- Generated workbooks pass structural validation against workbook schema.
- Identical inputs produce byte-identical outputs.
- Formulas execute in deterministic order without cycles.
- Population data mapping works for all I/B cells.
- Support sheets contain complete lineage and governance evidence.
- No manual patching is required; all corrections go back to the generator.

## Out of Scope

- Formula execution or result calculation
- Workbook UI/UX or formatting aesthetics
- External workbook execution (ValTool, Runtime, etc.)
- Participant-level benefit calculation
- Real workbook distribution or deployment
