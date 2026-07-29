# V1 Architecture Selector Specification

**Status**: Draft
**Feature**: 004-v1-architecture-selector
**Depends on**: 001-evidence-ingestion, 002-plan-rule-model, 003-population-profile

## 1. Purpose

The V1 Architecture Selector consumes approved plan rules, an approved population profile, and case controls to produce a deterministic, auditable V1 calculation architecture: which tabs to include, which calculation runs/scenarios apply, and the complete field inventory with per-run I/O/B data-flow classification.

The architecture selector is the gateway between evidence/population inputs and the formula compiler/workbook builder. It must never silently omit a required tab, scenario, or field.

## 2. Scope

This feature covers:

- Scenario/run determination based on plan rules and population characteristics
- Tab selection based on approved population profile
- Field inventory construction with generic field names
- Per-run I/O/B classification (Input, Output, Both, Neither, calculated-from-another)
- CALC_INDICATOR and CALCULATION assignment
- Formula dependency graph construction
- Named range identification
- Deterministic, reproducible output from deterministic inputs

This feature does NOT cover:

- Formula compilation (Feature 006)
- Workbook generation (Feature 007)
- Validation and reconciliation (Feature 008)

## 3. User Stories

### US1: Determine Applicable Calculation Scenarios (P1)

**Goal**: Given approved plan rules and case controls, the system determines which calculation scenarios/runs apply to the case (e.g., DOR, NRD, ERD, EURD, DORNSF, QPSA, QPSALIAB, RBD, XRD).

**Independent Test**: Load a case with early-retirement and normal-retirement provisions; verify the system selects DOR, NRD, ERD scenarios and excludes QPSA; verify the selection is deterministic and reproducible.

### US2: Select Population Tabs (P1)

**Goal**: Given an approved population profile, the system selects which source tabs to include in the workbook, justified by population characteristics.

**Independent Test**: Load a case with Retirees and Separated Vesteds populations; verify both tabs are selected; load a case with only Retirees; verify only the Retirees tab is selected.

### US3: Build Field Inventory with I/O/B Classification (P1)

**Goal**: For each selected tab and run, the system produces the complete field inventory with generic field names and per-run I/O/B classification.

**Independent Test**: For a case with two tabs and three runs, verify every cell in the source workbooks is mapped to a generic field with correct I/O/B assignment per run; verify CALC_INDICATOR and CALCULATION fields are correctly classified.

### US4: Compute Formula Dependencies (P2)

**Goal**: The system computes the formula dependency graph showing which cells reference which other cells, enabling the formula compiler to produce correct output.

**Independent Test**: Load a workbook with a formula referencing another cell; verify the dependency graph captures this relationship; verify circular dependencies are detected and flagged.

### US5: Identify Named Ranges (P2)

**Goal**: The system identifies and catalogs named ranges from the source workbook that represent plan-level parameters (freeze dates, benefit factors, etc.).

**Independent Test**: Load a workbook with named ranges for Freeze_Date and Benefit_Factor; verify both appear in the architecture output with correct cell references.

## 4. Functional Requirements

### FR-001: Scenario Determination

- The system SHALL determine applicable scenarios from plan rules, case controls, and population characteristics
- The system SHALL NOT silently omit a required scenario
- The system SHALL record which plan rule or case control justified each scenario selection
- A plan-rule `absent` condition SHALL match only explicit governed negative evidence whose applicability condition uses the canonical value `absent` for that dimension. Omission of the dimension is unknown, does not match, and does not contribute to the run

### FR-002: Tab Selection

- The system SHALL select tabs based on the approved population profile
- The system SHALL NOT include tabs without approved population candidates
- The system SHALL record the population candidate that justifies each tab
- Selected population tabs SHALL be unique by NFC-, whitespace-, and case-normalized tab identity. Exact duplicate observations may deduplicate only when candidate/artifact lineage, workbook-profile hash, and tab content agree; otherwise the selector SHALL emit a deterministic `conflicting-provisions` blocker before field, cell, or named-range merging

