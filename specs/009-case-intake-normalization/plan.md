# Implementation Plan: Case Intake and Evidence Normalization

**Branch**: `009-case-intake-normalization` | **Date**: 2026-07-18 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/009-case-intake-normalization/spec.md`

## Summary

Build a local-first React and TypeScript application that compiles to one downloadable HTML file and performs case creation, artifact preservation, incremental SHA-256 hashing, inventory generation, deterministic normalization, relationship/classification proposals, quarantine review, and manifest export entirely on the user's device. A user-selected local case-workspace directory is the production source of record; browser-private storage is cache-only. The initial implementation has no server, database, cloud account, external API, or embedded LLM call.

The design separates pure deterministic domain logic from browser I/O, parsing, workers, and UI. Original bytes are copied once into content-addressed local object storage, verified after copy, and never overwritten by the application. Every receipt, extraction, review, and status transition is append-only and traceable. The application blocks production completion if the browser cannot provide the local persistence capability required to preserve original evidence.

## Technical Context

**Language/Version**: TypeScript 5.x with strict type checking; HTML/CSS; existing Python 3.12 scaffold remains separate and is not part of the browser runtime

**Primary Dependencies**: React and React DOM; Vite with `vite-plugin-singlefile`; `hash-wasm` for chunked incremental SHA-256; `fflate` for ZIP/DEFLATE/GZIP; SheetJS Community Edition for local workbook inspection; PDF.js display API for local PDF text/metadata extraction; Ajv for JSON Schema validation

**Storage**: User-selected local directory through File System Access API as the production workspace; in-memory session state; optional OPFS cache only; canonical JSON/JSONL manifests and audit records; no database

**Testing**: Vitest for pure domain and worker tests; React Testing Library for component behavior; Playwright in Chromium for browser capability, file intake, zero-network, and single-HTML end-to-end tests; independent SHA-256 fixtures and golden canonical manifests

**Target Platform**: Current Chromium and Edge desktop after an early feasibility gate; modern Firefox/Safari may use limited review/demo mode where required File System Access capabilities are unavailable; production distribution is one self-contained `dist/pbgc-caseworkbench.html`, opened directly where supported or served unchanged by an approved data-blind localhost/static-origin launcher

**Project Type**: Local-first single-page browser application with no backend

**Performance Goals**: Produce an initial reconciled inventory and SHA-256/provenance status for up to 1,000 artifacts and 10 GB within 60 minutes in the recorded acceptance environment; keep the UI responsive by moving hashing and extraction off the main thread; bound memory to configurable chunks rather than whole-package buffering

**Constraints**: One distributable HTML file; offline after download; no runtime CDN or network dependency; real PII remains device-local; no Office/macro/script execution; no silent artifact overwrite; no narrative-LLM calculation or evidence approval; deterministic content-derived output; package-level continuation after artifact-level failures; initial streaming ZIP extraction limited by library/browser capabilities

**Scale/Scope**: One active local case workspace at a time; local catalog enforces authoritative case-identifier uniqueness within the selected workspace root; packages up to 1,000 artifacts/10 GB, individual ZIP containers up to the supported 4 GB ZIP processing boundary; six user stories and no actuarial/V1 processing

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

| Constitutional gate | Pre-design result | Design evidence |
|---|---|---|
| Deterministic actuarial computation; no narrative LLM calculation | PASS | Feature performs no calculation or plan interpretation; all normalization and proposals use versioned deterministic rules. |
| Evidence traceability and source authority | PASS | Content-addressed originals, precise locators, proposal/approval separation, provenance events, and manifest contracts preserve traceability. |
| Effective-dated history and unresolved conflicts | PASS | Date candidates remain separate; authority, amendment, supersession, replacement, and conflict are human-reviewed proposals. |
| No invented or imputed participant data | PASS | Population parsing preserves raw, missing, malformed, and zero values distinctly; no corrections or entitlement logic. |
| Human review and unresolved issues | PASS | Append-only review/status events and explicit unresolved items cover all approval boundaries. |
| Reference-library and canonical-artifact governance | PASS | Reference assets are never runtime defaults or production inputs; mock/reference use is labeled and separately approved. |
| Regulatory/policy currency | PASS | No legal conclusion is made; source-role categories and review state remain explicit. |
| Privacy, confidentiality, and binary security | PASS WITH LIMITATION | Local-only PII boundary and zero-network build pass. Browser inspection cannot certify malware absence; uncertain/unsupported artifacts are quarantined or unresolved and never labeled safe. |
| Reproducibility and lineage | PASS | Canonical deterministic payloads, content hashes, snapshots, rule versions, containment, and append-only events provide end-to-end lineage. |
| Evidence-based maturity claims | PASS | Tests and external execution are reported only when actually run; inspection does not imply Office/macro execution. |
| Architectural decisions | PASS | Material choices and rejected alternatives are recorded in `research.md`; a future ADR is required before changing the local-only trust boundary. |
| High-risk prohibitions | PASS | No PII in Git, no `mySort`, no workbook generation, no silent conflicts, no manual generated-artifact patching. |

**Pre-design gate**: PASS. No constitutional violation or unresolved business blocker.

**Post-design gate**: PASS. Browser capability limitations are explicit, fail closed, and do not weaken constitutional controls.

## Proposed Architecture and Boundaries

### Runtime layers

1. **Application shell and review UI**
   - Case/workspace gate, intake wizard, artifact inventory, quarantine queue, classification/relationship review, lineage view, unresolved-item queue, and export controls.
   - UI never mutates domain records directly; it submits typed commands and renders returned state.

2. **Deterministic domain core**
   - Case identity and uniqueness, state machines, snapshot comparison, canonical serialization, stable content-derived identifiers, duplicate decisions, proposal rules, validation, and manifest reconciliation.
   - Pure TypeScript with no DOM, file-system, clock, random, or network access. Clock/UUID/reviewer inputs enter through explicit ports and remain outside reproducibility hashes where appropriate.

3. **Local workspace and artifact adapters**
   - File/folder selection, capability gate, immutable copy, post-copy hash verification, content-addressed paths, audit-event append, manifest import/export, and local catalog lookup.
   - OPFS may cache derived previews but is never the sole authoritative evidence store.

4. **Worker pipeline**
   - Chunked hashing, signature/media detection, ZIP extraction, Office/PDF/tabular parsing, secret/PII screening, and text fingerprints run in dedicated workers with bounded queues and cancellation.
   - Workers receive transferable chunks or `Blob` slices; no parser evaluates macros, formulas, scripts, or embedded code.

5. **Parser/screener registry**
   - Selects a parser from byte signatures plus declared type, records mismatches, and returns observations/findings rather than authority decisions.
   - Each parser declares supported tier, version, limits, output schema, active-content checks, and failure behavior.
   - Shared passive parsers for plain text, JSON, CSV/TSV, spreadsheets, PDF, DOCX, and PPTX are a blocking foundation for content-dependent source-role classification, near-duplicate analysis, and population profiling.

6. **Contract/export boundary**
   - Seven JSON Schema contracts define the case workspace, evidence manifest, typed screening/quarantine/classification/authority/relationship/provenance/validation records, normalization outputs, governed de-identified or synthetic/mock exports, and reusable local evidence-acquisition/structured-extraction packages.
   - Later plan-rule/population/V1 modules consume approved exports and cannot bypass quarantine or unresolved statuses.

7. **Evidence Acquisition & Structured Extraction Framework**
   - Reusable intake-layer registry and package validator for future modules' missing-fact declarations, candidate document/report types, recommendation-only source priorities, Draft 2020-12 extraction schemas, versioned extraction instructions, and rerun triggers.
   - Uses separate canonical `deterministicRequestPayload`, `deterministicPackagePayload`, and `deterministicProposalPayload` structures. Each lowercase SHA-256 covers only its canonical payload; UUIDs, timestamps, paths, runtime/UI state, actor data, decision history, and transport metadata remain operational and cannot alter hashes.
   - Generates, validates, imports, and stores packages locally; validates returned proposals against registered schema/instruction hashes; preserves exact artifact SHA-256 citations, uncertainty, conflicts, and requesting-module rerun metadata.
   - Automated extraction remains proposed and downstream-blocked. Append-only typed human decisions approve, reject, revoke, or supersede the exact proposal hash, and effective status is derived by replaying the decision chain. The framework does not transmit packages, call an external LLM, interpret plan rules, calculate benefits, or produce downstream reports.

### Trust and network boundary

- The production single-HTML artifact contains no LLM client, telemetry SDK, analytics, remote fonts, CDN URLs, update checker, or general-purpose network adapter.
- A restrictive Content Security Policy sets `connect-src 'none'` for production. Playwright asserts that no request leaves the local document.
- Real participant data is processed locally only. Feature 009 may create, validate, import, and store governed extraction or export packages on the device, but it contains no external-LLM client and never transmits a package. Any later external transmission mechanism is outside this production runtime and must accept only separately approved, schema-valid de-identified or synthetic/mock data.
- Reviewer identity is locally asserted under the organization's external authorization policy. The app records the asserted identity and complete decision history but does not claim cryptographic identity proof. Signed approvals are an optional future capability.

## Browser and Single-HTML Constraints

### Early feasibility and go/no-go gate

Before domain or UI implementation proceeds beyond scaffolding, a disposable technical spike must verify the complete delivery boundary in current managed Chromium and Edge:

- direct `file://` behavior for File System Access and required secure-context APIs;
- selection, reopening, permission denial, and permission revocation for a user-visible workspace;
- an approved localhost/static-origin fallback that serves the unchanged HTML and performs no server-side processing or case-data transmission;
- inlining of Web Workers, WASM, parser assets, schemas, JavaScript, and CSS;
- a restrictive Content Security Policy, zero outbound requests, no service worker, and exactly one built HTML file.

