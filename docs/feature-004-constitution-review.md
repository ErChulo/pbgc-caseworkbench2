# Feature 004 constitution compliance review

**Recorded:** 2026-07-29
**Scope:** Review of the V1 Architecture Selector against Constitution Sections 3, 5, 6, 7, 12, and 14 using the current implementation and automated validation evidence.
**Disposition:** The implemented selector is aligned at the Implemented and Tested maturity levels, subject to the open policy-approval boundary below.

## Section 3: Deterministic actuarial computation

- Architecture selection, field classification, dependency analysis, and content hashing use deterministic TypeScript logic rather than narrative LLM output.
- Fixed synthetic inputs replay to the same recomputed content hash. Full operational record bytes are equal only when record IDs and timestamps are injected equally.
- The selector defines calculation architecture; it does not claim to calculate or independently validate participant benefits.

## Section 5: Effective-dated plan history

- Scenario runs carry explicit start and end dates derived from applicable plan-rule and case-control periods.
- Conflicting applicable provisions become unresolved items rather than being silently collapsed into one rule.
- Material date evidence remains subject to source traceability and human approval.

## Section 6: Population-driven design and missing data

- Tab selection requires approved, hash-bound population characteristic evidence; matching sheet names alone cannot satisfy `populationRequirement`.
- Scenario population triggers and exclusions consume the same validated dimensions. Split plan-rule triggers produce unique historical runs from deterministic all-condition range intersections, with every contributing approved rule ID/hash retained.
- Required-field and record-count gaps produce explicit unresolved items; missing values are not replaced with zero or invented.
- The integration pilot verifies that material scenario, population/tab, field/classification, and dependency blockers are returned together and prevent architecture output.

## Section 7: Separation of V1 concepts

- `CALC_INDICATOR`, `CALCULATION`, and per-run I/O/B metadata remain separate model and classification concepts.
- The classifier enforces `CALC_INDICATOR` as I/O/B `B` and `CALCULATION` as I/O/B `N` without treating every `B` value as a calculation indicator.
- Unit coverage verifies these reserved-field rules and deterministic priority resolution.

## Section 12: Reproducibility and artifact lineage

- Architecture output retains case, policy-version, population-artifact, population-candidate, plan-rule citation, and run-justification identifiers or hashes as applicable.
- `architectureContentSha256` is recomputed over governed content while excluding operational identity and build timestamp fields.
- The synthetic integration pilot verifies deterministic replay and stable content identity when only `architectureId` and `builtAt` differ.

## Section 14: Workbook and generated-artifact invariants

- The architecture contract preserves role-aware source tabs, interval run descriptors, generic field inventory, per-run I/O/B classifications, formula dependencies, and named ranges for downstream formula compilation and workbook generation.
- The effective population approval commits to the exact source artifact and deterministic workbook-profile hash. The builder rehashes observed workbook content and named ranges, so workbook-only or named-range mutation cannot be authorized by a caller-recomputed assertion.
- Observed canonical `Summary`, `Tables`, and `UD Table` sheets are explicit support-role `SourceTab` entries with profile lineage and null population linkage; participant values are not promoted into architecture descriptions.
- Contract and schema validation passed for all 15 design/runtime schema pairs, including the V1 architecture schema.
- Feature 004 produces an architecture artifact, not an executed workbook. No workbook application or external calculation system was run.

## Open approval boundary

The repository YAML policies and field-name glossary remain provisional candidate-only artifacts. Production loading fails closed unless a human approval is bound to the exact policy-content hash and includes reviewer metadata and real citations with source artifact hashes, precise locators, and effective dates.

T004-T006 and T011 remain unchecked because synthetic fixtures cannot provide that authority. A responsible human reviewer must approve the repository content with real citations, exact hashes, and applicable effective dates before production use.

## Recorded validation

Post-remediation focused evidence: `npm run typecheck` passed and 32/32 focused architecture tests passed across five files, including 7/7 integration tests. The broader counts below predate this remediation and are retained as historical evidence, not as a current full-quality claim.

- Integration: 62/62 tests passed across 17 files, including architecture selection 8/8.
- Staged-tree full quality: 678/678 tests passed across 80 files.
- Schemas: 15 design schemas and 15 matching runtime schemas passed validation.
- Build: one verified self-contained HTML file, 752,023 bytes.
- External execution: none. No Excel, ValTool, Runtime, ATPBGC, BCV, or other external-system execution is claimed.