### FR-003: Field Inventory

- The system SHALL produce a complete field inventory for each selected tab and run
- Each field SHALL have a generic field name (normalized across workbooks)
- Each field SHALL have a per-run I/O/B classification
- The field inventory SHALL be deterministic and reproducible

### FR-004: I/O/B Classification

- I (Input): Fields read from population data
- O (Output): Fields containing calculated results
- B (Both): Fields that are both input and output (e.g., CALC_INDICATOR)
- N (Neither): Fields with formulas that are neither direct input nor output
- P (calculated-from-another): Fields derived from other fields
- The system SHALL classify each field per run according to the approved rule set

### FR-005: CALC_INDICATOR Separation

- CALC_INDICATOR SHALL be a distinct concept identifying valuation or recalculation context
- CALC_INDICATOR SHALL have I/O/B = B
- CALC_INDICATOR SHALL NOT be conflated with the B I/O/B value (Constitution Section 7)

### FR-006: CALCULATION Separation

- CALCULATION SHALL be a distinct concept identifying a documented calculation run or scenario
- CALCULATION SHALL have I/O/B = N
- Additional codes or changed meanings require an approved contract (Constitution Section 7)

### FR-007: Deterministic Output

- The architecture selector SHALL produce deterministic output from deterministic inputs
- The same inputs SHALL always produce the same architecture
- The output SHALL be content-hashed for integrity verification
- Deterministic replay SHALL mean an equal `architectureContentSha256`; the serialized operational envelope is byte-identical only when `architectureId` and `builtAt` are also injected identically

### FR-008: Unresolved Item Emission

- When the architecture selector encounters ambiguous plan rules, conflicting population evidence, or missing required data, it SHALL emit an UnresolvedItem
- The architecture selector SHALL NOT silently resolve or conceal ambiguity

### FR-009: Authority Enforcement

- The system SHALL enforce the default authority order for scenario and tab selection
- Case-specific AuthorityOverride may alter this order only through an explicit approval record

### FR-010: Effective-Dated History

- The architecture selector SHALL model scenario applicability as effective-dated history
- It SHALL NOT collapse historical scenarios into a single current selection
- When multiple plan-rule trigger conditions contribute to a scenario, each emitted interval SHALL be the deterministic intersection of one applicable range for every condition; no run may begin before all conditions apply
- Distinct effective intervals SHALL have unique run IDs, exact contributor ID/hash arrays, and independent per-run classifications

### FR-011: Architecture Policy Approval

- Production policy loading and architecture building SHALL require a separate effective, non-revoked `ArchitecturePolicyApproval` human decision chain bound to the exact policy kind, version, parsed-content hash, source-file hash, and a hash-valid released EvidenceCatalog
- Embedded YAML review or intended-use metadata SHALL NOT authorize production; repository YAML SHALL remain provisional
- Approval, revocation, and supersession SHALL replay deterministically through a gapless, unbranched, predecessor-hash-bound chain

### FR-012: Population Governance Replay

- Builder population input SHALL include Feature 003 candidates, evidence observations, and candidate decision records
- The builder SHALL invoke `validatePopulationEvidence` and `replayPopulationCandidateDecisions` and SHALL reject missing, forged, revoked, mismatched, or tampered population approvals
- The effective population decision SHALL commit to the exact candidate key, source artifact hash, and deterministic workbook-profile content hash covering observed workbook content and named ranges; the builder SHALL recompute the profile hash rather than trust a caller assertion

### FR-013: Deterministic Lineage

- `V1Architecture` SHALL bind exactly four policy content/source hashes and approval decision IDs/hashes, EvidenceCatalog ID/hash, population candidate/artifact/workbook-profile/approval decision hashes, case-control IDs/hashes, and applicable AuthorityOverride IDs/hashes
- Architecture workspace serialization and `architectureContentSha256` SHALL preserve and cover this lineage
- Observed `Summary`, `Tables`, and `UD Table` sheets SHALL be explicit `SourceTab` records with role `support`, an approved workbook-profile hash, and null population candidate/artifact linkage; population-role tabs SHALL retain mandatory candidate/artifact linkage