The spike records evidence and a go/no-go decision in the architecture decision record. A failed direct-file result does not authorize weaker storage or network controls: production must use the approved data-blind local static origin or stop. A failure to inline required runtime assets or enforce zero network is a stop condition requiring plan revision before substantive implementation.

- `crypto.subtle.digest()` is used only as an independent small-fixture cross-check because it requires the entire input in memory. Production hashing uses an incremental worker implementation.
- File System Access is capability-detected. Production intake requires a user-selected writable case-workspace root. Direct-file execution is used only where the early gate proves it. Otherwise the unchanged downloadable artifact runs from the approved data-blind localhost/static origin. If required persistence remains unavailable or denied, the app enters a clearly labeled non-production session mode that cannot claim durable immutable preservation or resumability.
- Browser storage quotas and eviction make IndexedDB/OPFS unsuitable as the only evidence repository. OPFS is optional cache/scratch space and every cache entry is reconstructable.
- The build must inline JavaScript, CSS, workers, WASM, icons, schemas, and parser assets. CI fails if `dist/` contains more than the one expected HTML file or if the document references a non-data external asset.
- The production target is desktop Chromium/Edge because directory read/write is required. Firefox/Safari support is limited until equivalent user-visible directory persistence is verified.
- Browser code cannot guarantee OS-level write-once storage. Immutability is enforced by content-addressed, create-once application behavior plus hash verification; external edits are detected and quarantined.

