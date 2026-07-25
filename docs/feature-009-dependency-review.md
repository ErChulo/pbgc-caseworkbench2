# Feature 009 Phase 1 dependency and support review

**Reviewed:** 2026-07-19
**Scope:** Direct Phase 1 runtime and development dependencies.

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
- A connected `npm audit --omit=dev` reported zero known vulnerabilities. Full production and development dependency auditing remains a release gate whenever the lockfile changes.
- SheetJS uses the vendor's official 0.20.3 distribution rather than the obsolete npm registry release.
- Node.js 23.11.0 is installed locally, while a transitive ESLint package warns that it supports Node 20.19+, 22.13+, or 24+. Standardize on Node 22 LTS (at least 22.13) or a later jointly supported release before Phase 2.
- Chromium 150 is installed and is the Phase 1 executable. Microsoft Edge is absent; Edge E2E validation remains unresolved.
- Build-size review: the Phase 1 single HTML is approximately 200 KiB. Parser libraries are not yet imported into production code, so later phases must repeat the size review.
- No license conflict was found among direct packages. Transitive license and dependency review must be repeated before release and whenever the lockfile changes.

## Disposition

Dependencies are suitable for the bounded bootstrap, but Phase 2 remains blocked by ADR approval, a supported Node toolchain decision, Edge validation, and a connected vulnerability audit.
