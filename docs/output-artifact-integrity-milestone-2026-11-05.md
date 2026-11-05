# Output artifact integrity milestone — 2026-11-05

## Change

Linked output references must point inside the active case folder. On case reopen and again before export, the app opens each linked file and compares its current SHA-256 with the persisted reference. Missing, unreadable, changed, malformed-path, and other-case files are not accepted. On a failed export check, the app stops the export and tells the user to inspect and relink the file. Reopening a case does not silently restore failed references. Asynchronous operations avoid applying results to another active case. These checks establish byte identity at the time of checking only: they do not prove schema validity, derivation, approval, or a successful calculation, and cannot prevent later external modification of a file. The existing final-output verification blocker remains in force.

The link panel now explains the active-case restriction and distinguishes the user-entered maturity label from verified maturity. The single-file HTML was regenerated from source.

## Evidence

The pinned `xlsx` 0.20.3 tarball was recovered from a GitHub mirror, checked against the exact SHA-512 in the existing lockfile, and placed in the local npm cache; no dependency or lockfile was altered. `npm ci --prefer-offline --no-audit --no-fund` then passed. This is an environment recovery, not a change to the project's dependency source.

- `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run validate:schemas`, `npm run validate:contracts`, `npm run build`, `npm run verify:single-file`: passed. Build warns that `node:fs/promises` is externalized for browser compatibility; browser behavior remains to be verified.
- Focused unit and zero-network tests: 28 passed, including four byte-verification tests and 13 static zero-network tests.
- `npm test`: 119 test files passed, one failed; 981 tests passed, four skipped. The failed Data Dictionary suite reads a 131-byte Git LFS pointer instead of the approved 104,966-byte workbook. `git-lfs` is not installed and the LFS download host is outside this environment's network allowlist. The parser correctly fails closed. The workbook was not replaced with a synthetic or unverified substitute.
- `PW_CHROMIUM_EXECUTABLE_PATH=/tmp/chromium npx playwright test web/tests/browser/single-html-offline.spec.ts --project=chromium`: failed before either test ran; the downloaded browser cannot load `libnspr4.so`, `libnss3.so`, and `libnssutil3.so` in this sandbox. The browser-specific repository skills referenced by AGENTS.md were not installed. Consequently file:// behavior and runtime zero-network behavior remain unverified here.

## Remaining work

The final output still requires content/schema validation, lineage authentication, reconciliation, explicit human approval, and production pipeline integration; the current reference checker intentionally cannot unlock it. Verify browser flows in a supported environment and rerun the complete suite with the approved LFS workbook. Official Excel/BCV/ATPBGC execution and actuarial review have not been performed.