## Local Artifact Intake and Workspace

### Workspace layout

```text
<selected-workspace>/
├── case-index.json
└── cases/<case-uuid>/
    ├── case.json
    ├── objects/sha256/<first-two>/<sha256>
    ├── receipts/<artifact-record-uuid>.json
    ├── attempts/<attempt-uuid>/
    │   ├── snapshot.json
    │   ├── events.jsonl
    │   ├── manifest.json
    │   ├── validations.json
    │   └── normalized/
    ├── reviews/events.jsonl
    └── exports/
```

- `case-index.json` is the local uniqueness catalog. A duplicate production PBGC identifier stops creation and routes to the existing case decision flow.
- Original objects use the lowercase SHA-256 as their filename. Existing objects are never overwritten; a matching path is re-hashed before reuse.
- Receipt records preserve each filename/source/custody context even when multiple receipts reference the same object.
- Folder selection captures relative paths without rewriting source files. Drag/drop and `<input type=file multiple>` are fallback intake methods; directory selection is required for production persistence.

### Containers and nested members

- ZIP is the initial archive format. The container is copied and hashed before extraction.
- Each successfully extracted member is streamed to a new content-addressed object, independently hashed, inventoried, and linked to the parent container with observed path, normalized safe display path, sequence, sizes, and extraction result.
- Reject path traversal, absolute paths, control characters, excessive nesting, duplicate member paths, unsupported compression methods, excessive member counts, configured decompression ratios, and configured expanded-byte totals. Findings quarantine the affected scope while preserving observed bytes.
- Partial extraction retains the container and successful members. Missing/unobserved members are never synthesized.

## Hashing, Identity, and Determinism

