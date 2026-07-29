# Feature 004 validation report

**Recorded:** 2026-07-29
**Scope:** Feature 004 V1 Architecture Selector polish evidence from commands executed against the current worktree.
**Maturity:** Implemented and Tested. This report does not establish independent validation, external execution, or human approval.

## Executed checks

| Check                                                           | Recorded result                                                                                                                                                                                      |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused Feature 004 Vitest run                                  | Passed 95/95 tests across 13 architecture, population, contract, workspace, and integration files.                                                                                                   |
| `npm run quality`                                               | Passed in the staged-tree checkout: typecheck, lint, repository format check, schema validation, contract validation, 678/678 tests across 80 files, production build, and single-file verification. |
| `npm run validate:schemas` within quality                       | Passed: 16 Draft 2020-12 design schemas parsed and all local references resolved.                                                                                                                    |
| `npm run validate:contracts` within quality                     | Passed: 16 runtime schemas matched approved source bytes and all local references resolved offline.                                                                                                  |
| `npm run build` and `npm run verify:single-file` within quality | Passed: one self-contained HTML artifact of 752,023 bytes.                                                                                                                                           |
| `git diff --check`                                              | Passed with no whitespace errors.                                                                                                                                                                    |

The counts above were recorded after the final findings 1-3 remediation in the current worktree.

## Synthetic quickstart validation

`web/tests/integration/architecture-selection.test.ts` is the executable synthetic pilot for the quickstart sequence. It uses fixed synthetic inputs and performs the following checks:

1. Composes a governed synthetic plan rule, approved synthetic population profile, authenticated case controls, synthetic approved policies, observed fields, a formula dependency, and a named range into a V1 architecture.
2. Repeats the build with the same deterministic inputs and verifies an identical `architectureContentSha256`; equal full record bytes additionally require equal injected IDs and timestamps.
3. Recomputes the content hash and verifies that operational `architectureId` and `builtAt` changes do not alter governed architecture content identity.
4. Rejects policy content that no longer matches the hash bound by its synthetic approval.
5. Represents observed canonical support sheets as support-role source tabs, retains their relevant cells through save/load, and excludes participant data values from architecture descriptions.
6. Rejects workbook-only and named-range mutation by recomputing the approval-bound workbook-profile hash.
7. Emits unique historical interval runs from split-rule intersections, never starts before every contributing condition applies, and retains every contributor ID/hash.
8. Aggregates material scenario, population/tab, field/classification, and dependency blockers and returns no architecture.

This is deterministic application-level replay evidence for synthetic data. It does not constitute an independent actuarial oracle or human approval of any policy.

## Governance status

The repository files `rules/scenario-selection.yaml`, `rules/tab-selection.yaml`, `rules/iob-classification.yaml`, and `rules/field-name-glossary.yaml` remain provisional candidate-only content. Production rule loading fails closed unless governance metadata records all of the following:

- human-approved production status;
- reviewer identity and review timestamp;
- the exact approved policy-content SHA-256;
- real source citations with source artifact hashes, precise locators, and effective dates.

T004-T006 and T011 therefore remain unchecked. They require human review and approval using real citations, exact content hashes, and applicable effective dates. Synthetic test fixtures exercise the gate but do not satisfy those approval tasks.

## Validation boundaries

- No real participant PII was used; the architecture-selection pilot is synthetic.
- No Excel, ValTool, Runtime, ATPBGC, BCV, or other external system was executed or claimed.
- No manual workbook validation, external reconciliation, or human policy approval was performed.
- T050 remains unchecked because no commit was requested or created.
