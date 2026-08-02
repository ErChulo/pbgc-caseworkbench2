# Feature Specification: Section 436 Evaluation

**Feature Branch**: `011-section-436-evaluation`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Implement the Section 436 evaluation and memo/report as a first-class governed feature."

## User Scenarios & Testing _(mandatory)_

### User Story 1 - Evaluate Section 436 Readiness (Priority: P1)

An authorized caseworker can determine whether the case has enough approved facts and rules to perform a Section 436 evaluation.

**Why this priority**: Section 436 must not be omitted or guessed when required facts or authority are missing.

**Independent Test**: Attempt a Section 436 evaluation with missing AFTAP evidence and verify that the result is blocked with missing-fact findings.

**Acceptance Scenarios**:

1. **Given** no approved AFTAP fact, **When** the evaluation runs, **Then** the evaluation is blocked and identifies AFTAP as missing.
2. **Given** provisional Section 436 rules, **When** the evaluation runs, **Then** no restriction conclusion is produced.

---

### User Story 2 - Produce Deterministic Evaluation Artifact (Priority: P1)

An authorized reviewer can produce a deterministic Section 436 evaluation artifact from approved facts, approved rules, and cited authority.

**Why this priority**: The final package must preserve how any Section 436 conclusion was reached.

**Independent Test**: Run the same approved facts and rules twice and verify identical deterministic hashes.

**Acceptance Scenarios**:

1. **Given** identical approved facts and rules, **When** the evaluation runs twice, **Then** the deterministic evaluation hash is identical.
2. **Given** a rule threshold changes, **When** the evaluation reruns, **Then** the deterministic evaluation hash changes.

---

### User Story 3 - Preserve Report Lineage (Priority: P2)

An authorized reviewer can include a Section 436 evaluation in the final package with citations, missing facts, and review status visible.

**Why this priority**: Any memo or report must be auditable and must not hide unresolved legal or actuarial issues.

**Independent Test**: Export a final package requiring Section 436 and verify that the package references the Section 436 evaluation artifact or blocks when it is missing.

**Acceptance Scenarios**:

1. **Given** a completed Section 436 evaluation, **When** the final package is exported, **Then** the package includes the evaluation reference and content hash.
2. **Given** no completed Section 436 evaluation, **When** the final package is exported, **Then** the Section 436 stage blocks completion.

### Edge Cases

- AFTAP is malformed or not a decimal percentage.
- A rule has no citation or is not human-approved.
- Multiple rules match the same fact pattern.
- No approved rule matches the supplied facts.
- A fact citation points to a quarantined or unapproved artifact.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-001**: The system MUST evaluate Section 436 only from supplied approved facts and approved rules.
- **FR-002**: The system MUST block the evaluation when required facts are missing, malformed, or not approved.
- **FR-003**: The system MUST block the evaluation when governing Section 436 rules lack citations or human approval.
- **FR-004**: The evaluation MUST preserve fact citations, rule citations, effective dates, and review status.
- **FR-005**: The evaluation MUST produce a deterministic content hash over its deterministic payload.
- **FR-006**: The evaluation MUST distinguish blocked, completed, and inconclusive outcomes.
- **FR-007**: The evaluation MUST NOT treat the imported legacy Section 436 web app or DOCX template as canonical unless a separate approval record designates its exact hash and purpose.
- **FR-008**: The evaluation MUST be included in the final casework package when Section 436 is required.

### Key Entities

- **Section 436 Fact**: A cited case fact needed for the evaluation, such as AFTAP or plan-year dates.
- **Section 436 Rule**: A cited approved rule that maps facts to a restriction conclusion.
- **Section 436 Evaluation**: The deterministic outcome artifact, including missing facts, matched rules, conclusion, citations, and content hash.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Missing required facts block 100% of attempted evaluations.
- **SC-002**: Identical approved inputs produce identical Section 436 evaluation hashes.
- **SC-003**: Evaluations with unapproved rules never produce completed conclusions.
- **SC-004**: Final output package readiness always shows Section 436 as ready, blocked, or not required.

## Assumptions

- Section 436 is required by default until a case records an approved non-applicability determination.
- This feature produces a deterministic evaluation artifact and Markdown report first; DOCX/PDF memo generation may consume the artifact later.
- Existing reference Section 436 materials are reference candidates only and do not become canonical automatically.
