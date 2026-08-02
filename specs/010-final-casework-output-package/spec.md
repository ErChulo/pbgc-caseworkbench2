# Feature Specification: Final Casework Output Package

**Feature Branch**: `010-final-casework-output-package`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Build the final end-user casework output package in the same order as the identified gap plan."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - See Final Package Readiness (Priority: P1)

An authorized caseworker can see whether a case is ready to produce the final V1 casework package and which required stages still block completion.

**Why this priority**: The caseworker needs a direct answer about final deliverables, not another intermediate intake-only status.

**Independent Test**: Open a case with only intake evidence completed and verify that the final package screen lists every required downstream stage and blocks completion without inventing missing artifacts.

**Acceptance Scenarios**:

1. **Given** a case has an evidence manifest but no workbook, **When** the caseworker views final package readiness, **Then** the workbook, validation, and Section 436 stages are shown as blocking.
2. **Given** a required artifact is missing, **When** a package is exported, **Then** the package records the blocker instead of substituting a placeholder result.

---

### User Story 2 - Export Governed Output Manifest (Priority: P1)

An authorized caseworker can export a deterministic package manifest that references the generated workbook, BuildSpec, compiled formulas, validation evidence, unresolved items, lineage, and maturity labels.

**Why this priority**: The final package is the user-visible output boundary for the case and must be reproducible from recorded inputs.

**Independent Test**: Export the package twice from the same governed inputs and verify identical deterministic payload hashes while operational export metadata remains separate.

**Acceptance Scenarios**:

1. **Given** identical governed inputs, **When** the package is exported twice, **Then** the deterministic payload hash is unchanged.
2. **Given** a later export actor or timestamp differs, **When** the deterministic payload is compared, **Then** the operational metadata difference does not change the payload hash.

---

### User Story 3 - Preserve Honest Maturity Claims (Priority: P2)

An authorized reviewer can see the maturity level for every output artifact without overclaiming human approval, independent validation, or external execution.

**Why this priority**: The constitution prohibits unsupported maturity claims and false external-execution claims.

**Independent Test**: Export a package that has no external execution evidence and verify that no ValTool, Runtime, ATPBGC, BCV, or external execution maturity is claimed.

**Acceptance Scenarios**:

1. **Given** no recorded external execution, **When** the package is created, **Then** no external execution claim appears.
2. **Given** validation evidence exists but no independent oracle is supplied, **When** maturity is displayed, **Then** the stage is not labeled independently validated.

### Edge Cases

- A case has no active workspace or no authoritative case identity.
- A case has intake evidence but plan rules remain synthetic preview data only.
- A population candidate is proposed but not approved.
- A generated workbook exists without validation or reconciliation evidence.
- A Section 436 evaluation is required but facts or approved rules are missing.
- A prior package export exists and a new export has different operational metadata.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST represent the final casework output package as a deterministic payload with separate operational metadata.
- **FR-002**: The package MUST identify the case, required output stages, artifact references, unresolved items, lineage, and maturity claims.
- **FR-003**: The package MUST include readiness states for evidence, plan rules, population profile, V1 architecture, BuildSpec, compiled formulas, workbook, validation/reconciliation, and Section 436 when required.
- **FR-004**: Missing required stages MUST produce explicit blockers and MUST NOT be replaced with fabricated artifacts or successful status.
- **FR-005**: The package MUST reference generated artifacts by identity, content hash, media type, and storage path where available.
- **FR-006**: The deterministic package hash MUST exclude export actor, export timestamp, UI state, and storage transport metadata.
- **FR-007**: Maturity labels MUST be limited to evidence-supported levels defined by the constitution.
- **FR-008**: The package MUST NOT claim external execution unless an external execution artifact is supplied and identified.
- **FR-009**: Exporting a blocked package MUST remain allowed only as a status/report artifact; it MUST visibly state the package is blocked.
- **FR-010**: The package MUST preserve unresolved items and downstream consequences instead of hiding them in final status labels.

### Key Entities

- **Final Casework Output Package**: The deterministic case output manifest and operational export envelope.
- **Output Stage**: A required or optional stage with readiness, blockers, artifact hashes, and maturity level.
- **Artifact Reference**: A content-addressed pointer to a generated or governed artifact.
- **Maturity Claim**: A constitution-aligned claim about the evidence level achieved by an artifact or stage.
- **Lineage Edge**: A source-to-target relationship showing how an output artifact was derived.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: A caseworker can determine within one screen whether the final casework package is complete or blocked.
- **SC-002**: Identical deterministic inputs produce identical package content hashes in automated tests.
- **SC-003**: Missing required artifacts produce explicit blockers for 100% of required output stages.
- **SC-004**: Exported package manifests never include unsupported external execution or human approval claims.
- **SC-005**: Contract validation rejects malformed package manifests and accepts schema-valid blocked and complete package manifests.

## Assumptions

- The first package implementation may export a blocked package report before all downstream artifacts are available.
- Generated workbook bytes are stored separately; the final package references them by hash rather than embedding workbook content.
- Real participant PII is not included in the package manifest.
- Section 436 is treated as required until the case explicitly records that it is not applicable.
