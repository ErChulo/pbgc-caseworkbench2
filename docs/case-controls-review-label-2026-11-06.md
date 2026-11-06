# Case-control review label

The local case-controls form records a reviewer name and rationale; it does not authenticate the person or establish their authority. The UI no longer calls the controls authenticated, and it explicitly requires independent verification before release. The existing persisted `AuthenticatedCaseControls` contract and `human-approved` review-status value are unchanged for compatibility; those labels do not prove identity or authority. Final release remains blocked pending authenticated approvals and lineage.

The form now labels the recorded reviewer separately from the effective date and shows the ISO date as entered. Previously it displayed the effective start date as if it were an approval date, and locale/time-zone conversion could show the prior day. A synthetic Chromium test checks the identity disclaimer and displayed effective date.
