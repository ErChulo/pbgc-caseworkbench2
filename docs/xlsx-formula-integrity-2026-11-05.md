# XLSX formula integrity milestone — 2026-11-05

## Changes

- Calculation cells marked as formulas are emitted as OOXML formula cells, not text. No cached result is supplied; SheetJS can present an uncached formula as a stub on reading, so the test also inspects the worksheet XML. Strings beginning with `=` remain literal strings.
- Named range targets use the declared tab and cell address with Excel sheet-name quoting and apostrophe escaping. Sheet-scoped names use the matching sheet index. Missing sheets, invalid addresses, duplicate cells, malformed formulas, and a formula sharing a cell with an input value are rejected.
- Sheet visibility is written in workbook sheet metadata. The current dense calculation-sheet representation rejects grids above two million positions rather than risking unbounded allocation; sparse serialization remains future work.
- The wizard clears previous workbook bytes on a new build, blocks partial or failed compilation, and currently permits generation only when each source formula exactly equals its compiler-produced canonical formula. This intentionally conservative gate blocks cases that would need the builder to materialize a different canonical formula. It does not make the lower-level builder a compiled-artifact consumer; that remains necessary for a complete production pipeline.

## Verification and limits

- Synthetic focused workbook, reconciliation and production-pipeline tests passed; final serializer and compilation-gate tests: 16 passed.
- Full test suite: 121 files passed, one failed; 1,029 tests passed and four skipped. The sole failure is the approved Data Dictionary fixture, which remains a Git LFS pointer instead of the approved workbook bytes.
- Typecheck, lint, formatting, schema and contract checks passed. The standalone HTML built in a separate directory and passed single-file verification. The existing `node:fs/promises` browser-externalization warning remains.
- XLSX round trips and XML checks establish serialization structure only. Excel calculation, recalculation behavior, BCV/ValTool/Runtime execution, browser offline operation, approved decimal policy, actuarial review, and final release have not been demonstrated. The final package remains blocked by other integrity and approval requirements.
- The existing local `dist/pbgc-caseworkbench.html` modification was preserved and is not part of this milestone.
