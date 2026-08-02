# PBGC CaseworkBench 2.0 - Full User Manual

**Audience:** Caseworkers, reviewers, supervisors
**Style:** Plain language with technical terms explained
**Last updated:** 2026-08-02

This manual explains how to use PBGC CaseworkBench 2.0 from start to finish. It is written for people doing case intake, evidence review, and supervisory review.

Use this manual with the Quick-Start Guide and the Technical Appendix in this same folder.

Important: This manual uses synthetic examples only. Do not copy real participant PII into documentation, screenshots, examples, fixtures, or Git.

---

## 1. What The App Is For

PBGC CaseworkBench 2.0 helps you receive, preserve, review, and export evidence for PBGC case work.

The app is designed to help you:

- Create or resume a controlled case.
- Select a local workspace folder.
- Add case files and folders.
- Preserve files exactly as received.
- Review files that were blocked or flagged.
- Review system suggestions before they become governed decisions.
- Track unresolved issues.
- Export an evidence manifest with lineage and audit details.

The app is local-first. This means case data stays on your computer or selected local workspace. The app does not require a server for case processing.

---

## 2. Important Safety Rules

Follow these rules every time you use the app.

| Rule | What It Means |
| --- | --- |
| Keep real participant data local | Do not transmit real participant data outside the approved local workspace. |
| Do not put PII in Git or docs | Do not put names, SSNs, dates of birth, addresses, or other participant identifiers in examples, screenshots, logs, or documentation. |
| Do not manually change generated records | Fix problems by repeating the app process or fixing the generator, not by hand-editing generated output. |
| Do not treat suggestions as approval | Automated results are proposals only until a human decision is recorded. |
| Do not assume missing values are zero | Blank, missing, malformed, zero, and formula-like values are different and must stay different. |
| Do not claim external execution unless it happened | Do not claim Excel, ValTool, Runtime, ATPBGC, or BCV execution unless actually performed and recorded. |

---

## 3. Basic Concepts

| Term | Simple Meaning |
| --- | --- |
| Workspace | The local folder where the app stores case records and evidence records. |
| Case | A controlled PBGC case record with a unique case identity. |
| Artifact | A file or extracted file member handled by the app. |
| SHA-256 | A content fingerprint used to identify exact file bytes. |
| Snapshot | A record of the selected package at an intake attempt. |
| Quarantine | A blocked safety or review state for an artifact. |
| Proposal | A system suggestion that still needs human review. |
| Decision | A human action such as approve, reject, release, revoke, or supersede. |
| Manifest | The exported machine-readable record of evidence, review state, and lineage. |
| Lineage | A trace from output records back to source files, locations, and decisions. |

See `technical-appendix.md` for a deeper explanation of these terms.

---

## 4. Opening The App

### 4.1 Before You Open It

Make sure you have:

- The approved `pbgc-caseworkbench.html` file.
- A supported browser, preferably Chrome or Edge.
- A local workspace folder approved for case processing.
- Enough disk space for the submitted files and preserved copies.

### 4.2 Open The App

1. Open Chrome or Edge.
2. Open `pbgc-caseworkbench.html`.
3. Wait for the app header and compatibility panel to load.
4. Confirm the app shows compatibility information.

### 4.3 If The App Does Not Open

Try these steps:

1. Confirm the file exists and was downloaded completely.
2. Try Chrome or Edge if another browser failed.
3. Ask IT whether direct file opening is allowed.
4. If direct file opening is not allowed, use the approved static-origin launcher.

---

## 5. Screen-By-Screen Guide

The app is one main page with several workflow panels. You usually work from top to bottom.

### 5.1 Compatibility Panel

Purpose: Checks whether your browser supports the app features.

You may see:

- Browser support status.
- File System Access support.
- Local storage capability.
- Worker and browser capability details.

How to use it:

1. Read the status before beginning production work.
2. If the panel says the browser is compatible, continue.
3. If the panel says limited mode, do not claim production persistence.
4. If the panel says incompatible, stop and switch to an approved browser.

Example:

