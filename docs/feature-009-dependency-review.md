# Feature 009 dependency and support review

**Reviewed:** 2026-07-25
**Scope:** Current Phase 9 runtime and development dependencies after acceptance-corpus and browser coverage updates.

## Runtime dependencies

| Package              | Pinned version                     | License    | Intended role                     |
| -------------------- | ---------------------------------- | ---------- | --------------------------------- |
| `react`, `react-dom` | 19.2.7                             | MIT        | Local browser UI                  |
| `ajv`                | 8.20.0                             | MIT        | Draft 2020-12 contract validation |
| `fflate`             | 0.8.3                              | MIT        | Passive ZIP/GZIP handling         |
| `hash-wasm`          | 4.12.0                             | MIT        | Incremental local hashing         |
| `pdfjs-dist`         | 6.1.200                            | Apache-2.0 | Passive PDF inspection            |
| `xlsx`               | 0.20.3 official SheetJS CE tarball | Apache-2.0 | Passive spreadsheet inspection    |

All runtime assets are bundled locally. None authorizes network transmission, macro/formula/script execution, or active document content.

## Development dependencies

The lockfile pins Vite 7.3.6, TypeScript 6.0.3, `vite-plugin-singlefile` 2.3.3, Vitest 3.2.7, Playwright 1.61.1, ESLint 9.39.5, Prettier 3.9.5, Testing Library, React type packages, and their transitive trees. Direct development dependencies declare MIT or Apache-2.0 licenses.

## Findings

- `npm ls --depth=0` resolves the pinned direct dependency graph without missing packages.
- A connected `npm audit --omit=dev` previously reported zero known vulnerabilities on 2026-07-19.
- A fresh offline rerun in the current session could not reach `registry.npmjs.org`, so the earlier connected result remains the recorded evidence for this checkpoint.
- Chromium 150 is installed and used for browser verification.
- Microsoft Edge is available locally and used for browser verification where supported.
- Build-size review is still a release gate whenever the lockfile or bundling changes.
- No license conflict was found among direct packages. Re-run dependency and license review before release and whenever the lockfile changes.
