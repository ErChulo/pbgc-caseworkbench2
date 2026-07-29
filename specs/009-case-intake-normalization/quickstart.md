# Quickstart and Acceptance Guide: Case Intake and Evidence Normalization

**Purpose**: Define the implementation and acceptance journey without creating implementation tasks or code.

## Preconditions

- Use only synthetic or approved de-identified fixtures in the repository.
- Complete the browser-feasibility spike and approve `docs/adr/009-local-first-evidence-intake.md` before substantive implementation. The ADR records the local trust boundary, one-HTML distribution, `file://` versus data-blind static-origin startup, workspace/OPFS roles, browser support, CSP, worker/WASM inlining, dependency strategy, approving authority/date, and supersession.
- Run in a Chromium/Edge desktop profile approved by that go/no-go decision with network access disabled.
- Select an empty writable local workspace outside the repository.
- Confirm the production build is one HTML file and contains no remote assets.
- Start directly from `file://` where the approved browser supports the required capabilities. Otherwise use only the approved localhost/static-origin launcher, which performs no server-side processing and receives or transmits no case data.
- Validate all seven Draft 2020-12 schemas and their local references, including `deidentified-export.schema.json` and `evidence-acquisition.schema.json`.
- Prepare independent SHA-256 oracle values for every fixture.

## Planned development commands

The implementation phase will add and pin the Node toolchain. Expected command roles are:

```text
npm install                 # install pinned development/runtime dependencies
npm run typecheck           # strict TypeScript validation
npm test                    # unit, property, and contract tests
npm run test:browser:e2e    # Chromium local-workspace and zero-network flows
npm run build               # generate the single HTML artifact
```

These commands are planning targets only; they are not available or executed in this phase.

## Acceptance fixture set

Create fixtures at test time or from synthetic committed bytes:

- Plain text, CSV, TSV, JSON, DOCX, XLSX, XLSM, PPTX, PDF, PNG/JPEG, ZIP, GZIP.
- Same bytes/different names and same name/different bytes.
- Zero-byte, Unicode-name, long-name, malformed, corrupt, encrypted, and unsupported artifacts.
- Nested ZIP, partial ZIP, traversal path, duplicate canonical path, excessive nesting, excessive expansion ratio, and unsupported compression.
- Office macro/embedded object/external link/hidden content/formula fixtures.
- PDF JavaScript/action/attachment/encrypted/scan-only fixtures where safely constructible.
- Authorized-PII markers, unauthorized-PII markers, direct/indirect identifier markers, and secret-like markers generated ephemerally.
- Population CSV/XLSX with blank, missing, malformed, formula, literal zero, leading-zero identifier-like, and mixed-type fields.

## Journey 1: Create a production case

1. Open the single HTML artifact offline.
2. Select a writable empty workspace.
3. Create a production case with a synthetic PBGC identifier.
4. Verify a random internal UUID is assigned and persisted.
5. Attempt the same production identifier again.
6. Confirm creation stops and presents the existing case.
7. Exercise resume-existing and approved non-production override; verify actor/time/rationale history.

**Pass evidence**: `case-index.json`, case record, review event, and no case-specific default facts.

## Journey 2: Intake, preservation, and manifest

1. Select the mixed package/folder.
2. Confirm discovered paths and total bytes before processing.
3. Hash and preserve all originals into content-addressed object paths.
4. Independently re-hash the stored objects.
5. Verify every receipt has separate provenance even when hashes match.
6. Confirm every artifact remains provisional and downstream-blocked until minimum screening passes or a valid human decision resolves its quarantine.
7. Export and validate the manifest contract.
8. Independently canonicalize the deterministic payload and verify its lowercase SHA-256 and operational exclusions. Exercise intrinsic type arrays before path fallback, every registered set/order rule, and recursive unregistered-array order. Run RFC 8785 golden vectors for `1`/`1.0`/`1e0`, `0`/`-0`, fractions, exponent inputs, representable boundaries, and nested values; reject NaN/infinities. Validate exact canonical decimal strings and reject exponent, plus, unnecessary leading/trailing zeros, trailing point, and negative zero. Confirm recursive objects, mixed nesting, repeated identity, NFC/case/tie-break, duplicate/indistinguishable, null, and absence rules.

**Pass evidence**: Every discovered artifact reconciles exactly once; all hashes match the oracle; no source bytes were modified.

## Journey 3: Containers and partial extraction

