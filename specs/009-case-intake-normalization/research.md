# Phase 0 Research: Case Intake and Evidence Normalization

**Date**: 2026-07-18

## Decision 1: Local-first single-HTML React/Vite application

**Decision**: Build a strict TypeScript React application with Vite and inline the complete production bundle into one HTML file. Keep the browser application under `web/` and leave the existing Python scaffold separate.

**Rationale**: Repository instructions already anticipate React/Vite work. Vite supports React/TypeScript and modern browser builds, while the single-file plugin inlines JavaScript and CSS. A final artifact-level test, not plugin configuration alone, will prove that every worker, WASM module, schema, and asset is embedded.

**Alternatives considered**:

- Plain JavaScript: fewer dependencies, but weaker contract/state-model guarantees for a high-audit workflow.
- Python/WASM: reuses the scaffold but increases bundle/toolchain complexity and does not improve browser file permissions.
- Server-backed web app: rejected for initial scope because it creates an unnecessary PII transmission and infrastructure boundary.

**Sources**: [Vite getting started and React/TypeScript support](https://vite.dev/guide/), [Vite production build and browser targets](https://vite.dev/guide/build), [`vite-plugin-singlefile` project](https://github.com/richardtallent/vite-plugin-singlefile)

## Decision 2: User-selected workspace is authoritative; OPFS is cache-only

**Decision**: Require a writable user-selected local case-workspace directory for production intake. Store content-addressed originals and canonical records there. Permit OPFS only for reconstructable cache/scratch data.

**Rationale**: OPFS and IndexedDB are origin-scoped, quota-limited, and subject to browser persistence/eviction behavior. Users also need visible, transferable evidence custody. The File System Access API requires explicit user permission and supports local read/write without network transmission.

**Alternatives considered**:

- OPFS as authoritative storage: rejected because quota, origin identity, eviction, and user visibility undermine durable evidence custody.
- In-memory only: useful for demo/review but cannot satisfy immutable preservation or restart requirements.
- Cloud object storage: rejected from initial scope due to PII and infrastructure constraints.

**Sources**: [MDN Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system), [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria), [MDN File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API)

## Decision 3: Incremental SHA-256 in a worker

**Decision**: Use a pinned incremental SHA-256 implementation (`hash-wasm`) in a dedicated worker, reading fixed-size `Blob` slices. Cross-check small fixtures with Web Crypto and published test vectors.

**Rationale**: Web Crypto supports SHA-256 but `SubtleCrypto.digest()` does not stream and requires the complete input in memory. A chunked worker is required for multi-gigabyte packages and responsive UI. Hashes are independently verified after copying originals.

**Alternatives considered**:

- Web Crypto for every artifact: rejected because it buffers the whole artifact.
- Hand-written SHA-256: rejected due to cryptographic implementation and maintenance risk.
- Server-side hashing: rejected because original bytes cannot leave the device.

**Sources**: [MDN `SubtleCrypto.digest()`](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest), [`hash-wasm` project](https://github.com/Daninet/hash-wasm)

## Decision 4: ZIP-first bounded container support

**Decision**: Use `fflate` streaming APIs for ZIP, GZIP, and DEFLATE. Preserve/hash the container before extraction; cap nesting, members, expanded bytes, compression ratios, path forms, and processing time. Initial ZIP processing follows the library's documented 4 GB boundary.

**Rationale**: `fflate` is small, browser-compatible, and supports streaming ZIP workflows. Streaming avoids whole-archive expansion in memory. Hard limits are required against archive bombs and recursion.

**Alternatives considered**:

- Native `DecompressionStream` only: insufficient for general ZIP member inventory.
- Broad archive suite/WASM: larger attack and bundle surface; defer RAR/7z/TAR.
- External extraction service: violates the local-only evidence boundary.

**Source**: [`fflate` project and streaming ZIP documentation](https://github.com/101arrowz/fflate)

## Decision 5: Passive Office and PDF inspection only

**Decision**: Parse Office Open XML packages locally and use SheetJS CE for spreadsheet structure/values/formula text. Use PDF.js locally for parseable PDF metadata/text. Never evaluate spreadsheet formulas, macros, JavaScript, embedded objects, or external links.

**Rationale**: OOXML files are ZIP packages and can be screened structurally before parser access. SheetJS can read browser `ArrayBuffer`/`Uint8Array` inputs. PDF.js provides a web-standards parser/display API, but its worker and `file://` behavior must be verified in the inlined build. Parser success is not an execution or malware-safety claim.

**Alternatives considered**:

- Open documents in installed Office/Acrobat: rejected because it executes external applications and breaks reproducibility.
- Upload to conversion APIs: rejected because real evidence cannot leave the device.
- Full legacy Office parsing: deferred due to binary complexity and active-content risk.

**Sources**: [SheetJS local file access](https://docs.sheetjs.com/docs/demos/local/file/), [SheetJS data import](https://docs.sheetjs.com/docs/solutions/input/), [PDF.js getting started](https://mozilla.github.io/pdf.js/getting_started/), [PDF.js project](https://github.com/mozilla/pdf.js)

## Decision 6: Application-level immutability with content addressing

**Decision**: Copy each original into a create-once SHA-256 object path, never overwrite it through the application, verify it after write, and detect later external mutation through re-hashing. Preserve separate receipt records for identical content.

**Rationale**: A browser cannot impose OS-level WORM semantics on a normal directory. Content addressing plus verification is deterministic, inspectable, and detects tampering without pretending the browser can prevent it.

**Alternatives considered**:

- Filename-based storage: collision-prone and weak for lineage.
- One mutable case ZIP: expensive to rewrite and poor for partial resume.
- Claim filesystem immutability: unsupported and misleading.

## Decision 7: Event history plus canonical snapshots, not a database

**Decision**: Store canonical snapshot/manifest JSON and append-only JSONL audit/review events in the workspace. Rebuild UI state from those files. Use explicit version fields and schema validation.

**Rationale**: The local workspace must be portable and inspectable without a server or database. Snapshots enable deterministic exports; events preserve reviewer and status history. Atomic derived-file replacement retains prior versions.

**Alternatives considered**:

- IndexedDB: useful cache but not portable/visible enough for evidence custody.
- Embedded SQLite/WASM: adds complexity and a large mutable binary without a current need.
- Only mutable JSON documents: loses prior status and review evidence.

## Decision 8: Determinism boundary

**Decision**: Separate canonical content-derived payloads from operational events. Canonicalize keys, set-like arrays, null handling, encodings, dates, and decimal strings; hash the canonical payload. Preserve but exclude timestamps, random UUIDs, reviewer identity, and UI ordering from deterministic comparisons unless they are source observations.

**Rationale**: Audit events must record real time and human identity, while repeat processing must still yield identical evidence-derived results. Mixing the two makes reproducibility unverifiable.

**Alternatives considered**:

- Compare whole exports byte-for-byte: fails because legitimate operational metadata changes.
- Remove timestamps/history: violates auditability.
- Ignore ordering ad hoc: creates ambiguous comparisons.

## Decision 9: Proposal-only automation

**Decision**: Exact duplicates may finalize automatically only on matching SHA-256. Document/source-use classifications and all near-duplicate, authority, amendment, supersession, replacement, conflict, and effective-period relationships remain proposals until human approval.

**Rationale**: This directly implements the clarified specification and constitution. Versioned rule evidence/confidence supports review without converting automation into authority.

**Alternatives considered**:

- Confidence-based auto-approval: expressly prohibited.
- LLM classification of real evidence: violates the external-PII boundary and is not deterministic.
- No automated proposals: safe but unnecessarily burdens triage.

## Decision 10: Zero-network production boundary

**Decision**: Bundle every runtime asset, set `connect-src 'none'`, omit all telemetry/update/LLM clients, and test zero outbound requests. External LLM work uses a separate de-identified/mock export outside production intake.

**Rationale**: A local-only architectural boundary is stronger and more testable than relying on call-site discipline. It prevents accidental transmission of participant data.

**Alternatives considered**:

- Configurable embedded LLM client: too easy to misuse with real case data.
- Redaction immediately before arbitrary calls: cannot prove every path is safe.
- Network proxy: introduces hidden infrastructure and another trust boundary.

## Decision 11: Initial production/browser scope

**Decision**: Treat current desktop Chromium/Edge with File System Access as production-capable after acceptance testing. Other browsers enter limited non-production mode unless directory persistence is verified. Local catalog uniqueness is scoped to the selected workspace.

**Rationale**: The single HTML cannot discover cases outside user-authorized directories or guarantee cross-device uniqueness. Stating the boundary avoids unsupported enterprise claims.

**Alternatives considered**:

- Promise universal browser production support: contradicted by capability differences.
- Require a server catalog: conflicts with the bounded local-first objective.
- Hide limitations: violates evidence-based maturity rules.

## Resolved Unknowns

All technical-context unknowns needed for Phase 1 are resolved. Exact dependency versions, organization-approved retention/role policies, screening thresholds, and managed-browser versions are implementation/task-time controls and must be pinned before release; they do not block the architecture.