- Use incremental SHA-256 in a Web Worker with fixed-size chunks (default 4 MiB, configurable and recorded). Stream each original once for hashing and again during verified copy when necessary; verify the stored object after write.
- For small test fixtures, cross-check against Web Crypto SHA-256 and published vectors. Hash values are lowercase 64-character hexadecimal.
- Case UUIDs, attempt UUIDs, receipt UUIDs, and review-event UUIDs are random immutable identities generated from the browser cryptographic RNG. They are persisted and not regenerated during resume.
- Content-derived records use a stable identifier derived from the canonical tuple of record type, source SHA-256, source locator, and rule version.
- **PBGC Case Workbench Canonicalization Profile v1** governs deterministic bytes: contract-declared field inclusion/exclusion, NFC preprocessing, canonical object keys, registered set/order arrays, recursive order-significant fallback, duplicate/null/absence rules, and UTF-8 serialization. RFC 8785 is used specifically for finite JSON-number serialization; exact lexical decimals use canonical decimal strings. Intrinsic `PopulationCandidate.evidence` semantics apply only through an explicit schema type. Arbitrary candidate-shaped export objects are not duck typed and their unregistered arrays remain order-significant. Source priorities remain ascending and unique.
- A required `deterministicPayload` excludes run timestamps, random UUIDs/event IDs, user-session identifiers, UI state/order, and asserted reviewer identity. Its canonical lowercase SHA-256 is the manifest content ID. A separate `operationalMetadata` record may contain those excluded values and remains linked without changing deterministic comparisons.

## Intake Attempts and Resume

1. Discover input paths and capture receipt metadata.
2. Hash all submitted artifacts and create the immutable expected-artifact snapshot.
3. Compute the canonical lowercase SHA-256 snapshot ID; store any random `snapshotRecordId` separately as operational identity.
4. Preserve originals, then process screening/extraction/classification per artifact.
5. Write append-only status events after every durable transition.
6. On resume, re-discover and re-hash the selected package. Resume in place only if the snapshot ID matches exactly.
7. Any add/remove/rename/change creates a new attempt linked through `priorAttemptId` and `divergenceReason`; unchanged object/receipt evidence is referenced without duplication.
8. Build two independent accounting ledgers over the same discovered-record IDs: one origin classification (`source-artifact` or `extracted-member`) and one terminal accounting classification (`accepted-for-processing`, `provisional-safety-block`, `pending-human-disposition`, `final-human-disposition-recorded`, `failed`, `duplicate`, or `excluded`) per record. Each ledger independently balances to `discoveredRecordTotal`. These categories reconcile work only and never grant release or a final governed state. US2 can complete accounting with provisional categories; US3 separately records typed human dispositions. Atomically replace only the derived current manifest through write-temp/verify/move semantics while prior manifests remain versioned.

## Duplicate, Classification, and Relationship Workflows

- **Exact duplicate**: cryptographic byte identity may be established automatically only by identical SHA-256. Duplicate accounting classification does not confer governed approval; affected records remain provisional unless an effective typed human decision establishes a governed final state. Preserve separate receipt provenance, and make any same-hash classification/release reuse explicitly traceable to its human-approved source.
- **Near duplicate**: propose using versioned deterministic fingerprints over supported extracted text (normalized-text SHA-256 plus token-shingle similarity). Threshold and rule version are recorded; no proposal is final.
- **Classification**: rules inspect byte signature, media type, container members, filename tokens, and supported extracted text. Every immutable ClassificationProposal remains `proposed` or `unresolved` with confidence, evidence, classifier/rule identity and version, and timestamp. Confidence never equals approval; a separate typed human-decision chain produces the computed effective classification projection without mutating the proposal.
- **Relationships**: authority, amendment, supersession, replacement, conflict, near-duplicate, and effective-period relations are directional proposal records. Effective approval, rejection, revocation, or supersession is derived only by replaying the gapless, same-subject typed human-decision chain; generic review events cannot confer final status.
- **Authority**: authoritative use requires a separate human AuthorityDecision bound to the source-role proposal, the current-effective human classification approval, their deterministic hashes, and the exact artifact bytes. Revocation, supersession, ineffectiveness, stale lineage, or changed bytes in the classification dependency immediately makes authority ineffective; renewal requires a new typed authority decision.
- **Production gating**: Artifact, ClassificationProposal, EvidenceRelationship, and PopulationCandidate source records remain blocked or proposal-only. Effective status is a read-only projection from the applicable complete transition matrix and gapless, non-branching, same-subject, exact-artifact typed human-decision chain; every noninitial record binds the immediately prior decision ID/content hash and timestamps never order replay. Missing, orphaned, system-authored, wrong-type/subject/target, stale hash, ineffective, revoked, branched, superseded, invalid-transition, or incomplete-manifest decisions keep downstream use blocked. Changed bytes create a new lifecycle. Authority still requires a separate active human AuthorityDecision.

