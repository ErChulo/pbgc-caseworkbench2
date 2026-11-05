# Support sheet and workbook generation milestone — 2026-11-05

## Changes

The workbook model stores `Summary`, `Tables`, and `UD Table` in `support`, while `sheets` contains calculation sheets. Validation now checks the actual support content, checks the Summary's lineage fields against the workbook, and recognizes support sheets as named-range scopes. It rejects case-insensitive collisions with reserved sheet names, duplicate calculation sheet names, and the prohibited `mySort` sheet. Generation and XLSX serialization apply the same sheet-name checks.

The XLSX serializer previously wrote the in-memory Summary's all-zero self-hash placeholder into the file. It now writes the computed workbook-model content hash instead. This is the model hash, not a hash of XLSX bytes. The in-memory placeholder remains part of the pre-existing hash design to avoid a self-referential hash.

An adjacent safety defect was also corrected: the workbook builder previously accepted rejected, revoked, or superseded population projections if they retained an effective decision. It now requires approved status and a population hash and decision matching the BuildSpec's population lineage. This check is not a substitute for independently authenticating decision records.

## Verification

- Focused workbook, validation, and pipeline tests: **112 passed**. Integration tests generated and parsed a synthetic XLSX, checked its three support sheet names and Summary model hash, and exercised rejected sheet names and population states. Additional tests cover missing support content, inconsistent Summary lineage, stale population hash and mismatched approval decision.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`: passed.
- `npx vite build --outDir /home/user/cwb-support-build/dist` and the single-file verifier executed against that separate directory: passed. The locally modified `dist/pbgc-caseworkbench.html` was preserved, not regenerated or included in this commit. Vite warned about browser externalization of `node:fs/promises`.
- `npm test`: 120 test files passed and one failed; 1018 tests passed and four skipped. The failure is the unchanged approved Data Dictionary Git LFS pointer, not workbook bytes. No replacement was used.
- Browser file:// testing and Excel, BCV, ATPBGC, or other external execution were not performed. No actuarial or human approval is claimed.

## Limits

A passing structural status is limited to the checks actually implemented; it does not establish full schema coverage, template fidelity, approval, population completeness, workbook execution, or reconciliation. Parsing a synthetic XLSX proves the tested sheet names and Summary value only. The output package remains blocked until its separate governance and validation requirements are met. Decimal tolerance, per-participant reconciliation, authenticated oracle evidence, and final-output integration remain open.
