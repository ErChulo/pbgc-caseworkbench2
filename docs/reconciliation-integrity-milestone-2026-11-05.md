# Reconciliation integrity milestone — 2026-11-05

## Changes

Previously an empty oracle could produce `complete`, absent actual values could equal null oracle values, and a mismatched reconciliation did not block approval in the orchestration API. Reconciliation now requires nonempty workbook formulas and oracle results, workbook validation without errors, matching population and BuildSpec snapshots, valid oracle metadata, a trusted oracle label and documented evidence. It rejects duplicate or missing formula results, unknown formulas, mismatched cell addresses, error-typed oracle values, blank/missing/nonfinite values, and invalid tolerances; numeric zero remains distinct from missing. Every workbook formula must be represented for comparison completion. Reconciliation failures, mismatches, or absence block approval in the orchestration API. A review note requires reviewer and rationale, verifies the existing content hash, rehashes the reviewed record, and does not change its status or approve output.

## Verification

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, `npm run build`, `npm run verify:single-file`: passed on this milestone before the final localized review-hash change; typecheck, targeted lint and focused tests passed again afterward. The bundle does not currently use this reconciliation module and was unchanged by the build.
- Focused validation/reconciliation unit and orchestration tests: 36 passed; additional review-hash tamper test passed.
- `npm test` before the final localized review-hash change: 120 files passed, one failed; 997 tests passed, four skipped. The sole failed suite expects the approved Data Dictionary workbook but this checkout has a Git LFS pointer; see `docs/output-artifact-integrity-milestone-2026-11-05.md`.
- Browser/Excel/BCV, external oracle execution, and human actuarial review were not performed.

## Limitations

`complete` in this comparison engine means the supplied formula values compared within the supplied tolerance. A `trusted` string or evidence description is not independent proof. The validation record currently does not cryptographically bind itself to the workbook, the reconciliation result identifies the oracle by ID rather than a content hash, and values are keyed by formula ID rather than participant/row. These must be corrected and independently reviewed before production use or before removing the final-output blocker. No partial-oracle sampling protocol is implemented: missing formulas fail closed. Numeric tolerances currently use JavaScript binary floating point; exact decimal boundary behavior and rounding require an approved numeric policy and independent tests. No calculation, official oracle, independent validation, or approval is claimed by the synthetic tests.