1. Intake a nested ZIP corpus.
2. Confirm the outer container is preserved/hashed before extraction.
3. Confirm each successful member is independently preserved/hashed and linked to its parent.
4. Trigger traversal, recursion, expansion, duplicate-path, corrupt, and unsupported-method findings.
5. Verify successful members continue, failed scope is explicit, and no missing member record is invented.

**Pass evidence**: Complete containment graph, extraction metadata, limit findings, and reconciled partial status.

## Journey 4: Quarantine and release

1. Intake one clean artifact, one macro artifact, one secret-like artifact, one authorized-PII population, and one unauthorized-PII artifact.
2. Verify unaffected and authorized-PII artifacts continue while blocking risks quarantine only affected artifacts.
3. Confirm automated screening can create only `screening-pending`, `rescreen-required`, `provisional-quarantine`, or `provisional-safety-block`, all downstream-blocked where applicable. Attempt human-final states with `actorType: system`; confirm each is rejected. Verify the UI labels accounting classification, provisional security state, and human-final decision separately and explains the block cause, evidence/review required, and next action.
4. Create an initial typed human quarantine release with a stable reviewer identity and rationale; its ordinal is 1 and both same-chain predecessor fields are null.
5. Re-receive identical bytes and create initial artifact-eligibility `inherit-approval` with no eligibility-chain predecessor. Resolve its operational `sourceQuarantineDecisionId` and deterministic `sourceQuarantineDecisionContentSha256` to that separate current-effective same-byte quarantine release.
6. Change one byte and verify a new artifact record, SHA-256, and screening/release lifecycle are required while the old artifact's disposition history remains unchanged.
7. Revoke a release as a human reviewer and verify derived eligibility is invalidated without erasing history.
8. Confirm every noninitial quarantine decision requires `priorDecisionId` and `priorDecisionContentSha256` for the immediate same-subject predecessor, every initial decision requires both null, and no cross-chain reference substitutes for them. Attempt continuation, revoke, supersession, or inherited eligibility with missing/stale/mismatched/ineffective lineage or changed bytes; confirm each fails. Confirm automated provisional blocking is not a quarantine decision and requires no human predecessor.
9. Confirm the artifact source retains only blocked/proposal eligibility. Replay its exact-hash typed ArtifactEligibilityDecision appendOrdinal/predecessor chain—requiring an effective same-artifact quarantine release where applicable—to compute eligibility without mutation; reject standalone approved artifacts, incomplete manifests, system/missing/stale/mismatched/branched/revoked/superseded decisions, and inherited eligibility after changed bytes.

**Pass evidence**: Hash-bound decisions, complete audit history, partial package continuation, and no “malware free” claim.

## Journey 5: Classification and relationships

1. Run deterministic document-category and source-role classifiers over completed shared passive-parser outputs.
2. Confirm classifier/rule version, evidence, confidence, and immutable `proposed` or `unresolved` status; attempt a final status on ClassificationProposal and confirm rejection.
3. Confirm confidence never approves a result.
4. Approve or reject the source-role proposal through its typed human decision chain and verify the computed projection, visible provenance, unchanged proposal, and prior history; confirm a system actor is rejected.
5. For an approved `authority-candidate`, create a separate AuthorityDecision referencing the source-role proposal ID, classification approval ID, and the same artifact SHA-256; confirm classification approval alone does not confer authority.
6. Confirm missing classification approval, mismatched proposal/approval/artifact hashes, and system approvers are rejected. Revoke or supersede the linked classification approval and confirm dependent authority immediately becomes ineffective; repeat with changed bytes and stale hashes, then verify renewal requires a new typed AuthorityDecision linked to the current-effective same-artifact approval.
7. Generate near-duplicate, amendment, supersession, replacement, authority, conflict, and effective-period proposals.
8. Confirm every relationship source record remains `proposed` or `unresolved`; matching SHA-256 establishes exact byte-duplicate linkage but does not mutate a proposal to approved.
9. Append a valid same-relationship typed human-decision chain and verify the UI computes approved status with visible decision provenance while the proposal remains unchanged. Confirm orphan/system/missing/wrong-type/wrong-subject/wrong-target/stale-hash/branched/revoked/superseded chains and incomplete manifests remain blocked.

**Pass evidence**: Production export includes only computed effective classifications/relationships backed by valid typed human-decision chains; deterministic proposals never claim final status.

## Journey 6: Population handling and LLM boundary

