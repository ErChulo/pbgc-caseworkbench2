# Feature Specification: Plan-Rule Model

**Feature Branch**: `002-plan-rule-model`  
**Created**: 2026-07-30  
**Status**: Specification in progress  
**Version**: 1.0.0

## Purpose

Ingest, author, govern, and apply plan-specific actuarial rules with full provenance tracking. Rules are versioned, superseded, and effective-dated. Every rule retains its source document, approval authority, and audit trail per Constitution §4 and §8.

## User Stories

### US1 - Ingest plan rules from authoritative sources (P1)

Plan administrators ingest rules from executed plan documents, legal determinations, or policy decisions. Rules are recorded with precise source citations (document, locator, effective date).

Acceptance:
1. Rules can be ingested from JSON/structured format
2. Each rule captures: statement, effective date, end date (optional), applicability condition, primary citation
3. Source citations include: source type, document locator, citation date
4. Rules are immutable once recorded

### US2 - Author and approve new rules (P1)

Authorized plan administrators can draft new rules, submit for approval, and record approval decisions with rationale and supporting evidence.

Acceptance:
1. Rules can be authored via API with all required fields
2. Rules exist in "draft" state until approved
3. Approver records: approval authority, timestamp, rationale, evidence links
4. Single designated approver per case (configurable by case)
5. Approval creates immutable record with approver identity

### US3 - Version and supersede rules (P1)

When a rule changes, a new version is created. Old versions are marked superseded. Effective-date transitions are traceable.

Acceptance:
1. Each rule has semantic version (major.minor.patch)
2. Supersession links connect old → new version
3. Rules can be queried by effective date
4. Historical rule versions are preserved for audit

### US4 - Query rules by applicability (P1)

Given a participant classification, return all rules that apply. Support date-based queries (rules effective on date X).

Acceptance:
1. `rulesEffectiveOn(date)` returns rules in effect on that date
2. `rulesApplicableTo(classification)` returns rules matching classification
3. Queries return deterministic, sorted results
4. Queries are computationally lightweight

### US5 - Record audit trail and governance decisions (P2)

All rule changes, approvals, and effective-date transitions are recorded with actor, timestamp, and rationale.

Acceptance:
1. Audit log captures: action (created, approved, superseded), actor, timestamp, rationale
2. Audit log is immutable and complete
3. Audit log supports queries: auditLog(ruleId) returns all events for rule

### US6 - Validate rule applicability against population (P2)

Before workbook generation, verify that all applicable rules are included and no rules are orphaned.

Acceptance:
1. Population classification matches rule applicability conditions
2. No participant has zero applicable rules (unless explicitly exempted)
3. Validation produces clear error messages for mismatches

## Functional Requirements

- **FR-001** Ingest rules from structured sources with complete provenance
- **FR-002** Support rule authoring with draft/approval workflow
- **FR-003** Enforce single designated approver per case
- **FR-004** Track rule supersession and effective-date transitions
- **FR-005** Preserve immutable audit trail for all rule actions
- **FR-006** Support deterministic queries by effective date and applicability
- **FR-007** Validate rule completeness for population classifications
- **FR-008** Prevent orphaned rules and unclassified participants
- **FR-009** Record approval authority, timestamp, and rationale
- **FR-010** Support rule versioning (semantic) with version history

## Success Criteria

- Rules are authored, approved, and versioned with full governance
- Rule changes are traceable to approver and evidence
- Population applicability is validated deterministically
- Audit trail is complete and immutable
- Rules integrate with Feature 003 (Population Profile) and Feature 005 (BuildSpec)

## Out of Scope

- Interactive rule editor UI
- Bulk rule import from Excel
- Rule conflict resolution
- Historical rule simulation (applying old rules to current population)
- Multi-approver workflows

## Data Model

### PlanRule

```typescript
interface PlanRule {
  readonly ruleId: Uuid
  readonly statement: string
  readonly effectiveDate: string (YYYY-MM-DD)
  readonly endDate?: string (YYYY-MM-DD, optional)
  readonly applicability: string
  readonly primaryCitation: Citation
}
```

### Citation

```typescript
interface Citation {
  readonly sourceType: "plan-document" | "legal-opinion" | "board-decision" | "policy"
  readonly locator: string
  readonly date: string
  readonly url?: string
}
```

### RuleVersion

```typescript
interface RuleVersion {
  readonly ruleId: Uuid
  readonly version: string (semantic)
  readonly createdAt: UtcTimestamp
  readonly createdBy: UserId
  readonly statement: string
  readonly supersedes?: RuleVersionId
  readonly supersededBy?: RuleVersionId
  readonly approvalDecision?: ApprovalDecision
}
```

### ApprovalDecision

```typescript
interface ApprovalDecision {
  readonly ruleVersionId: RuleVersionId
  readonly approvedBy: UserId
  readonly approvedAt: UtcTimestamp
  readonly status: "approved" | "rejected" | "pending-review"
  readonly rationale: string
  readonly evidence: readonly string[] (URLs, document hashes)
}
```

### AuditLog

```typescript
interface AuditEvent {
  readonly eventId: Uuid
  readonly ruleId: Uuid
  readonly action: "created" | "approved" | "rejected" | "superseded" | "effective-dated"
  readonly actor: UserId
  readonly timestamp: UtcTimestamp
  readonly rationale: string
  readonly metadata: Record<string, unknown>
}
```

## Constitutional Compliance

- **§3** Deterministic computation: rule application is deterministic, no LLM used
- **§4** Evidence traceability: every rule traces to source, approval, and audit
- **§8** Human review: all rules require explicit approval with recorded rationale
- **§12** Reproducibility: rules are versioned, deterministically hashed, and queried by date

No constitutional exception required.

## Verification Commands

`npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test` (focused Feature 002 unit tests)
