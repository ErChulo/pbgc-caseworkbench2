# Workbook validation binding — 2026-11-05

## Change

Workbook structural validation now records the actual workbook-content hash, BuildSpec, architecture and population hashes, and the supplied validator-version label in its deterministic content hash. The validator recomputes the same workbook hash as the builder and reports an error when the recorded workbook hash is stale. Validation evidence includes those lineage fields. Reconciliation reruns structural validation on the supplied workbook, checks the supplied validation content hash and ID, and rejects old unbound, modified, or stale validation evidence. Legacy validation records must be regenerated; no migration invents a binding. Operational validation time remains outside the deterministic validation hash.

The workbook hash helper was extracted from the generator without changing its hashing algorithm. Hashes are integrity checks, not signatures or proof that an external execution or human review occurred. The validator-version string is supplied by the caller, not an authenticated code identity.

## Tests

- Focused validation, reconciliation and production-pipeline tests: 41 passed, including synthetic normal, stale-workbook, changed-content, tampered-result, legacy-record, version, and timestamp cases.
- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, and `npm run validate:contracts`: passed.
- `npx vite build --outDir /home/user/cwb-build-check/dist` and the single-file verifier run from that separate directory: passed. Build warns about browser externalization of `node:fs/promises`. The existing locally modified `dist/pbgc-caseworkbench.html` was not overwritten.
- `npm test`: 120 files passed and one failed; 1001 tests passed and four skipped. The failed Data Dictionary suite sees a Git LFS pointer rather than approved workbook bytes. No substitute was used.
- Browser `file://` testing, actual Excel/BCV execution, and independent actuarial approval were not performed.

## Remaining limitations

The validator does not yet fully verify the supplied BuildSpec, approved population, complete workbook semantics, or external workbook bytes. The in-memory workbook model and exported XLSX are distinct representations; binding to the former does not prove the latter is faithful. Existing structural checks currently expect support sheet names in `workbook.sheets` even though the generator represents support sheets separately; generated workbooks may therefore be marked invalid until that mismatch is resolved and independently tested. Reconciliation still keys values by formula rather than participant/row and identifies the oracle by ID rather than content hash. Numeric tolerance uses binary floating point. The final package remains blocked pending content, provenance, reconciliation, and review gates.