## 5. Acceptance Scenarios

### AC-001: Basic Scenario Selection

- **Given**: A case with early retirement (age 55), normal retirement (age 65), and QDRO provisions
- **When**: The architecture selector runs
- **Then**: DOR, NRD, ERD scenarios are selected; QPSA is excluded; each selection is traceable to a plan rule

### AC-002: Tab Selection from Population

- **Given**: A population profile with approved Retirees and Separated Vesteds candidates
- **When**: The architecture selector runs
- **Then**: Both tabs appear in sourceTabs; no other tabs appear; each tab is traceable to a population candidate

### AC-008: Approved Workbook Profile Integrity

- **Given**: An approved population decision bound to the observed workbook profile and source artifact
- **When**: Workbook-only cell/sheet content or named ranges are changed without a new approval
- **Then**: Architecture building fails before selection because the recomputed workbook-profile hash no longer matches the effective decision

### AC-009: Split-Rule Historical Intervals

- **Given**: A scenario whose contributing plan-rule conditions have changing historical effective ranges
- **When**: The architecture selector runs
- **Then**: It emits one uniquely identified run per nonempty intersection, never emits a run before every condition applies, and preserves every contributor ID/hash on each interval

### AC-003: I/O/B Classification

- **Given**: A field "BSEX" (benefit sex) that is read from input data
- **When**: Classified for the DOR run
- **Then**: I/O/B = I; genericField = "BSEX"; the classification is deterministic

### AC-004: CALC_INDICATOR Classification

- **Given**: A field that identifies valuation vs. recalculation context
- **When**: Classified for any run
- **Then**: genericField = "CALC_INDICATOR"; I/O/B = B; the field is never conflated with other B values

### AC-005: Deterministic Replay

- **Given**: The same plan rules, population profile, and case controls
- **When**: The architecture selector runs twice
- **Then**: Both runs produce the same deterministic architecture content hash; full serialized records are byte-identical only when operational identifiers and timestamps are injected identically

### AC-006: Unresolved Item for Ambiguity

- **Given**: A plan rule with ambiguous effective date
- **When**: The architecture selector encounters the ambiguity
- **Then**: An UnresolvedItem is emitted with kind "ambiguous-text"; the architecture is not silently wrong

### AC-007: Missing Population Blocks Tab

- **Given**: A population profile with no approved candidates
- **When**: The architecture selector runs
- **Then**: No tabs are selected; the system reports the empty population as an error or unresolved item

## 6. Edge Cases

- **Empty population**: No tabs selected; error or unresolved item emitted
- **Conflicting plan rules**: Unresolved item emitted; architecture includes both interpretations until resolved
- **Historical scenarios**: Effective-dated scenario applicability preserved; no silent collapse
- **Hidden workbook sheets**: Hidden sheets excluded from tab selection unless explicitly justified
- **Formula circularity**: Detected and flagged as unresolved item; not silently resolved
- **Missing generic field mapping**: Unresolved item emitted for unmapped fields

## 7. Dependencies

- **Feature 001 (Evidence Ingestion)**: Provides evidence catalog with source artifacts
- **Feature 002 (Plan Rule Model)**: Provides approved plan rules with effective dates and applicability conditions
- **Feature 003 (Population Profile)**: Provides approved population candidates with observed fields
- **Feature 009 (Case Intake Normalization)**: Provides case workspace and intake pipeline
- **Constitution Section 6**: Population-driven design requirements
- **Constitution Section 7**: Separation of V1 concepts (CALC_INDICATOR, CALCULATION, I/O/B)
- **Constitution Section 14**: Workbook and generated-artifact invariants

## 8. Out of Scope

- Formula compilation and execution (Feature 006)
- Workbook file generation (Feature 007)
- Validation and reconciliation against reference workbooks (Feature 008)
- LLM-based scenario recommendation (deterministic only per Constitution Section 3)