| Status | Action |
| --- | --- |
| Compatible | Continue with case work. |
| Limited | Use only for review or demo if allowed. |
| Incompatible | Stop and contact IT or switch browser. |

### 5.2 Help Panel

Purpose: Gives basic operating guidance inside the app.

Use it when you need reminders about:

- Workspace selection.
- Backups.
- Local PII handling.
- Static-origin fallback.
- Keyboard operation.

Recommended use:

1. Open it before your first case.
2. Review local PII handling rules.
3. Review recovery rules before large package intake.

### 5.3 Case Creation Panel

Purpose: Starts a controlled case or resumes an existing one.

Fields you may enter:

| Field | What To Enter | Example |
| --- | --- | --- |
| Reviewer ID | Your approved local reviewer identifier | `reviewer-001` |
| Display Name | Your name or approved display name | `Test Reviewer` |
| PBGC Case Number | Official case identifier for production work | `PBGC-2026-000001` |

Case purpose options:

| Purpose | When To Use |
| --- | --- |
| Production | Real case work with an official case identifier. |
| Test | Synthetic or non-production testing. |
| Training | Practice or onboarding. |
| Duplicate investigation | Controlled duplicate-case analysis. |

How to create a production case:

1. Select the approved workspace folder first.
2. Enter your reviewer ID.
3. Enter your display name.
4. Enter the official PBGC case number.
5. Choose production case creation.
6. Review the case summary.

If the case already exists:

1. Read the collision message.
2. Confirm the existing case is the same intended case.
3. Choose resume existing if you are continuing the same case.
4. Choose non-production only if you have a valid test, training, or duplicate-investigation reason.
5. Enter a rationale when required.

Do not create another production case just to get around a collision.

### 5.4 Package Intake Panel

Purpose: Adds files or folders to the active case.

Common intake choices:

| Button | Use It For |
| --- | --- |
| Select Files | A small number of individual files. |
| Select Folder | A full package or directory tree. |
| Stop Intake | Safely stop processing after the current safe boundary. |

Step-by-step intake:

1. Confirm the correct case is active.
2. Click Select Files or Select Folder.
3. Choose the submitted evidence package.
4. Wait while the app discovers, hashes, preserves, screens, and records files.
5. Watch the artifact inventory for status updates.
6. If the package is large, do not close the browser until intake completes or you stop it safely.

What the app does during intake:

1. Finds submitted files.
2. Records their submitted paths.
3. Computes content fingerprints.
4. Preserves original bytes in local object storage.
5. Screens files for risk and limitations.
6. Records results in the local workspace.

Important: The app does not run macros, formulas, scripts, or executable files.

### 5.5 Artifact Inventory

Purpose: Shows files and processing status.

Common columns:

| Column | Meaning |
| --- | --- |
| Submitted path | Where the file appeared in the package. |
| Size | File size in bytes. |
| Status | Current processing state. |
| SHA-256 | Exact content fingerprint. |

Common statuses:

| Status | Meaning |
| --- | --- |
| Queued | Waiting for processing. |
| Hashing | Computing the content fingerprint. |
| Preserved | Stored and verified locally. |
| Duplicate | Same exact bytes were already seen. |
| Provisional blocked | Blocked pending safety or human review. |
| Failed | Processing failed safely for this artifact. |
| Interrupted | Processing stopped before completion. |

How to review inventory:

1. Check that expected files appear.
2. Check that file counts look reasonable.
3. Review any failed or blocked items.
4. Copy SHA-256 values only when needed for audit or support.

### 5.6 Quarantine Queue

Purpose: Lets reviewers decide what to do with blocked artifacts.

You will see this panel only when there are items requiring review.

For each item, review:

- Display name.
- Content fingerprint.
- Processing status.
- Safety status.
- Human decision status.
- Block reason.
- Evidence required.
- Next action.
- Prior rationale, if any.

Decision actions:

| Action | Plain Meaning |
| --- | --- |
| Release for use | Allow this artifact to be used downstream. |
| Inherit approved status | Use a prior release for identical content. |
| Permanently quarantine | Keep it blocked from downstream use. |
| Reject | Reject it for use or classification. |
| Withdraw approval | Revoke a prior release decision. |

