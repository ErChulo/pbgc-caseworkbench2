# Feature Specification: Plan Rule Model

**Feature Branch**: `002-plan-rule-model`
**Created**: 2026-07-18
**Last governed update**: 2026-07-29
**Status**: Implemented; documentation in progress

## Purpose

Transform evidence ingestion candidates into an effective-dated, traceable plan-rule model. Rules preserve source citations, effective dates, supersession history, applicability conditions, and human governance. The model serves as the authoritative foundation for architecture selection and formula governance.

## User Stories

### US1 - Author governed plan rules (P1)

Given evidence candidates and human approval, generate a deterministic `PlanRuleRecord` with complete provenance, effective-date history, supersession relationships, and applicability conditions.

Acceptance:

1. Every rule has primary and supporting citations traceable to evidence artifacts.
2. Effective date, end date, and adoption/execution dates are validated ISO dates.
3. Supersession chains preserve predecessor relationships, effective dates, and link types.
4. Applicability conditions document participant groups, benefit purposes, service definitions, actuarial-equivalence purposes, freezes, and restrictions.
5. Authority overrides are resolved and recorded when evidence requires them.
6. Human approval status, reviewer, and rationale are recorded.

### US2 - Validate rule governance (P1)

Generation rejects incomplete rules, unresolved items, missing applicability, invalid citations, and stale or unauthorized evidence.

Acceptance:

1. Rules must have exactly one primary citation backed by a proposed candidate.
2. All linked unresolved items must be resolved or explicitly approved.
3. Authority overrides are authenticated against case-specific policies.
4. Evidence catalog integrity is validated.
5. Rule content hash is deterministically computed and verified on import.

### US3 - Track supersession and applicability (P1)

Rules maintain complete effective-dated history and applicability conditions without collapsing historical provisions.

Acceptance:

1. Supersession chains record initial, amendment, re-authoring, repeal, and reinstate transitions.
2. Each rule may have an optional effective end date.
3. Applicability conditions distinguish participant groups, benefit purposes, service definitions, actuarial-equivalence purposes, freezes, and restrictions.
4. Identical rule names in different time periods or participant groups remain distinct.

## Functional Requirements

- **FR-001** Deterministically author `PlanRuleRecord` from evidence candidates with complete provenance.
- **FR-002** Preserve primary and supporting citations with artifact hash, locator, source role, and provision identifier.
- **FR-003** Validate and record effective date, end date, and adoption/execution date as ISO dates.
- **FR-004** Build supersession chains preserving predecessor ID/hash, effective date, and link type.
- **FR-005** Enforce exactly one released primary citation.
- **FR-006** Record human reviewer, approval status, and approval rationale.
- **FR-007** Authenticate authority overrides and record override ID when required.
- **FR-008** Validate rule against unresolved items; reject if linked items are unresolved.
- **FR-009** Compute deterministic SHA-256 rule content hash.
- **FR-010** Document applicability conditions with dimension, value, and evidence citations.
- **FR-011** Reject rules with missing applicability dimensions or empty affected scope.
- **FR-012** Record rule set version and schema version.

## Success Criteria

- `PlanRuleRecord` implements all required fields and validates deterministically.
- Rules are accepted by Feature 004 (V1 Architecture Selector) for scenario/run justification.
- Supersession relationships are preserved without history collapse.
- Unit, integration, and governed-fixture tests pass.
- All rules are human-approved with complete governance records.

## Out of Scope

- UI for rule authoring (Feature 009 covers case intake)
- Candidate extraction (Feature 001)
- Architecture selection (Feature 004)
- Workbook generation
- External policy services