## Screening and Quarantine

### Deterministic local checks

- Extension/media-signature mismatch, executable magic/signatures, scripts, archive path traversal and bombs, Office macro parts, embedded objects, external relationships, PDF active-content indicators, encrypted/password-protected content, high-risk extensions, and versioned secret/PII patterns.
- Authorized expected PII is labeled sensitive and access-controlled but is not quarantined solely for being PII. Unauthorized, misrouted, excessive, or unverifiable PII is quarantined.
- Macro-enabled Office artifacts are quarantined by default. After exact-hash human release they may undergo passive structural/text inspection only; macros and formulas are never executed.
- A failed, unavailable, unsupported, or inconclusive check is not a pass. An automated actor may produce only `screening-pending`, `rescreen-required`, `provisional-quarantine`, or `provisional-safety-block`, all downstream-blocking where applicable, with explicit limitations.

### Release semantics

- Release decisions bind to artifact SHA-256, finding IDs, reviewer identity, timestamp, and rationale.
- Different bytes always create a new artifact record and screening lifecycle.
- Same-hash receipts may inherit a release only through an explicit human decision linked to the reviewed artifact.
- Inherited release references the current effective human release for the same exact artifact SHA-256; changed bytes can never inherit it. Revocation and supersession reference the current effective human decision for the same artifact. Continuation of human-final quarantine references that final-quarantine decision; automated provisional blocking has no human-prior-decision requirement.
- Revocation invalidates downstream eligibility and marks derived outputs for revalidation; it never erases prior events or targets an already ineffective decision.
- Automated screening and re-screening create findings, provisional states, or disposition proposals only. `released`, `final-quarantine`, `rejected`, `revoked`, and `superseded` require typed human-final decisions. Different bytes always retain a separate immutable disposition history.

## Acquisition Lineage

The evidence manifest retains deterministic acquisition payload-hash references plus typed operational lineage nodes, edges, decision records, and promoted facts. Required paths are request → package → proposal → decision → promoted fact, with request → schema, request → instructions, and request → rerun-trigger branches. A promoted fact names one `factKey`, valid JSON Pointer, canonical fact-content hash, proposal and effective approval, exact artifact hashes and citation IDs, target governed record, and promotion versions. Node content hashes cover only their defined deterministic projection: request, package, and proposal payloads; decision ordinal/predecessor/proposal/type/result/version fields; canonical fact key/pointer/value; or rerun-trigger content. Semantic validation rejects invalid/ambiguous fact pointers, content/citation/artifact mismatches, revoked or cross-proposal approvals, conflicting duplicate promotions, orphan proposals, decisions without proposals, broken requesting-module/rerun paths, unresolved endpoints, and duplicate identifiers.

## Decision-chain replay and reviewer UX

- Acquisition proposal decisions form one append-only predecessor chain. Ordinal 1 has no predecessor; every later ordinal increments by exactly one and references the immediately prior decision ID plus its deterministic decision-content hash. That hash uses ordinal, prior content hash, proposal hash, decision type/result, and versions—never UUIDs, actor, rationale, or timestamp. Timestamps are display-only and never establish replay order. Allowed transitions are no-decision→approve/reject, approve→revoke/supersede, reject→supersede, and revoked→supersede. A rejection is not revoked, supersession targets the effective prior decision, and gaps, branches, cycles, duplicates, or ineffective targets fail closed.
- User-facing language and status presentation keep terminal accounting classifications, provisional security states, and human-final decisions visually and textually distinct. Ledger membership never appears as legal authority or release. Every block presents its cause, supporting finding, required evidence/reviewer, and available next action; acceptance tests verify language and behavior without prescribing visual design.

### Complete transition matrices

All chains use ordinal/predecessor structure: ordinal 1 has null predecessor fields; every later ordinal binds the immediate same-chain predecessor ID/content hash, with the matrix separately validating state transitions. Quarantine uses only `priorDecisionId` and `priorDecisionContentSha256` for same-chain linkage. Artifact `inherit-approval` is an initial eligibility decision with no eligibility predecessor and derives solely from a separate current-effective same-byte quarantine release ID/content hash. Unresolved-item replay permits valid reopened→resolved/accepted-risk successors. Every family rejects gaps, duplicate ordinals, branches, cycles, stale hashes, cross-subject links, invalid transitions, and ineffective supersession; timestamps never order replay.

