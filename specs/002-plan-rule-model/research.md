# Research: Plan Rule Model

**Feature**: 002
**Updated**: 2026-07-29

## Decisions

### 1. Rule Identity

**Decision**: Deterministic UUIDs derived from SHA-256 content hashes. Rule content hash excludes mutable human/timestamp metadata.
**Rationale**: Repeatable identity across environments; content hash enables tamper detection.
**Alternatives considered**: Random UUIDs (not deterministic), counter-based IDs (not content-addressable).

### 2. Effective-Date Model

**Decision**: Each `PlanRuleRecord` carries `effectiveDate`, optional `endDate`, and optional `adoptionOrExecutionDate` as validated ISO date strings.
**Rationale**: Constitution requires effective-dated history without collapsing historical provisions.
**Alternatives considered**: Single-date rules (cannot model end dates), time ranges as objects (unnecessary complexity).

### 3. Supersession Chains

**Decision**: Ordinal-indexed `SupersessionLink[]` with predecessor ID/hash, effective date, and link type. Link types include initial, supersession, amendment, re-authoring, repeal, reinstate, and branch.
**Rationale**: Constitution requires traceability of rule history without silent collapse.
**Alternatives considered**: Flat replacement (loses history), tree-based (over-engineered for linear chains).

### 4. Applicability Conditions

**Decision**: Typed `ApplicabilityCondition[]` with dimension, value, and evidence citations. Six dimensions: participant-group, benefit-purpose, service-definition, actuarial-equivalence-purpose, freeze-or-restriction, amendment-period.
**Rationale**: Constitution requires that applicability conditions distinguish groups, events, purposes, and periods.
**Alternatives considered**: Free-text tags (not machine-checkable), flat string labels (no evidence linkage).

### 5. Authority Governance

**Decision**: Citations must reference released evidence artifacts; authority overrides authenticate case-specific deviations; rule authoring fails closed on invalid citations, unresolved items, or missing applicability.
**Rationale**: Constitution requires evidence traceability and human governance for all material rules.
**Alternatives considered**: Auto-approval (prohibited), implicit authority (prohibited).

### 6. Content Hashing

**Decision**: SHA-256 over canonical JSON of rule content, excluding mutable metadata (reviewer, timestamp).
**Rationale**: Enables deterministic verification, tamper detection, and downstream hash chains (Feature 005).
**Alternatives considered**: Including all fields (makes hash mutable on re-import), excluding hash from record (not self-verifying).

### 7. Unresolved Items

**Decision**: Unresolved items block rule authoring. Items track competing interpretations, consequence, resolution history, and revision chains.
**Rationale**: Constitution prohibits silently resolving or concealing ambiguity.
**Alternatives considered**: Warning-only unresolved items (constitution violation), deferred resolution (blocks downstream).
