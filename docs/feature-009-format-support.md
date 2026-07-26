# Feature 009 format support

**Recorded:** 2026-07-25
**Scope:** Passive inspection and local normalization only.

## Supported inputs for Feature 009

- Plain text
- JSON
- CSV
- TSV
- PDF text and metadata
- DOCX text and metadata
- PPTX text and metadata
- XLSX workbook structure and stored cell values
- ZIP archives and nested ZIP archives
- GZIP archives

## Explicit limitations

- The feature does not execute Office macros.
- The feature does not execute embedded scripts, links, or untrusted binaries.
- The feature does not claim antivirus scanning.
- The feature does not claim active Office execution.
- The feature does not infer, correct, normalize, or impute participant data.
- Unsupported, encrypted, corrupt, or unsafe artifacts are surfaced as fail-closed results and do not force unrelated intake to stop.

## Evidence handling

- Source artifacts remain immutable.
- Observed values are preserved as recorded.
- Automated outputs remain proposals unless a typed human decision establishes a governed final state.