### Malware limitation

The initial browser implementation detects known risky structures and active content but is not an antivirus engine and must never emit “malware free.” Optional future infrastructure may add an offline, signed, versioned signature pack or approved local scanner adapter, isolated behind the screening contract. No cloud scan may receive real case bytes.

## Population Detection and Mock Data

- Candidate rules use extension/signature, tabular structure, row regularity, field-name matches from versioned non-case-specific catalogs, and record counts. Output is a proposal with evidence/confidence.
- CSV/TSV parsing is streaming and preserves raw cell text, blank, missing, malformed, formula-like, and literal zero states. XLSX/XLSM parsing records stored values and formula text without calculating formulas.
- Explicitly schema-typed PopulationCandidate evidence is set-like and keyed by one shared evidenceKey used by references and manifest observations. The registry resolves each evidenceKey exactly once with exact citation/artifact/locator/kind/value agreement. Arbitrary export records never receive candidate semantics by shape; unregistered arrays remain ordered. Typed evidence permutations preserve candidate and manifest hashes; changed evidence changes all dependent identities.
- Development/test/demo work uses schema-valid de-identified fixtures or PBGC mock-population outputs. The mock generator is development-only, must use field structure rather than real values, and must pass re-identification/secret scans before fixtures enter Git.
- Every permitted local export package validates against `deidentified-export.schema.json`. Its canonical deterministic payload records mode, source snapshot/artifact hashes, purpose, destination class, field allowlist, removed direct/indirect identifiers, transformations, retained generalized non-identifying quasi-fields with field-level justification and residual-risk validation, findings, and explicit raw-PII/direct-or-indirect-identifier exclusions. UUIDs, timestamps, approval, and export provenance are operational metadata. De-identified real-data packages require separate human approval whose hash equals the enclosing deterministic payload hash; synthetic/mock packages remain distinctly labeled. Feature 009 stores or imports these packages locally and never transmits them.
- No participant entitlement, benefit, actuarial, or plan-rule inference occurs.

## Initial Format Matrix

| Tier | Formats | Initial behavior |
|---|---|---|
| Structured normalization | UTF-8 text, CSV, TSV, JSON | Local parse, raw-value preservation, structural validation, deterministic normalized output. |
| Office package inspection | DOCX, XLSX, XLSM, PPTX | DOCX/PPTX metadata and text extraction; XLSX/XLSM sheet metadata, stored-cell values, and formula-text extraction; macro/embedding/external-link detection; no formulas, macros, scripts, links, or embedded code execute. XLSM is quarantined by default. |
| PDF inspection | PDF | Local PDF.js metadata and text extraction where parseable; active-content and embedded-file findings where observable; no PDF action, JavaScript, attachment, or link executes; parser limitations recorded. |
| Archive | ZIP, GZIP | Preserve/hash container, bounded streaming extraction, containment lineage. GZIP yields one member. |
| Metadata/preservation only | PNG, JPEG, GIF, SVG, TIFF, EML | Signature and metadata screening; no OCR or authoritative content extraction. SVG/HTML/script-capable content quarantined for passive inspection. |
| Unsupported in initial scope | RAR, 7z, TAR, legacy DOC/XLS/PPT, password-protected/encrypted files, disk images, executables | Preserve, hash, inventory, classify as unsupported/inconclusive, and quarantine when risk requires. No external converter. |

Each promised parser has its own typed output, synthetic fixtures, deterministic unit tests, corrupt/encrypted/unsafe tests, and partial-package integration coverage. Parser selection uses signatures plus declared type. Unsupported, corrupt, encrypted, unsafe, or inconclusive results are structured fail-closed outcomes and never stop unaffected artifacts.

All seven promised passive format families and their minimum screening paths must pass before US4 source-role classification or near-duplicate analysis and before US5 population profiling. US4 and US5 may proceed in parallel only after that shared-parser gate.

## Architectural Decision Record

Before substantive implementation, create `docs/adr/009-local-first-evidence-intake.md` and obtain the recorded approving authority's decision. The ADR covers the local-first trust boundary, single-HTML distribution, `file://` versus data-blind static-origin execution, user-visible workspace storage, OPFS cache-only role, deterministic versus operational state, supported browsers, security posture, dependency strategy, and early feasibility evidence.

The ADR must contain status, context, decision, alternatives considered, consequences, approving authority, approval date, and supersession information. Until approved, the feasibility result is provisional and implementation may not proceed beyond the setup spike.

