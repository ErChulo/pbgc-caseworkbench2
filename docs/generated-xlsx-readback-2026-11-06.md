# Generated XLSX model checks and read-back — 2026-11-06

The V1 wizard now publishes a downloadable workbook only after the generated workbook model passes the existing structural checks without errors or warnings, the serializer produces XLSX bytes, and those bytes are read back against the generated XLSX specification. A model with no formula cells is blocked. Findings are reported by code rather than printing case values. The check snapshots the model before asynchronous work, and the wizard rechecks the active case and build sequence before publishing output.

The bounded read-back compares sheet names and order, visibility, worksheet dimensions, the cell inventory, literal values and types, formula text, and named-range scope and references. Formula cells must remain uncached formula stubs; SheetJS can expose an uncached stub's in-memory `v` as zero, which is not an execution result. A test modifies synthetic worksheet XML to insert a cached result and confirms that the check rejects it. The reader receives a copy because SheetJS can attach properties to its input.

The workflow records the SHA-256 of the exact generated XLSX bytes in its local status message. It holds an immutable browser `Blob` snapshot rather than exposing the mutable byte array through the orchestrator; invalidation clears the live download reference. The hash is not a signature or proof of authority, and the result is not automatically attached to the final package.

## Limits and blockers

These checks compare the model, generated specification, and output using the same SheetJS library for writing and reading. They are not independent validation, do not inspect every OOXML feature, and do not execute formulas or prove actuarial correctness, external provenance, reviewer authority, or approval. The read-back function is only for bytes generated in memory by this workflow; it is not an untrusted XLSX intake parser or ZIP-bomb defense. It bounds read-back input to 64 MiB and the generated dense grid plus formulas to one million slots; the preflight happens after model/spec construction but before serialization. Larger outputs fail closed rather than being silently truncated. Native browser memory limits may be lower.

The current I/B participant mapping and final release gates remain blocked pending approved routing, authenticated execution evidence and required human reviews. The successful checked-XLSX path was exercised with synthetic compiled workbook fixtures, not an end-to-end production case. No Excel, BCV, ValTool, Runtime, or human actuarial execution or approval is claimed.

## Verification

Typecheck, lint, formatting, schema and contract checks passed. The targeted workbook/reconciliation and architecture tests passed (137 tests before the final no-formula regression case; the final compiled-workbook tests also passed). The full suite before that last regression case reported 1,124 passed and 4 skipped, with the same single failure because the approved Data Dictionary workbook is an unavailable Git LFS object. The isolated single-file build and verification passed; all 55 Chromium tests passed using a synthetic workspace, including direct-file offline checks. A final wording-only change and additional no-formula and immutable-Blob assertions were checked in targeted tests afterward. Firefox, WebKit, native workspace permissions, every offline path, and external calculation engines remain unverified. Vite continues to warn about the browser-externalized architecture rule loader. The pre-existing modified `dist/pbgc-caseworkbench.html` was preserved.

Codegraph and caveman were unavailable for this slice, so local repository search was used.
