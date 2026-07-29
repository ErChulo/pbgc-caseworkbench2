# Feature 001 validation report

**Recorded:** 2026-07-29
**Scope:** Feature 001 evidence-ingestion polish evidence recorded from commands executed in this repository session.
**Maturity:** Implemented and Tested. Not independently validated, externally executed, or human approved by this report.

## Executed checks

| Check                                                                              | Recorded result                                                                                                                      |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `npm run test:integration`                                                         | Passed: 54/54 integration tests. This includes `web/tests/integration/evidence-ingestion.test.ts`.                                   |
| `npx playwright test web/tests/browser/evidence-review.spec.ts --project=chromium` | Passed: 2/2 tests in the Chromium project.                                                                                           |
| `npm run validate:schemas`                                                         | Passed: 14 Draft 2020-12 design schemas parsed and all local references resolved.                                                    |
| `npm run validate:contracts`                                                       | Passed: 14 runtime schemas matched approved source bytes and all local references resolved offline.                                  |
| `npm run quality`                                                                  | Passed in the staged-tree checkout: typecheck, lint, format, schemas, contracts, 585/585 tests, build, and single-file verification. |
| `npm run build && npm run verify:single-file`                                      | Passed: one self-contained 751,172-byte HTML artifact.                                                                               |

## Deterministic synthetic replay

`web/tests/integration/evidence-ingestion.test.ts` uses synthetic text evidence, fixed timestamps, fixed identifiers, and fixed actor metadata. The test path:

1. Builds and validates an evidence catalog from a released synthetic artifact.
2. Extracts a proposal-only provision candidate with an exact locator and effective date.
3. Records competing interpretations and a typed human resolution.
4. Authors an effective-dated rule after the blocking unresolved item is resolved.
5. Appends the candidate, resolved item, and rule to governed JSONL storage and reads each record type back.
6. Rebuilds the catalog with a different operational `builtAt` and verifies an identical `catalogContentSha256`.

This is deterministic application-level replay evidence for `SC-004` and `SC-006`. It does not claim an independent oracle or execution by an external system.

## Browser server record

The targeted Playwright run used the repository's `playwright.config.ts` web-server configuration. Playwright used `npm run dev` to serve Vite on `http://127.0.0.1:4173`; `reuseExistingServer: true` permits reuse when that configured server is already available. The two evidence-review tests exercised the synthetic review flow, zero outbound-request assertion, narrow viewport, and keyboard controls in the Chromium project.

That recorded browser run is a historical baseline and predates the current precommit corrections. The current reviewer UI calls governed `resolveItem()` and `authorRule()` operations, but retains successful outputs only in a synthetic in-memory session preview. It explicitly states that reset or refresh discards the preview and does not claim workspace persistence. Updated browser coverage is present, but was not rerun during the no-server precommit correction.

Edge was not run in this validation pass. No Edge result is claimed.

## Performance status

No performance benchmark was executed in this polish pass, so no timing or scale result is claimed. Feature 001 candidate extraction continues to consume Feature 009 passive-parser output rather than adding a second parse pass.

## Validation boundaries

The full quality gate and targeted Chromium results above are the recorded 2026-07-29 baseline, not evidence for later unexecuted changes. Schema validation in that baseline establishes schema parsing, local-reference resolution, and source/runtime byte agreement; runtime domain tests establish date ordering, citation authority, hash validation, and unresolved-revision semantics. Edge and external calculation systems remain outside this validation record.

No Excel, ValTool, Runtime, ATPBGC, or BCV execution was performed or claimed. T068 remains open until the verified Feature 001 files are committed.