## Error Handling and Partial Continuation

- Artifact failures are isolated. Package status derives from artifact outcomes and may be complete, partial, blocked, failed, or interrupted.
- Each stage writes a validation result with subject, finding code, exact `checkPerformed` text or a stable check-definition ID/version pair, outcome, severity, evidence, limitations, affected artifact SHA-256 where applicable, rule-set version, deterministic result payload where applicable, and blocking effect.
- Worker crashes/timeouts mark the active artifact interrupted and allow retry; they do not roll back already durable artifact events.
- Storage denial/quota/write failure stops preservation for that artifact and prevents downstream eligibility. The source selection remains untouched.
- Unsupported/corrupt/encrypted inputs retain manifest records and originals where preservation succeeded.
- Cancellation stops scheduling new work, finishes or aborts the active chunk safely, persists progress, and produces an interrupted attempt.

## Testing Strategy

### Deterministic and contract tests

- Published SHA-256 vectors, independent hash cross-checks, chunk-boundary matrices, 0-byte and multi-gigabyte synthetic streams.
- Canonical JSON golden/property tests cover every registered set-like permutation, registered order-significant validation, recursive unregistered-array order sensitivity, recursively canonical object keys, mixed nested arrays/objects, repeated runs, null/absence/duplicate/indistinguishable values, stable content IDs, and operational-metadata exclusions. Source-priority tests accept deterministic ascending unique priorities, reject nonascending and duplicate priorities, and prove that a valid semantic priority change changes the hash.
- JSON Schema positive/negative fixtures for every contract and migration/version rejection tests.

### Domain/state tests

- Production case-identifier collision and explicit non-production override.
- Attempt snapshot equality, interrupted unchanged resume, changed/add/remove/rename divergence, and manifest preservation.
- Exact duplicates with separate provenance; non-identical same-name files; same-hash release/classification reuse.
- Every relationship/classification state transition, reclassification, rejection, supersession, revocation, and append-only history.
- Classification approval never creates authority; exact-hash AuthorityDecision approval, rejection, revocation, and supersession retain actor/time/rationale and prior decision lineage.
- Missing/invalid/zero population values remain distinct; no imputation or formula execution.

### Parser/security tests

- Nested ZIPs, partial/corrupt archives, traversal paths, duplicate paths, recursion/count/ratio/expanded-size limits, and unsupported compression.
- Benign/macro-enabled/encrypted Office fixtures, embedded objects, external relationships, executable signatures, PDF active content, secrets, authorized PII, and unauthorized PII.
- Assert real-PII fixtures exist only in ephemeral test generation outside Git; committed fixtures are synthetic or verified de-identified.

### Browser/end-to-end tests

- Capability gate, directory permission denial/revocation, local workspace reopen, interrupted worker, and storage failure.
- Mixed package continues after artifact quarantine; released exact hash proceeds; changed hash returns to screening.
- Build produces one HTML file, opens offline, registers no service worker, loads no remote asset, and makes zero network requests.
- Browser console has no uncaught errors; accessibility checks cover keyboard review/approval flows and status announcements.
- The SC-010 moderated usability protocol includes at least 20 authorized caseworkers, the defined first-attempt/no-coaching rules, all four tasks, anonymized retained evidence, and a 19-of-20 passing threshold.
- Performance corpus records browser/OS/hardware, package sizes, artifact counts, elapsed time, peak memory estimate, and worker responsiveness.

## Extension and Migration Path

- **Later plan-rule extraction** consumes only approved evidence/classification/date exports and retains artifact hashes/locators.
- **Later population profiling** consumes manifest-carried typed candidates only through computed effective human approval and consumes computed unresolved-item projections without mutating candidate sources or source cells. Arbitrary de-identified export records do not implicitly carry typed candidates.
- **Later actuarial calculation and V1 generation** consume versioned approved downstream contracts; they cannot read quarantined artifacts directly.
- Contract versions use additive compatible evolution where possible; breaking changes require explicit migration and preservation of prior exports.
- Optional future adapters may provide signed reviewer identities, cross-device case catalogs, approved local antivirus integration, OCR, more archive formats, or encrypted local workspaces. Each remains outside the initial runtime and requires constitutional/security review.

## Explicit Non-Goals