1. Intake synthetic population CSV/XLSX.
2. Verify field/record/sheet observations and proposal status.
3. Confirm blanks, missing values, invalid values, formula text, and zeros remain distinct.
4. Build the typed manifest-local `populationEvidenceObservations` registry. Resolve every EvidenceReference by its single `evidenceKey` to exactly one entry with matching citation ID, artifact SHA-256, locator, kind, observed-value presence, and PBGC Case Workbench Canonicalization Profile v1 bytes; confirm evidence keys/citation IDs are unique and every artifact exists. Reject missing, zero/multiple, duplicate, artifact/locator/kind/value mismatches, changed observations, stale evidenceKey, and incomplete manifests.
5. Permute evidence in an explicitly typed PopulationCandidate in each typed embedding; verify identical candidate bytes/key and manifest bytes/hash. Separately place a candidate-shaped object in arbitrary de-identified export-record content, reorder its unregistered evidence-like array, and verify the export deterministic hash changes because no duck typing occurs. Change genuine typed evidence content and verify evidenceKey, candidateKey, and manifest hash change. Reject malformed candidateKey values. Append a valid same-candidateKey/artifact human chain and verify the computed projection without source mutation.
6. Attempt to route authorized-real/direct-identifier data to an external-LLM export.
7. Confirm the export is blocked.
8. Produce a local `de-identified-real-data` package using general keys and only approved fields; validate it against `deidentified-export.schema.json`, independently scan it, and bind an append-only human approval chain to the exact enclosing deterministic payload hash.
9. Add a raw direct identifier, raw indirect identifier, non-allowlisted field, approval-hash mismatch, and incomplete generalized quasi-field evidence separately; confirm each package fails closed.
10. Generate a `synthetic-mock-data` export from field structure, validate its distinct designation and provenance, and confirm it contains no real values.
11. Create, validate, import, and store both package modes locally; confirm there is no transmit control, external-LLM client, or network request.

**Pass evidence**: Zero external network requests, no identifier leakage, no imputation, and traceable de-identification/mock provenance.

## Journey 6A: Governed decision matrices and artifact eligibility

1. For acquisition proposal, quarantine, artifact eligibility, classification, authority, evidence relationship, population candidate, export approval, and unresolved item, execute every permitted initial and successor transition defined by its contract matrix.
2. For every family, reject ordinal gaps/duplicates, branches, cycles, broken or stale predecessor ID/content hashes, wrong subjects or artifact bytes, prohibited transitions, rejection revocation, and ineffective supersession while deliberately disordering timestamps.
3. For ArtifactEligibilityDecision, change only `sourceQuarantineDecisionId` and confirm deterministic decision bytes/hash do not change; change `sourceQuarantineDecisionContentSha256` and confirm they do. Reject missing, malformed, stale, unresolved, cross-artifact, wrong-state, and changed-byte prior quarantine linkage.
4. For UnresolvedItemDecision, verify ordinal 1 requires null predecessor fields, later ordinals require the immediate predecessor ID/content hash, and valid `reopened` → `resolved` and `reopened` → `accepted-risk` successors pass. Reject final states stored on the unresolved-item source, invalid initial linkage, missing successor linkage, and incomplete-manifest projections.

**Pass evidence**: Every typed chain replays only by ordinal and deterministic predecessor content; all UUID-only changes are hash-invariant and every invalid transition fails closed.

## Journey 7: Interrupted intake and deterministic resume

1. Interrupt an attempt after each durable checkpoint.
2. Resume with the unchanged package snapshot.
3. Confirm no duplicate records and content-derived output equals uninterrupted processing.
4. Repeat with add, remove, rename, and one-byte-change variants.
5. Confirm each variant creates a new linked attempt and preserves both manifests/histories.

**Pass evidence**: Snapshot IDs, divergence reasons, linked attempts, golden deterministic manifest match.

## Journey 7A: Two-ledger reconciliation

1. Build the origin-classification ledger and verify every discovered record ID appears exactly once as `source-artifact` or `extracted-member`.
2. During US2, build the accounting-only terminal-disposition ledger and verify the identical record-ID set appears exactly once as `accepted-for-processing`, `provisional-safety-block`, `pending-human-disposition`, `final-human-disposition-recorded`, `failed`, `duplicate`, or `excluded` while governed records may all remain provisional.
3. Verify each ledger independently balances to `discoveredRecordTotal`; one appearance in each separate ledger is required and is not double counting.
4. Confirm no accounting category grants release or a human-final disposition and that `provisional-safety-block` is not `final-quarantine`; establish final states later only through US3 typed human decisions.
5. Test missing origin, multiple origins, missing terminal classification, multiple terminal classifications, mismatched record-ID sets, and independently unbalanced totals; confirm each fails.

**Pass evidence**: Two independently balanced ledgers with identical unique discovered-record sets and negative results for every missing, overlapping, or unbalanced case.