How to make a quarantine decision:

1. Read the finding summary.
2. Review the evidence required.
3. Enter reviewer name.
4. Enter rationale.
5. Choose the decision action.
6. Confirm irreversible actions when prompted.
7. Check that the item status updates.

Examples of rationales:

| Situation | Example Rationale |
| --- | --- |
| Synthetic macro workbook released for passive review | `Reviewed as synthetic test file. Passive inspection only. Macros not executed.` |
| Executable rejected | `Executable content is not needed for evidence review and remains blocked.` |
| Same-hash file inherits prior release | `Exact SHA-256 match to previously reviewed file. Inheriting release decision.` |

Do not use vague rationales like `ok`, `done`, or `looks fine`.

### 5.7 Classification Review

Purpose: Lets reviewers approve or reject automated category and source-role suggestions.

Important: Classifications are proposals until a human decision is recorded.

Information shown:

| Field | Meaning |
| --- | --- |
| Suggested category | What the app thinks the artifact is. |
| Source role | How the artifact may be used. |
| Confidence | Strength of the automated suggestion. |
| Evidence | Why the suggestion was made. |
| Status | Proposed, approved, rejected, revoked, or superseded. |

How to review a classification:

1. Read the suggested category.
2. Review the evidence and confidence.
3. Compare it to the file name, content summary, and case context.
4. Choose approve, reject, revoke, or supersede.
5. Enter rationale.

Date candidate review:

1. Review each proposed date.
2. Check the source and locator.
3. Select the date only if supported by evidence.
4. Leave competing or unclear dates unresolved.

### 5.8 Evidence Review Workspace

Purpose: Shows a synthetic evidence-review and plan-rule preview workspace.

Important: This section is currently a synthetic session preview. It validates in memory and does not persist final production plan rules.

Tabs:

| Tab | Purpose |
| --- | --- |
| Catalog | Browse evidence records. |
| Candidates | Review extracted provision candidates. |
| Rules | Preview plan-rule authoring validation. |
| Unresolved | Review interpretation issues. |

Catalog tab:

1. Filter evidence by source role.
2. Review artifact hash and locator.
3. Check review status.
4. Review quarantined exclusions separately.

Candidates tab:

1. Review source text.
2. Review normalized restatement.
3. Check effective date candidate.
4. Check near-duplicate or supersession notes.

Rules tab:

1. Select provision candidates.
2. Select a primary citation.
3. Enter effective date.
4. Enter governing restatement.
5. Enter applicability condition.
6. Choose predecessor if superseding a prior rule.
7. Enter reviewer and rationale.
8. Validate the rule preview.

Unresolved tab:

1. Review each unresolved issue.
2. Read competing interpretations.
3. Review consequence.
4. Choose accept, supersede, reject, or branch.
5. Branch when a non-selected interpretation should remain traceable.

### 5.9 Relationship Review

Purpose: Lets reviewers approve or reject proposed relationships between artifacts.

Relationship examples:

| Relationship | Meaning |
| --- | --- |
| Authority | One source is authoritative for another record. |
| Amendment | One document amends another. |
| Supersession | One document replaces or overrides another. |
| Conflict | Sources disagree. |
| Near duplicate | Sources are similar but not exact duplicates. |
| Effective period | A source applies during a date range. |

How to review a relationship:

1. Read the relationship type.
2. Review the from and to records.
3. Check confidence and evidence.
4. Approve only if the relationship is supported.
5. Reject or supersede if the proposal is wrong or incomplete.

### 5.10 Population Review

Purpose: Lets reviewers approve or reject detected population structures.

Information shown:

- Observed fields.
- Observed record count.
- Structural findings.
- Confidence.
- Decision history.

How to review population data:

1. Confirm the file is an intended population file.
2. Review field names and record count.
3. Confirm required fields are present.
4. Review blank, missing, malformed, formula-like, and literal zero values separately.
5. Approve only if the structure is acceptable for downstream use.
6. Reject or supersede when data is incomplete or wrong.

Important: The app does not invent missing participant values. Missing values require explicit review.

