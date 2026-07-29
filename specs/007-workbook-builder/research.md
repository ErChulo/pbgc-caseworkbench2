# Research: Workbook Builder

**Feature**: 007
**Updated**: 2026-07-29

## Decisions

### 1. Workbook Generation Model

**Decision**: Consume BuildSpec v2 and population profile; emit deterministic XLSX workbook without formula execution or runtime evaluation.
**Rationale**: Constitution requires deterministic, reproducible generation. Formula execution belongs to external systems (ValTool, Runtime). Generation must be repeatable from same inputs.
**Alternatives considered**: Executing formulas during generation (violates determinism, creates external dependencies), generating multiple workbook formats (over-engineered).

### 2. Schema and Structure

**Decision**: Generated workbooks follow a defined structural contract with required support sheets (Summary, Tables, UD Table), formula sheets, and data sheets. No prohibited legacy structures (e.g., mySort) are generated.
**Rationale**: Constitution section 14 requires structural invariants. Support sheets preserve lineage and governance evidence for independent reconciliation.
**Alternatives considered**: Free-form sheets (breaks validation), mixing support and data sheets (reduces clarity).

### 3. Formula Preservation

**Decision**: Formulas are copied exactly from BuildSpec without reordering, simplification, or optimization. Formula dependencies follow BuildSpec execution order. Named range references use exact scope and case.
**Rationale**: Constitution requires that formulas match their governance record. Reordering or simplifying would invalidate formula approval.
**Alternatives considered**: Optimizing formulas (breaks traceability), auto-simplifying (violates Constitution).

### 4. Population Data Mapping

**Decision**: I/B cells are populated from population sources identified in BuildSpec cell mappings. Missing or inaccessible sources block workbook generation. Data is never invented or imputed.
**Rationale**: Constitution prohibits inventing participant data. Population sources must be validated and complete.
**Alternatives considered**: Leaving I cells blank (breaks calculations), guessing data sources (violates governance), using default/zero values (prohibited).

### 5. Content Hashing

**Decision**: Workbook content hash is deterministic SHA-256 over canonical workbook structure, excluding mutable import/export metadata and runtime values.
**Rationale**: Enables tamper detection, reproducibility verification, and downstream reconciliation binding.
**Alternatives considered**: Including all cells (not reproducible across systems), excluding formulas (breaks verification).

### 6. Validation Strategy

**Decision**: All validation errors are reported before workbook creation. Missing data sources, broken references, cycles, and schema violations all block generation together.
**Rationale**: Constitution requires fail-closed behavior. Partial workbooks are never generated.
**Alternatives considered**: Generating despite warnings (violates Constitution), silently skipping invalid cells (loses data).

### 7. Support Sheet Lineage

**Decision**: Support sheets (Summary, Tables, UD Table) embed complete BuildSpec lineage, plan rules with citations, population profile binding, formula governance, approval decisions, and validation state. This enables independent reconciliation without parsing formulas.
**Rationale**: Constitution requires traceability and audit evidence. Support sheets serve as the reconciliation oracle.
**Alternatives considered**: Generating formula-only workbooks (loses governance trail), embedding metadata in sheet comments (fragile, not machine-readable).

### 8. No Manual Patching

**Decision**: Workbooks are generated artifacts. All corrections go back to the generator (BuildSpec, formula governance, population profile). Manual patching in the workbook is never allowed.
**Rationale**: Constitution section 12 requires that generated workbooks be fixed by changing the generator. Manual changes would break traceability and reproducibility.
**Alternatives considered**: Allowing manual corrections (breaks reproducibility), generating "template" workbooks for manual completion (violates determinism).
