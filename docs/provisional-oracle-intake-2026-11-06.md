# Provisional oracle intake and reconciliation hardening — 2026-11-06

## Scope

The case UI can accept a local, UTF-8 Workbench JSON Lines or JSON interchange file after the current V1 workbook model exists. It can download a blank JSON Lines template containing formula IDs and cell addresses, with null values. This is not an execution result. The two interchange formats are project-defined examples; they are **not verified Excel, BCV, ValTool, or Runtime formats**. JSON Lines contains one result object per nonblank line. JSON contains `oracleId`, `version`, UTC `executedAt`, and a `results` array. Each result has `formulaId`, `cellAddress`, and `value`; an optional nonblank `error` marks a failed result. JSON metadata is asserted and not authenticated.

Import checks case identity, the current workbook model's recomputed content hash, relevant build/population hashes, the exact source bytes and size, UTF-8, strict parsing, distinct formula IDs, and matching formula/cell targets. Unknown, duplicated, malformed, or misaddressed records fail closed; missing or failed results create an incomplete proposal. A complete proposal means only that each model formula has a non-null, non-error proposed value. It does not demonstrate an independent source or computation.

The exact source and a content-addressed proposal are saved under the local case's `evidence/provisional-oracles` directory, then read back and reconstructed against the workbook and source. Files may contain case data and are not sent to a service. Case/workbook switching during asynchronous import suppresses a success message; an already written local proposal may remain and needs inspection. Workspace writes across windows are not transactional; a partial or orphaned source can remain after failure. Restoration is provided in the adapter, but there is not yet a UI for listing or reopening saved proposals. The directory's case record and locally selected workbook are not authenticated.

The import panel is disabled until a current workbook model exists. Current I/B production mappings remain blocked pending approved participant-row routing and B-cell semantics; therefore the successful import path is demonstrated by synthetic unit tests, not by the production browser path. The proposal is **not connected to reconciliation, formula approval, or final export**, and does not change their blockers. It does not bind or authenticate the exact XLSX bytes, prove an external run or reviewer authority, establish source independence, or validate actuarial correctness. The interchange records identify formula ID and cell address but do not independently attest a worksheet tab. Formula approval and final release remain blocked.

## Additional guards

Reconciliation now rejects unknown actual formula IDs and unknown, ambiguous, or repeated tolerance overrides, including collisions between cell and formula-ID keys. A nonzero value compared against expected zero no longer passes relative tolerance alone. Tolerance identities and real ISO effective dates are required. Interchange parsing rejects partial, malformed, duplicate and invalid metadata instead of silently dropping rows. Error-valued oracle records and inconsistent declared types cannot pass merely by matching an actual value. JavaScript floating-point arithmetic remains in use; an approved decimal and rounding policy is still required.

The production rule-authoring UI now derives enabled applicability dimensions from the approved rule schema. Scenario-specific dimensions not in that contract remain visible but unavailable, and manipulating a disabled option cannot enable submission. The serverless local persistence contract check remains a separate defense. This does not resolve the underlying approved contract/model mismatch.

## Remaining governance

External execution records, validation methods and tolerances, independent source provenance, authenticated human approvals, population routing, and final release evidence still require authorized decisions and implementation. Local hashes and a typed reviewer name are not authentication. No external execution or actuarial approval is claimed.

## Verification

- Typecheck, lint, format, schema and contract checks passed.
- Full `npm test` before the final two additional regression cases: 1,102 passed, 4 skipped, with one known failure because the approved Data Dictionary workbook is a Git LFS pointer rather than the approved bytes. After those regression cases were added, all 74 targeted reconciliation and workspace tests passed.
- An isolated source build passed single-file verification. Chromium passed all 55 synthetic browser tests; after the final reconciler guard, 9 direct-file and governed pipeline tests passed again. Browser tests use a synthetic workspace. Firefox, WebKit, native workspace behavior, external calculation engines, and actuarial approvals were not verified.
- Vite continues to warn that `node:fs/promises` in the architecture rule loader is browser-externalized. Tested offline paths passed, not every possible path.