### 5.11 Manifest Export

Purpose: Exports the auditable evidence manifest.

The manifest panel shows:

- Artifact count.
- Validation result count.
- Unresolved item count.
- Processing status.
- Safety review note, if applicable.
- Manifest fingerprint.
- File-to-decision trace.

How to export:

1. Review the summary counts.
2. Confirm unresolved and blocked items are understood.
3. Review lineage entries.
4. Click Export local manifest.
5. Store the exported file according to office procedure.

Do not manually edit the manifest. If something is wrong, correct the underlying review state and export again.

---

## 6. Complete Step-By-Step Workflows

### 6.1 Create A New Production Case

Use this when starting a real PBGC case.

1. Open the app in Chrome or Edge.
2. Confirm the compatibility panel is acceptable for production use.
3. Select the approved local workspace folder.
4. Enter reviewer ID.
5. Enter reviewer display name.
6. Enter official PBGC case number.
7. Create the production case.
8. Review the case summary.
9. Confirm the case purpose says Production.

If there is a collision:

1. Confirm the existing case is the same intended case.
2. Choose Resume Existing if continuing that case.
3. Choose non-production only if you are doing test, training, or duplicate investigation.
4. Enter rationale for the collision decision.

### 6.2 Create A Training Or Test Case

Use this for demos, training, or synthetic testing.

1. Open the app.
2. Select a workspace folder meant for non-production work.
3. Enter reviewer information.
4. Choose Test or Training.
5. Enter a clear rationale.
6. Create the case.
7. Confirm the case summary shows the correct purpose.

Example rationale:

`Synthetic training case for reviewer onboarding. No real participant data used.`

### 6.3 Intake A Folder Of Evidence

Use this when a submitted package contains multiple folders and files.

1. Confirm the correct case is active.
2. Choose Select Folder.
3. Select the submitted package root folder.
4. Wait for the app to discover files.
5. Watch inventory status updates.
6. If a large file takes time, leave the app open.
7. If you must stop, click Stop Intake instead of closing the browser.
8. Review Completed, Partial, Interrupted, or Provisional Blocked status.

### 6.4 Resume After Interruption

Use this when intake was stopped or the browser closed.

1. Reopen the app.
2. Select the same workspace folder.
3. Resume the same case.
4. Select the same package if prompted.
5. The app compares the new selection with the prior snapshot.
6. If unchanged, the app reuses prior work.
7. If changed, the app records a linked divergence.

### 6.5 Review Safety-Blocked Files

Use this when the quarantine queue appears.

1. Open Quarantine Queue.
2. Start with the highest-risk item.
3. Read block reason and evidence required.
4. Review any available details.
5. Enter reviewer name.
6. Enter rationale.
7. Choose release, inherit, quarantine, reject, or revoke.
8. Confirm irreversible actions.
9. Repeat until the queue is empty or all items are deliberately blocked.

### 6.6 Review Automated Classifications

Use this when classification suggestions appear.

1. Open Classification Review.
2. Review each proposed category and source role.
3. Compare the suggestion with the source file.
4. Check confidence, but do not approve based on confidence alone.
5. Approve only when supported by evidence.
6. Reject unsupported suggestions.
7. Supersede when the correct classification is different.

### 6.7 Review Population Candidates

Use this when the app detects population-like data.

1. Open Population Review.
2. Review observed fields.
3. Review record count.
4. Check structural findings.
5. Confirm no values were invented or corrected.
6. Approve only if the structure is acceptable.
7. Reject or supersede if the wrong file or wrong structure was detected.

### 6.8 Export The Manifest

Use this at the end of a review session or when preserving a checkpoint.

1. Open Manifest Export.
2. Review artifact count.
3. Review validation count.
4. Review unresolved count.
5. Read any safety review note.
6. Review the manifest fingerprint.
7. Expand lineage details if needed.
8. Export local manifest.
9. Store the exported file under office procedure.

---

## 7. Examples

### 7.1 Example: Happy Path With Synthetic Files

Scenario: A test reviewer processes a synthetic package with a plan document, a population CSV, and a support PDF.

