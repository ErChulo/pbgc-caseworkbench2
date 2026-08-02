# PBGC CaseworkBench 2.0 - Technical Appendix

**Audience:** Caseworkers, reviewers, supervisors, technical support
**Purpose:** Explain the technical words used by the app in plain language
**Last updated:** 2026-08-02

This appendix explains the technical terms that appear in PBGC CaseworkBench 2.0. It is written for non-technical users first, with additional technical notes where helpful.

Important: This appendix uses synthetic examples only. Do not put real participant PII in documentation, examples, screenshots, logs, fixtures, or Git.

---

## 1. Local-First Operation

### Simple Meaning

The app runs on your computer and stores case records in the workspace folder you select.

### Why It Matters

Real case files and participant data must stay local. The app is designed so that case processing does not need a remote server.

### Technical Notes

- The selected workspace is the production source of record.
- Browser-private storage is not the authoritative record.
- The app uses local file access where the browser supports it.
- The production runtime is designed to avoid outbound network paths.

---

## 2. Workspace

### Simple Meaning

A workspace is the local folder where the app stores case files, case records, preserved objects, reviews, and exports.

### Example

Synthetic example path:

```text
C:\PBGC-Workspace\
```

### Technical Notes

A typical workspace may contain folders similar to:

```text
case-index.json
cases/
objects/
receipts/
attempts/
reviews/
exports/
```

Do not manually edit these records unless a documented recovery procedure says to do so.

---

## 3. Case Identity

### Simple Meaning

A case has a permanent internal ID and may also have an official PBGC case number.

### Why There Are Two IDs

| ID | Meaning |
| --- | --- |
| Internal case UUID | App identity that never changes. |
| Authoritative case ID | Official PBGC case number for production work. |

### Technical Notes

- The app prevents silent duplicate production case creation.
- A duplicate case number creates a collision workflow.
- Test, training, and duplicate-investigation cases require explicit rationale.

---

## 4. SHA-256

### Simple Meaning

SHA-256 is a fingerprint for exact file content.

If two files have the same SHA-256 value, they have the same exact bytes. If even one byte changes, the SHA-256 value changes.

### Example

Synthetic example hash:

