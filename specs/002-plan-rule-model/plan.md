# Implementation Plan: Plan-Rule Model

**Feature**: 002 Plan-Rule Model  
**Date**: 2026-07-30  
**Status**: Planning complete; implementation ready

## Summary

Feature 002 implements deterministic plan-rule ingestion, authoring, versioning, and governance. Rules are immutable once recorded, versioned semantically, and superseded explicitly. Audit trails are complete. Single designated approver per case enforces governance per Constitution §8.

## Technical Context

- TypeScript 6 strict mode
- Web Crypto for deterministic hashing
- Input: Plan documents, rule statements, applicability conditions
- Output: `PlanRule`, `RuleVersion`, `ApprovalDecision`, `AuditLog`
- Consumers: Feature 003 (Population Profile), Feature 005 (BuildSpec), validation workflows
- Integration: Rules → Population classification → BuildSpec generation

## Architecture

```text
Rule Ingestion ──┐
Rule Authoring ──┼──> Rule Engine ──> Rule Versioning ──> Approval Gate ──> AuditLog
Rule Query ──────┤
                 └──> Deterministic Hashing & Storage
```

## Implementation Decisions

1. Single approver per case; configurable per case initialization
2. Rules are immutable after creation; modifications create new versions
3. Supersession is explicit; no automatic version replacement
4. Audit trail is append-only; no modification or deletion
5. Effective-date queries return deterministic, sorted results
6. Rule applicability is deterministic based on classification patterns
7. All rule operations produce deterministic hashes for reproducibility

## Project Structure

```text
web/src/domain/plan-rules/
├── models.ts
├── rule-engine.ts
├── rule-authoring.ts
├── rule-versioning.ts
├── rule-approval.ts
├── rule-query.ts
├── audit-log.ts
└── validation.ts

web/tests/unit/domain/plan-rules/
├── rule-engine.test.ts
├── rule-authoring.test.ts
├── rule-versioning.test.ts
├── rule-approval.test.ts
├── rule-query.test.ts
└── audit-log.test.ts

web/tests/integration/
└── plan-rules-integration.test.ts
```

## Constitution Check

| Requirement | Result |
|---|---|
| Deterministic computation | Pass: rule application is deterministic; no LLM |
| Evidence traceability | Pass: complete metadata (source, approval, audit) |
| Human review | Pass: all rules require explicit approval with rationale |
| Immutability | Pass: rules immutable; versions track changes |
| Reproducibility | Pass: deterministic versioning and hashing |
| Audit trail | Pass: append-only audit log with actor/timestamp |

No constitutional exception required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, focused Feature 002 unit tests, Feature 002 integration tests, `npm test`.

## Implementation Tasks

### Phase 1: Core Models (1 day)
- T001: Create `web/src/domain/plan-rules/models.ts` with `PlanRule`, `RuleVersion`, `ApprovalDecision`, `AuditEvent`
- T002: Define deterministic hashing for rules and versions
- T003: Create type guards and validators for rule structure

### Phase 2: Rule Engine & Authoring (1.5 days)
- T004: Implement `rule-engine.ts` with rule creation and storage
- T005: Implement `rule-authoring.ts` with draft workflow
- T006: Validate rule statements and applicability conditions
- T007: Create unit tests (8-10 tests)

### Phase 3: Versioning & Approval (1.5 days)
- T008: Implement `rule-versioning.ts` with semantic versioning
- T009: Implement `rule-approval.ts` with single-approver validation
- T010: Record approval decisions with rationale and evidence
- T011: Create unit tests (8-10 tests)

### Phase 4: Query & Audit (1.5 days)
- T012: Implement `rule-query.ts` with date and applicability queries
- T013: Implement `audit-log.ts` append-only logging
- T014: Support audit queries by rule or actor
- T015: Create unit tests (8-10 tests)

### Phase 5: Validation & Integration (1 day)
- T016: Implement population applicability validation
- T017: Create integration test (5+ scenarios)
- T018: Verify deterministic hashing across all operations
- T019: Test rule query performance

### Phase 6: Quality Gate (0.5 days)
- T020: Run typecheck, lint, format checks
- T021: Run full test suite (30+ tests)
- T022: Verify constitution compliance
- T023: Update documentation

**Total Estimated Effort**: 6-7 days

## Dependencies

Feature 002 is foundational. Feature 003 (Population Profile) depends on Feature 002 for rule applicability mapping. Feature 005 (BuildSpec) consumes Feature 002 rules to generate formula logic.

No blocking external dependencies; Feature 002 is self-contained.