Steps:

1. Open app.
2. Select workspace `C:\PBGC-Test-Workspace`.
3. Create test case `PBGC-2026-SYNTH-001`.
4. Select folder `SyntheticPackage001`.
5. Wait for intake to finish.
6. Confirm 3 artifacts appear in inventory.
7. Confirm no quarantine queue appears.
8. Review classification proposals.
9. Approve synthetic plan document and population file classifications.
10. Export manifest.

Expected result:

- Intake completes.
- Manifest shows 3 artifacts.
- No unresolved safety block remains.
- Manifest fingerprint is visible.

### 7.2 Example: Macro Workbook Is Blocked

Scenario: A synthetic workbook contains macro-enabled parts.

Steps:

1. Intake the package.
2. Open Quarantine Queue.
3. Review the macro finding.
4. Enter rationale: `Macro-enabled workbook reviewed for passive inspection only. Macros not executed.`
5. Choose Release if office procedure allows passive inspection, or Permanently quarantine if not allowed.
6. Confirm the status update.

Expected result:

- Automated macro finding remains recorded.
- Human decision is recorded with rationale.
- Downstream use follows the human decision.

### 7.3 Example: Duplicate Case Number

Scenario: A reviewer enters a case number that already exists.

Steps:

1. Enter the official PBGC case number.
2. Click create production case.
3. Review collision message.
4. Choose Resume Existing if it is the same case.
5. Enter rationale if prompted.

Expected result:

- No duplicate production case is created.
- The existing case is resumed.
- Decision history records the collision decision.

### 7.4 Example: Population File Has Missing Data

Scenario: A CSV has blank and malformed values.

Steps:

1. Intake package.
2. Open Population Review.
3. Review observed fields and structural findings.
4. Note missing, blank, malformed, formula-like, and literal zero values separately.
5. Reject or leave unresolved if required values are missing.
6. Do not treat blanks as zero.

Expected result:

- Missing data is not invented.
- Review decision records the issue.
- Downstream use remains blocked if required facts are unresolved.

---

## 8. Troubleshooting

### 8.1 Browser Says Limited Or Incompatible

Try:

1. Use Chrome or Edge.
2. Open the app from an approved location.
3. Use the approved static-origin launcher if direct file mode is blocked.
4. Contact IT if File System Access is disabled by policy.

### 8.2 Workspace Access Is Denied

Try:

1. Re-select the workspace.
2. Confirm you have write permission.
3. Avoid system-protected folders.
4. Avoid folders managed by unauthorized sync tools.

### 8.3 Intake Is Slow

Try:

1. Keep the browser open.
2. Use Stop Intake if you need to pause safely.
3. Resume later from the same workspace.
4. Avoid running many other applications during very large intake.

### 8.4 A File Is Blocked

Do not bypass the block.

1. Open Quarantine Queue.
2. Review block reason.
3. Make a human decision with rationale.
4. Export a new manifest after the decision.

### 8.5 Manifest Counts Look Wrong

Check:

1. Did intake complete or stop early?
2. Are there duplicate files?
3. Were archive members extracted?
4. Are any files failed or interrupted?
5. Are you looking at the correct case and workspace?

---

## 9. Supervisor Checklist

Use this checklist before relying on exported manifest evidence.

- Confirm correct case ID.
- Confirm workspace is approved.
- Confirm intake completed or partial state is explained.
- Confirm quarantine queue decisions are recorded with rationale.
- Confirm classification proposals needed for downstream use are reviewed.
- Confirm population candidates needed for downstream use are reviewed.
- Confirm unresolved items are known and documented.
- Confirm manifest hash is recorded.
- Confirm no real PII was put into Git, docs, screenshots, or examples.

---

## 10. What This Manual Does Not Claim

This manual does not claim:

- That real office data has already been tested.
- That the SC-010 usability study is complete.
- That external tools such as Excel, ValTool, Runtime, ATPBGC, or BCV were executed.
- That the browser can certify files are malware-free.
- That missing participant data can be inferred or replaced with zero.

Those actions require separate execution, evidence, or human review.
