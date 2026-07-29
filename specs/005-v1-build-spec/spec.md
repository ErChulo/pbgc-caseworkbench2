# Feature Specification: Governed V1 Build Specification

**Feature Branch**: `005-v1-build-spec`
**Created**: 2026-07-28
**Last governed update**: 2026-07-29
**Status**: Implemented and tested; ready for human approval

## Purpose

Transform an authenticated Feature004 `V1Architecture` into a deterministic, schema-valid BuildSpec `2.0.0` accepted by Feature006 `compileBuildSpec`. The BuildSpec is a fail-closed compiler handoff, not a formula-authoring or workbook-generation surface.

## User Stories

### US1 - Generate the compiler handoff (P1)

Given a hash-valid, semantically valid governed architecture and explicit formula governance, generation produces deterministic formulas, exact named ranges, exact per-run cell mappings, a deterministic execution order, and a valid BuildSpec content hash.

Acceptance:

1. Repeated identical governed inputs produce identical BuildSpec payloads, identities, and hashes.
2. BuildSpec `schemaVersion` is exactly `2.0.0`; v1 output is prohibited.
3. Every observed nonempty formula cell classified `O` or `B` has one formula and one exact mapping.
4. `B` retains both its formula and population input data source.
5. `CALC_INDICATOR`, `CALCULATION`, and I/O/B remain distinct and unchanged.
6. The generated BuildSpec completes `compileBuildSpec` for the synthetic governed integration case.

### US2 - Fail closed with aggregated diagnostics (P1)

Generation rejects the complete input rather than emitting a partial trusted BuildSpec when architecture authentication, formula governance, mappings, dependencies, ranges, provenance, or execution ordering are invalid.

Acceptance:

1. Architecture contract, semantic, lineage, and content-hash failures are reported.
2. Missing/empty observed formulas, non-O/B formula classifications, duplicate ranges/mappings/formulas, missing data sources, unsatisfied/external dependencies, and cycles are reported together where possible.
3. Formula governance must resolve to exactly one architecture-justified human-approved governing plan rule with no unresolved items.
4. Citations, effective applicability, supersession, confidence, review status, affected tests, regeneration impact, approval identity, and independent validation oracles are preserved, never invented.

### US3 - Export and import safely (P2)

BuildSpecs are exported and imported only after schema and embedded/content hash verification. Export/import actor and clock metadata are injected operational metadata and are not part of deterministic BuildSpec identity.

Acceptance:

1. Export rejects schema-invalid, validation-invalid, or hash-invalid BuildSpecs.
2. Import rejects malformed, v1, schema-invalid, or tampered payloads.
3. Successful import returns the byte-equivalent BuildSpec and separate verified operational metadata.

## Functional Requirements

- **FR-001** Re-authenticate the Feature004 architecture by replaying the supplied original governed policy files/approvals, evidence catalog, population observations/decisions/workbook profiles, case controls, plan rules, authority overrides, semantic construction, and architecture content hash. Reject self-consistent recomputed forgeries.
- **FR-002** Require explicit `FormulaGovernanceInput` with gapless hash-bound `FormulaApprovalRecord` decision chains; no default provenance or approval data may be synthesized.
- **FR-003** Generate formulas only for observed nonempty formula cells with `O`/`B` classifications.
- **FR-004** Generate deterministic collision-safe formula IDs from exact run and architecture cell identities.
- **FR-005** Declare formula-to-formula dependencies only from `architecture.formulaDependencies`; substring matching is prohibited.
- **FR-006** Preserve exact formula target tab, cell, generic field, scenario, I/O/B, formula text, and classification justification.
- **FR-007** Generate only architecture-provided named ranges, preserving exact name, target, scope, generic-field identity, and architecture provenance.
- **FR-008** Generate one exact mapping per applicable cell/run and deterministic collision-safe UUID mapping identity.
- **FR-009** Preserve every I/O/B value. `I` and `B` require an exact population source; `O` and `B` require an exact formula; `B` requires both.
- **FR-010** Use deterministic Kahn ordering with lexical tie-breaking, deterministic cycle nodes, level count, and maximum depth.
- **FR-011** Aggregate missing formulas, duplicate identities, unsatisfied dependencies, provenance defects, mapping mismatches, missing data sources, and cycles.
- **FR-012** Validate BuildSpec against the Draft 2020-12 BuildSpec `2.0.0` schema before returning, exporting, and importing.
- **FR-013** Compute SHA-256 over the canonical deterministic payload without the self-hash or operational import/export metadata.
- **FR-014** Keep generated/validated lineage timestamps stable from the governed architecture; inject operational export/import clock and actor metadata separately.
- **FR-015** Never infer dependencies, plan-rule authority, approval, tests, regeneration impact, validation oracles, participant values, or missing data.

## Success Criteria

- Generated BuildSpecs validate as `2.0.0` and are accepted by `compileBuildSpec`.
- Identical governed inputs produce identical payloads and hashes.
- All fail-closed validation paths return deterministically sorted aggregated errors.
- Unit, contract, deterministic regression, and Feature005-to-Feature006 integration tests pass.

## Out of Scope

- Formula parsing, canonical emission, or execution
- Workbook generation or external Excel/ValTool/Runtime execution
- UI
- Network persistence