- Benefit calculations, plan interpretation, legal conclusions, entitlement determinations, PBGC guarantee limits, liability calculations, formula compilation, workbook/V1 generation, or Office execution.
- Server authentication, shared enterprise case catalog, cloud synchronization, remote storage, telemetry, external LLM calls, or cloud malware scanning.
- OCR, handwriting recognition, legacy Office conversion, password cracking, or a claim of comprehensive malware detection.
- Automatic approval of classifications or non-exact relationships.

## Project Structure

### Documentation (this feature)

```text
specs/009-case-intake-normalization/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── case-workspace.schema.json
│   ├── deidentified-export.schema.json
│   ├── evidence-acquisition.schema.json
│   ├── evidence-manifest.schema.json
│   ├── extraction-result.schema.json
│   ├── governed-records.schema.json
│   └── normalized-evidence.schema.json
└── tasks.md                 # Created later by /speckit-tasks, not in this phase

docs/adr/
└── 009-local-first-evidence-intake.md
```

### Source Code (repository root)

```text
package.json
vite.config.ts
tsconfig.json
web/
├── index.html
├── src/
│   ├── app/
│   ├── components/
│   │   ├── case-intake/
│   │   ├── inventory/
│   │   ├── quarantine/
│   │   ├── review/
│   │   └── lineage/
│   ├── domain/
│   │   ├── case/
│   │   ├── artifacts/
│   │   ├── attempts/
│   │   ├── classification/
│   │   ├── quarantine/
│   │   ├── lineage/
│   │   └── manifests/
│   ├── adapters/
│   │   ├── filesystem/
│   │   ├── parsers/
│   │   ├── screening/
│   │   └── exports/
│   ├── workers/
│   ├── contracts/
│   └── styles/
└── tests/
    ├── unit/
    ├── contract/
    ├── integration/
    ├── browser/
    └── fixtures/

src/pbgc_caseworkbench/       # Existing Python scaffold; unchanged by this feature
reference/                    # Reference-only assets; never production inputs by directory alone
```

**Structure Decision**: Add a standalone `web/` browser application so the existing Python namespace and case-specific scaffold remain isolated. Pure domain modules are independently testable and do not depend on React or browser adapters. All production runtime dependencies are bundled into the single HTML artifact.

**Implementation-source policy**: The React application shell, interaction model, layout, and styling are greenfield work for this repository. Prior PBGC repositories are unverified prototypes and are not UI or application-shell baselines. A later task may inspect a narrowly scoped domain rule, schema, fixture, calculation, or document only when independently validated and traceably adopted; Feature 009 remediation and initial scaffolding do not inspect or incorporate those repositories.

## Dependencies

### Initial production dependencies

- React/React DOM and Vite toolchain.
- `vite-plugin-singlefile`, with a build test that proves workers/WASM/assets are embedded.
- `hash-wasm`, `fflate`, SheetJS CE, PDF.js, and Ajv, each pinned through the lockfile and included in dependency/security review.
- Native File/Blob, Web Worker, File System Access, TextDecoder, Streams, and crypto RNG APIs.

### Development-only dependencies

- Vitest, React Testing Library, Playwright, TypeScript compiler, linting/formatting, and fixture builders.
- PBGC mock-population generator or adapter; generated fixtures only, never real participant values.

### Optional future dependencies

- Offline signed malware signatures/local scanner adapter, OCR, additional archive parsers, cryptographic approval signatures, or shared catalog synchronization.

## Deferred Decisions and Risks

- Pin exact library/browser versions during task execution after compatibility and license review; do not float production dependencies.
- Define the approved workspace retention/backup policy, reviewer-role roster, controlled vocabularies, and screening thresholds with the responsible human authority.
- Execute the setup-phase feasibility gate before substantive implementation. Direct `file://` behavior is optional only when the approved localhost/static-origin launcher serves the unchanged artifact, performs no server-side processing, and receives no case data.
- Verify PDF.js worker inlining; fall back to a recorded limited parser mode rather than a remote worker.
- Large ZIPs and hostile compression may exceed browser/library limits; initial caps are fail-closed and recorded, not silently bypassed.
- Local catalog uniqueness is scoped to the selected workspace. Enterprise-wide uniqueness requires optional future coordination and cannot be claimed initially.
- Locally asserted reviewer identity is auditable but not cryptographically authenticated by the single HTML; organizational access controls remain a production prerequisite.

## Complexity Tracking

No constitutional violations require justification. The worker/adaptor separation is necessary to keep large-file processing responsive, test deterministic logic independently, and isolate untrusted parsers; no backend or repository abstraction is introduced.