## Journey 8: Browser and build constraints

1. Build the distributable artifact.
2. Verify `dist/` contains only `pbgc-caseworkbench.html`.
3. Open it directly from `file://` where approved; otherwise use only the approved data-blind localhost/static-origin launcher and run the primary intake/review/export flow.
4. Record all browser requests and CSP violations; assert zero outbound requests.
5. Deny/revoke directory permission and exhaust a controlled storage quota; verify fail-closed behavior.
6. Open in a browser without production directory support; verify explicit non-production mode and no durable-preservation claim.
7. Verify workers, WASM, schemas, and assets are inline, CSP blocks active or untrusted execution, and no Office macro, formula, script, link, attachment, or embedded binary executes.

**Pass evidence**: One self-contained file, zero egress, accurate capability labels, responsive UI, no uncaught console error.

## Journey 9: Evidence Acquisition & Structured Extraction Framework

1. Register a synthetic future-module `deterministicRequestPayload` containing missing facts, candidate document/report types, recommendation-only source priorities, schema/instruction identities, versions and hashes, and logical rerun metadata; independently canonicalize it and verify `requestPayloadSha256`.
2. Generate `deterministicPackagePayload` locally, verify `local-only-no-transmission`, artifact/schema/instruction hashes, and `packagePayloadSha256`.
3. Import `deterministicProposalPayload` and validate request/package linkage, registrations, exact artifact hashes, citations, proposed facts, uncertainty, conflicts, rerun metadata, and `proposalPayloadSha256`.
4. Change only operational UUIDs, timestamps, paths, runtime/UI state, actor metadata, decision history, and transport metadata; verify all three deterministic hashes remain unchanged. Regenerate identical deterministic inputs and verify byte-identical canonical payloads and hashes. Permute every registered set-like acquisition array and verify identical hashes. Supply source priorities in ascending unique-priority order and verify deterministic output; reject a nonascending reorder and duplicate priorities; change an actual priority value while preserving valid ascending uniqueness and verify a different hash. For other order-significant arrays such as uncertainties or conflicts, verify a valid semantic reorder changes the hash. Place an unannotated nested array inside proposedExtractedFacts, confirm it is valid and order-significant, and verify reordering it changes the hash at every tested nesting depth.
5. Confirm an automated proposal remains downstream-blocked and a system actor cannot add any proposal decision.
6. Approve or reject at ordinal 1 with no predecessor. Add revoke or supersede decisions with consecutive ordinals and immediate predecessor ID/content-hash links; verify decision content hashes exclude all UUIDs, actors, rationale, and timestamps. Replay solely by ordinal while deliberately disordering timestamps and confirm the same result. Confirm duplicate/gapped ordinals, broken ID/hash links, cycles, branches, invalid transitions, rejection revocation, and superseding a non-effective decision fail.
7. Attempt human approval with a mismatched proposal hash; confirm rejection. Approve the exact proposal hash and verify complete human decision evidence.
8. Promote one exact proposal fact using its fact key, valid JSON Pointer, canonical fact-content hash, current approval, exact artifact hashes, citation IDs, governed-record target, and promotion versions. Export request → package → proposal → decision → promoted-fact lineage and verify node-specific deterministic hashes exclude operational UUIDs/timestamps.
9. Confirm invalid pointers, absent or ambiguous facts, fact-hash mismatch, citation/artifact mismatch, cross-proposal or revoked approval, conflicting duplicate promotion, orphan proposal/decision, broken rerun lineage, and duplicate IDs fail.
10. Confirm source-priority recommendations do not confer authority and no plan interpretation, actuarial calculation, or report production occurs.
11. Verify local create/validate/import/store performs zero transmission and no external-LLM client exists.

**Pass evidence**: Schema-valid local packages, exact-hash citations and approval, recorded uncertainty/conflicts/rerun triggers, proposal-only automation, downstream blocking before approval, and zero network activity.

## Constitution acceptance gate

Before declaring implementation complete, confirm:

- No real participant PII or raw case evidence is in Git.
- No LLM or network adapter is reachable from production artifact processing.
- No plan interpretation, entitlement, calculation, liability, guarantee-limit, or V1 generation exists.
- No automated classification/non-exact relationship is treated as approved.
- No Office formula, macro, embedded script, or untrusted binary was executed.
- Every claimed test/external execution has recorded evidence; unperformed checks are not claimed.

## Deferred acceptance suites

OCR, legacy Office, RAR/7z/TAR, password-protected extraction, enterprise catalog synchronization, signed reviewer identities, and authoritative antivirus integration require separate approved specifications or ADRs.