```text
aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

### Why It Matters

The app uses SHA-256 to:

- Identify exact duplicates.
- Preserve files under content-addressed paths.
- Link decisions to exact bytes.
- Prove when a file changed.

### Technical Notes

- SHA-256 values are lowercase 64-character hexadecimal strings.
- A same-name file is not necessarily the same file.
- A same-hash file is exact-byte identical.
- Release inheritance is allowed only for exact same-hash content under governed rules.

---

## 5. Artifact

### Simple Meaning

An artifact is a file or extracted member the app tracks.

### Common Artifact Roles

| Role | Meaning |
| --- | --- |
| Submitted file | A file directly selected by the user. |
| Submitted container | A file such as a ZIP that may contain other files. |
| Extracted member | A file extracted from a container. |

### Technical Notes

Each artifact has:

- Artifact ID.
- Receipt ID.
- SHA-256 hash.
- Processing status.
- Downstream eligibility state.

---

## 6. Snapshot

### Simple Meaning

A snapshot records what files were selected during an intake attempt.

### Why It Matters

Snapshots let the app tell whether a package is unchanged, changed, interrupted, or resumed.

### Technical Notes

- Snapshot identity is content-derived.
- Operational IDs and timestamps do not change the deterministic snapshot identity.
- If the selected package changes, the app records a linked divergence instead of silently overwriting history.

---

## 7. Manifest

### Simple Meaning

A manifest is the exported record of what the app processed and what review decisions were made.

### What It Contains

A manifest may include:

- Case metadata.
- Artifact inventory.
- Screening and quarantine status.
- Classification decisions.
- Relationship decisions.
- Population review decisions.
- Validation results.
- Lineage records.
- Deterministic hashes.

### Technical Notes

- A manifest is machine-readable JSON.
- It has a deterministic content hash.
- Do not manually edit the manifest.
- If manifest data is wrong, correct the underlying case state and export again.

---

## 8. Lineage

### Simple Meaning

Lineage is a trace from a result back to the source file and decision that created it.

### Example

Synthetic lineage chain:

```text
Source file -> extracted text -> classification proposal -> human approval -> manifest entry
```

### Why It Matters

Lineage helps reviewers answer:

- Which source file supports this record?
- Where in the source file did the value come from?
- Which reviewer approved it?
- What decision history applies?

### Technical Notes

- Lineage nodes have content hashes.
- Lineage edges connect source, proposal, decision, and output records.
- Broken lineage should block governed downstream use.

---

## 9. Final Casework Output Package

### Simple Meaning

The final casework output package is the exported JSON record that says which required casework stages are ready and which are blocked.

### What It Contains

It may include:

- Case ID.
- Package status.
- Required stage statuses.
- References to linked artifact hashes.
- Unresolved item summaries.
- Maturity claims.
- Lineage relationships.

### Technical Notes

- The package references generated artifacts; it does not embed every workbook or source file.
- The exported path is `cases/<case-uuid>/exports/final-casework-output-package.json`.
- A blocked package is valid evidence of missing outputs.
- Do not manually edit a blocked package to make it appear complete.

---

## 10. Artifact Linker

### Simple Meaning

The artifact linker connects an already-generated workspace file to the final package.

### Why It Matters

The app reads the file and computes the SHA-256 itself. This avoids typed, copied, or invented hashes.

### Technical Notes

- Linked references are stored at `cases/<case-uuid>/outputs/artifact-references.json`.
- Paths are workspace-relative.
- Supported final-package artifact types include architecture, BuildSpec, compiled formulas, workbook, validation, reconciliation, and Section 436 evaluation artifacts.
- Linking proves byte identity, not actuarial correctness.

---

## 11. Quarantine States

### Simple Meaning

Quarantine means an artifact is blocked until reviewed or permanently blocked.

### Common States

| State | Simple Meaning |
| --- | --- |
| Screening pending | The app has not finished safety review. |
| Provisional quarantine | Automated screening found a reason to block pending review. |
| Provisional safety block | The artifact remains blocked for safety or uncertainty. |
| Rescreen required | The artifact needs screening again. |
| Released | A human allowed use. |
| Final quarantine | A human permanently blocked use. |
| Revoked | A prior release was withdrawn. |

### Technical Notes

- Automated screening never creates final release.
- Final release or final quarantine requires a typed human decision.
- Different bytes always require a separate review lifecycle.

---

## 12. Proposal vs Decision

### Simple Meaning

A proposal is a system suggestion. A decision is a human action.

### Examples

| App Output | Is It Final? |
| --- | --- |
| Suggested classification | No, it is a proposal. |
| Proposed relationship | No, it is a proposal. |
| Detected population file | No, it is a proposal. |
| Reviewer approval | Yes, if valid and current. |
| Reviewer rejection | Yes, if valid and current. |

### Technical Notes

- Proposals remain immutable.
- Decisions are append-only.
- Current status is computed by replaying decision history.
- A revoked or superseded approval is not current.

---

## 13. Unresolved Item

### Simple Meaning

An unresolved item is a question or conflict that must be reviewed before downstream use.

### Examples

- Conflicting effective dates.
- Ambiguous plan language.
- Missing required population field.
- Hidden workbook content.
- Stale source authority.

### Common Actions

| Action | Meaning |
| --- | --- |
| Accept | Choose one interpretation. |
| Reject | Reject a proposed interpretation. |
| Supersede | Replace a decision or issue with a newer one. |
| Branch | Preserve an alternate interpretation for later review. |

### Technical Notes

- Unresolved items are blocking when they affect required downstream results.
- Resolutions are append-only.
- Timestamps do not determine decision order.

---

## 14. Population Data Terms

### Simple Meaning

Population data is participant-level or participant-group data used for downstream case processing.

### Important Distinctions

| Value Type | Meaning |
| --- | --- |
| Missing | Field or value is absent. |
| Blank | Field exists but cell is blank. |
| Malformed | Value exists but does not match expected type. |
| Literal zero | Value is exactly zero. |
| Formula-like | Value looks like a formula or came from a formula cell. |

### Why It Matters

The app must not invent, correct, or replace participant values. Missing required facts should produce review items or validation exceptions.

### Technical Notes

- Population profiles are proposal-only until human approved.
- Raw values are preserved where available.
- Formula cells are not calculated by the browser inspection pipeline.

---

## 15. I/O/B Classification

### Simple Meaning

I/O/B describes how a workbook cell or field is used.

| Code | Meaning |
| --- | --- |
| I | Input from population or source data. |
| O | Output calculated by formulas. |
| B | Both input and output behavior. |
| N | Neither input nor output for the relevant calculation. |
| P | Parameter or policy-related value. |

### Important Rule

`CALC_INDICATOR`, `CALCULATION`, and I/O/B classification are separate concepts.

### Technical Notes

- `CALC_INDICATOR` identifies valuation or recalculation context.
- `CALCULATION` identifies a documented calculation run or scenario.
- `B` is an I/O/B value, not a calculation indicator.

---

## 16. Named Range

### Simple Meaning

A named range is a workbook name that points to a cell or range.

Example:

```text
COMP -> RETIREES!A1
```

### Why It Matters

Named ranges help formulas refer to fields in a stable way.

### Technical Notes

- Names must resolve to actual cells or ranges.
- Names must be unique within their scope.
- Scope may be workbook-level or sheet-level.
- Case preservation matters for output, but uniqueness checks are case-insensitive where required.

---

## 17. Formula Dependency

### Simple Meaning

A formula dependency means one formula uses another cell, formula, or named range.

### Example

```text
B1 depends on A1
C1 depends on B1
```

### Why It Matters

The app must order formulas correctly and detect circular dependencies.

### Technical Notes

- Circular dependencies block validation.
- Missing cell or named-range references block validation.
- External links should be explicit and validated.

---

## 18. Validation

### Simple Meaning

Validation checks whether a workbook or record is structurally usable and consistent.

### Validation Examples

- Required fields exist.
- Named ranges resolve.
- Formula references exist.
- I/B cells have population sources.
- No circular dependencies exist.
- Population data completeness is checked.

### Technical Notes

- Errors block approval.
- Warnings are recorded but may not block.
- Validation results are deterministic and hashable.

---

## 19. Reconciliation

### Simple Meaning

Reconciliation compares app results with an independent source, such as an oracle or prior validated run.

### Example

```text
Expected benefit from oracle: 1200.00
Workbook result:             1200.01
Tolerance:                   0.01
Status:                      within tolerance
```

### Technical Notes

- Reconciliation should only run after validation passes.
- Mismatches are classified.
- Oracle unavailability is recorded as a blocking issue when required.

---

## 20. Tolerance

### Simple Meaning

Tolerance is the allowed difference between two results.

### Common Tolerance Types

| Type | Meaning |
| --- | --- |
| Absolute | Fixed allowed difference, such as 0.01. |
| Relative | Percent-based allowed difference. |
| Cell override | Special tolerance for a specific cell. |

### Technical Notes

- Tolerance must be documented.
- Tolerance does not excuse data errors.
- Rounding rules must be explicit when material.

---

## 21. Oracle

### Simple Meaning

An oracle is an independent reference result used for comparison.

### Examples

- Prior validated run.
- Reference calculation.
- External execution results imported as evidence.

### Important Rule

Do not claim external oracle execution unless it actually happened and was recorded.

### Technical Notes

- Oracle results must have identifiers and provenance.
- Oracle unavailable is a valid mismatch classification.
- External tools are not silently integrated by this app.

---

## 22. Casework Maturity Level

### Simple Meaning

A maturity level describes how much evidence supports a casework artifact.

### Levels Used In Final Packages

| Level | Meaning |
| --- | --- |
| Specified | Requirements or acceptance criteria exist. |
| Implemented | Deterministic code, formulas, or artifact content exists. |
| Tested | Automated tests or recorded checks have run. |
| Independently validated | A separate oracle or reconciliation has passed. |
| Externally executed | A named external system was actually run and evidence was recorded. |
| Human approved | The responsible reviewer approved the artifact for its purpose. |

### Technical Notes

- Do not choose a higher maturity level just because a file exists.
- External execution requires separate recorded evidence.
- Human approval requires a reviewer decision, not only an automated pass.

---

## 23. Section 436 Evaluation

### Simple Meaning

A Section 436 evaluation records whether supplied, reviewed facts and rules identify benefit restrictions for a plan year.

### Required Facts

The current evaluator requires human-approved values for:

- `aftap-percentage`.
- `plan-year-start`.
- `plan-year-end`.
- `certification-date`.

### Technical Notes

- Every supplied fact and rule must retain citations.
- Provisional facts do not satisfy required facts.
- If required facts or approved rules are missing, the evaluation is blocked.
- The evaluator can render a Markdown report from the deterministic artifact.
- The current app does not provide a Section 436 fact-entry screen or DOCX/PDF memo generator.

---

## 24. Deterministic Hash

### Simple Meaning

A deterministic hash is a fingerprint of a record that should be the same every time the same content is processed.

### What Is Excluded

Some operational details should not change deterministic content hashes, such as:

- Random UUIDs used only as operational IDs.
- Display timestamps where excluded by contract.
- UI state.
- Session order that does not change the governed content.

### Technical Notes

- Deterministic hashes support reproducibility.
- A changed hash means governed content changed.
- Hashes help detect accidental drift.

---

## 25. Error vs Warning

### Simple Meaning

| Severity | Meaning |
| --- | --- |
| Error | Blocks approval or downstream use. |
| Warning | Recorded issue that may not block. |

### Technical Notes

- Blocking errors should not be bypassed.
- Warnings should still be reviewed and explained when material.

---

## 26. Common Troubleshooting Terms

| Message Or Term | What It Usually Means | What To Do |
| --- | --- | --- |
| Browser limited | Required browser feature is missing. | Use Chrome or Edge, or approved static-origin launcher. |
| Workspace denied | Browser cannot write to folder. | Re-select folder or choose one with write permission. |
| Snapshot changed | Selected package differs from prior attempt. | Confirm change is expected; process as linked divergence. |
| Provisional block | Automated finding requires review. | Open quarantine queue and record decision. |
| Oracle unavailable | Reference result was not available. | Add/import oracle evidence or record blocker. |
| Missing data | Required value is absent. | Do not impute; route to review or correction. |
| Circular dependency | Formula references loop back on itself. | Fix build specification or formula source. |
| Named range missing | Formula references unresolved name. | Fix named range or formula reference. |
| Final package blocked | One or more required casework outputs are missing or unresolved. | Generate, review, link, or document the blocker before relying on the package as complete. |
| Artifact link failed | The file could not be read or required link fields are incomplete. | Check workspace-relative path, permission, artifact ID, media type, and description. |
| Section 436 blocked | Required facts, approved rules, or citations are missing. | Add reviewed facts/rules with citations and rerun the deterministic evaluation. |

---

## 27. What To Say In Audit Notes

Good audit notes are specific.

Good examples:

```text
Released exact-hash synthetic workbook for passive inspection only. Macros were not executed.
```

```text
Rejected population candidate because required COMP column is absent. No imputation applied.
```

```text
Approved relationship because Amendment 3 explicitly supersedes Section 4.2 of prior plan document.
```

```text
Linked generated BuildSpec artifact from the active workspace; SHA-256 was computed by the app before final-package export.
```

Poor examples:

```text
ok
```

```text
approved
```

```text
looks right
```

---

## 28. Manual Testing And SC-010

The synthetic automated tests help confirm functionality, but they do not complete the SC-010 usability study.

SC-010 requires:

- At least 20 authorized caseworkers or reviewers.
- First-attempt completion of required tasks.
- No task-specific coaching after the attempt begins.
- At least 19 successful participants out of 20.
- Anonymized retained evidence.

Until that study is performed, do not mark T124 complete.
