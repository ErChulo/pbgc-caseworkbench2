# Research: Population Profile

**Feature**: 003
**Updated**: 2026-07-29

## Decisions

### 1. Population Detection

**Decision**: Deterministic candidate keys from SHA-256 hashes of candidate content. Candidates are created from passive extraction results without formula execution or participant value imputation.
**Rationale**: Constitution prohibits inventing participant data. Deterministic hashing enables tamper detection and downstream verification.
**Alternatives considered**: Random UUIDs (not deterministic), heuristic-based detection (would invent values).

### 2. Evidence Binding

**Decision**: Population candidates preserve exact evidence observations: artifact hash, citation ID, source locator, evidence kind, and optional observed value.
**Rationale**: Constitution requires complete source citations and traceability.
**Alternatives considered**: Summarizing evidence (loses traceability), discarding evidence (violates governance).

### 3. Sensitivity Classification

**Decision**: Sensitivity is classified as authorized-real, de-identified, synthetic-mock, or unknown at ingestion time. The classification is never inferred.
**Rationale**: Constitution requires explicit handling of PII and synthetic data. Inference could silently misclassify real PII as synthetic.
**Alternatives considered**: Automatic PII detection (error-prone, could miss sensitive data), no classification (violates privacy requirements).

### 4. Decision Chains

**Decision**: Population candidates undergo gapless, unbranched decision chains with approve, reject, revoke, and supersede transitions. Only human actors may decide.
**Rationale**: Constitution requires human governance and prevents silent status changes.
**Alternatives considered**: Implicit approval (violates governance), auto-rejection (violates human review).

### 5. Workbook Profiling

**Decision**: Workbook and tabular populations are adapted from passive extraction without formula execution. Formula execution count is always zero. Sheet names, cell addresses, and raw value kinds are preserved exactly.
**Rationale**: Constitution prohibits workbook formula execution in the case-intake pipeline. Deterministic profiling without execution enables reproducible population detection.
**Alternatives considered**: Formula execution (violates pipeline architecture, creates external dependencies), inventing cell values (violates Constitution).

### 6. Named Range Preservation

**Decision**: Workbook named ranges are observed and preserved exactly: name, source tab, cell address, and definition sheet. Named ranges are not generated or sanitized.
**Rationale**: Named ranges are architecture declarations; they must be preserved as-is for downstream use.
**Alternatives considered**: Normalizing or generating names (would alter semantics), dropping ranges (would break architecture).

### 7. Content Hashing

**Decision**: Population candidate, evidence observation, and decision hashes are deterministic SHA-256 over canonical JSON content. Decisions bind exact workbook profile hash, enabling tight governance coupling.
**Rationale**: Enables tamper detection, stable decision chain validation, and downstream reproducibility.
**Alternatives considered**: Hash-free candidates (no tamper detection), including mutable metadata (makes hash unstable).
