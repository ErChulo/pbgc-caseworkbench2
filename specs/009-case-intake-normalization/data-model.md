# Data Model: Case Intake and Evidence Normalization

**Feature**: 009 Case Intake and Evidence Normalization
**Date**: 2026-07-18
**Authority**: [spec.md](./spec.md) and Constitution 2.0.0

## Modeling conventions

- All UUID fields are immutable UUID strings generated from a cryptographic RNG unless explicitly described as content-derived.
- SHA-256 values are lowercase 64-character hexadecimal strings calculated over exact artifact bytes.
- Timestamps are ISO 8601 UTC strings. They are operational evidence unless explicitly sourced from an artifact.
- Status histories are append-only events. Current status is a projection and never replaces history.
- Unknown values are explicit `null` plus a validation/review status; they are not empty-string defaults or zero.
- Original, raw extracted, normalized, proposed, approved, and unresolved data are distinct record types.
- Every contract carries `schemaVersion`; every deterministic producer carries a rule/parser/classifier version.
- PBGC Case Workbench Canonicalization Profile v1 governs deterministic-field selection, NFC preprocessing, object keys, array semantics, duplicates, null/absence, and UTF-8 bytes. It uses RFC 8785 specifically for finite JSON-number serialization. Exact lexical decimals use `canonicalDecimalString`.

## Entity relationship overview

```text
WorkspaceCatalog 1 ── * Case 1 ── * IntakeAttempt 1 ── 1 PackageSnapshot
                                     │                    │
                                     │                    └── * SnapshotEntry
                                     ├── * ReceiptRecord ── 1 ContentObject
                                     │                          │
                                     │                          └── * ArtifactRecord
                                     ├── * ContainmentEdge
                                     ├── * ExtractionResult ── * NormalizedEvidenceRecord
                                     ├── * ScreeningResult ── * QuarantineDecision
                                     ├── * ClassificationProposal ── * ReviewEvent
                                     ├── * EvidenceRelationship ── * ReviewEvent
                                     ├── * PopulationCandidateProfile
                                     ├── * ValidationResult
                                     └── * UnresolvedItem

All material entities ── * StatusEvent / ProvenanceEvent
```

## 1. WorkspaceCatalog

Represents the selected local workspace root and the scope within which production authoritative case identifiers are unique.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion` | string | Required; supported version only. |
| `workspaceId` | UUID | Immutable local workspace identity. |
| `createdAt` | timestamp | Operational metadata. |
| `cases` | array of CaseIndexEntry | Sorted by internal case UUID in canonical exports. |
| `catalogHash` | SHA-256 | Hash of canonical deterministic catalog payload. |

### CaseIndexEntry

| Field | Type | Rules |
|---|---|---|
| `caseId` | UUID | Links to Case. |
| `authoritativeCaseId` | string or null | Required for production; normalized only under approved identifier rules. |
| `purpose` | enum | `production`, `test`, `training`, `duplicate-investigation`. |
| `casePath` | relative path | Must remain inside selected workspace. |
| `status` | enum | `active`, `closed`, `archived`, `blocked`. Shared by the workspace contract and Case. |

**Uniqueness**: At most one `production` entry per authoritative PBGC case identifier in a workspace. Non-production collisions require a recorded human decision.

## 2. Case

The immutable system identity and governed context for a terminated-plan matter.

| Field | Type | Rules |
|---|---|---|
| `caseId` | UUID | Primary immutable identity. |
| `authoritativeCaseId` | string or null | Required only for production. Never hard-coded. |
| `purpose` | enum | Production/test/training/duplicate investigation. Immutable after creation; correction creates a review event and governed migration. |
| `createdBy` | ReviewerIdentity | Required asserted identity. |
| `createdAt` | timestamp | Required. |
| `collisionDecision` | ReviewEvent reference or null | Required when creation followed identifier collision. |
| `status` | enum | `active`, `closed`, `archived`, `blocked`. |
| `statusHistory` | StatusEvent references | Append-only. |

## 3. IntakeAttempt

A bounded processing run against one immutable package snapshot.

| Field | Type | Rules |
|---|---|---|
| `attemptId` | UUID | Immutable. |
| `caseId` | UUID | Exactly one Case. |
| `priorAttemptId` | UUID or null | Required when package content diverges from an interrupted/prior attempt. |
| `divergenceReason` | string or null | Required with `priorAttemptId`; identifies add/remove/rename/change. |
| `initiatedBy` | ReviewerIdentity | Required. |
| `startedAt`, `endedAt` | timestamp/null | `endedAt` null while active/interrupted. |
| `sourceContext` | object | User-declared package/source description; no hidden path transmission. |
| `snapshotId` | SHA-256 | Hash of canonical PackageSnapshot. Immutable after freeze. |
| `snapshotRecordId` | UUID | Operational record identity, separate from `snapshotId`; excluded from deterministic comparison. |
| `status` | enum | `discovering`, `hashing`, `preserving`, `processing`, `partial`, `blocked`, `completed`, `failed`, `interrupted`, `cancelled`. |
| `statusHistory` | StatusEvent references | Append-only. |
| `ruleSetVersion` | string | Pins normalization/screening/classification rules. |

### State transitions

```text
discovering -> hashing -> preserving -> processing -> completed
                                      \-> partial
                                      \-> blocked
any active state -> interrupted | cancelled | failed
interrupted -> same state only when snapshot matches
changed snapshot -> new linked IntakeAttempt
```

Completed/partial/blocked/failed attempts never return to an active state; reprocessing creates a new attempt unless it is a valid unchanged interrupted resume.

## 4. PackageSnapshot and SnapshotEntry

The immutable set of expected submitted artifacts for an attempt.

### PackageSnapshot

| Field | Type | Rules |
|---|---|---|
| `snapshotId` | SHA-256 | Hash of canonical deterministic payload. |
| `snapshotRecordId` | UUID | Optional operational identity; never substituted for `snapshotId`. |
| `entries` | SnapshotEntry array | Sorted by normalized relative path, then hash. |
| `discoveredCount`, `totalBytes` | non-negative integer | Must reconcile to entries. |
| `frozenAt` | timestamp | Operational metadata, excluded from `snapshotId`. |

### SnapshotEntry

| Field | Type | Rules |
|---|---|---|
| `observedRelativePath` | string | Exact observed logical path. |
| `normalizedDisplayPath` | string | Safe display form; never used to overwrite original. |
| `sha256` | SHA-256 | Exact bytes. |
| `sizeBytes` | non-negative integer | Must equal hashed byte count. |
| `declaredMediaType` | string/null | Source/browser claim only. |
| `lastModifiedObserved` | timestamp/null | Source observation; not authority. |

**Comparison rule**: Add, remove, rename, or hash change makes snapshots different. A rename is divergence even if SHA-256 is unchanged.

## 5. ContentObject

One immutable byte sequence in content-addressed local storage.

| Field | Type | Rules |
|---|---|---|
| `sha256` | SHA-256 | Primary content identity and object filename. |
| `sizeBytes` | integer | Required. |
| `objectPath` | relative path | `objects/sha256/<prefix>/<sha256>`. |
| `preservationStatus` | enum | `pending`, `copying`, `verified`, `integrity-failed`, `write-failed`. |
| `postWriteSha256` | SHA-256/null | Required for `verified`; must equal primary hash. |
| `firstPreservedAt` | timestamp/null | Audit metadata. |

ContentObjects are never overwritten. A later mismatch sets `integrity-failed`, quarantines dependent artifact records, and creates validation/unresolved records.

## 6. ReceiptRecord and ArtifactRecord

### ReceiptRecord

Preserves each distinct receipt/custody context even when bytes duplicate existing content.

| Field | Type | Rules |
|---|---|---|
| `receiptId` | UUID | Immutable. |
| `attemptId`, `caseId` | UUID | Required lineage. |
| `sha256` | SHA-256 | Links ContentObject. |
| `originalFilename` | string | Exact source name. |
| `observedRelativePath` | string | Exact source-relative path. |
| `submittedBy`, `submittedAt` | identity/timestamp | Required where available. |
| `sourceLocation`, `transferContext`, `declaredDescription` | string/null | Provenance; paths stay local. |
| `parentArtifactId` | UUID/null | Set for extracted members. |

### ArtifactRecord

Tracks the processing/review lifecycle for one receipt of one content object.

| Field | Type | Rules |
|---|---|---|
| `artifactId` | UUID | Immutable record identity. |
| `receiptId`, `sha256`, `attemptId`, `caseId` | identifiers | Required lineage. |
| `artifactRole` | enum | `submitted-container`, `submitted-file`, `extracted-member`. |
| `signatureMediaType` | string/null | Derived from bytes; mismatch with declared type creates finding. |
| `processingStatus` | enum | `pending`, `preserved`, `screening`, `quarantined`, `extracting`, `normalized`, `unsupported`, `unreadable`, `failed`, `completed`. |
| `downstreamEligibility` | enum | Deterministic source state: `blocked`, `proposed-only`, or `pending-human-decision`; never `approved`. |
| `statusHistory` | StatusEvent references | Append-only. |

Effective downstream eligibility is a computed, read-only projection from the current effective typed human quarantine/release decision chain for the exact artifact SHA-256. It validates decision type/content hash, gapless predecessor chain, and release/quarantine/revocation/supersession lineage without mutating ArtifactRecord. Changed bytes create a new artifact and decision lifecycle and cannot inherit eligibility.

### ArtifactEligibilityDecision

`inherit-approval` is initial ordinal 1 with null eligibility predecessors. It derives eligibility from a separate current-effective typed quarantine release for identical bytes, linked operationally by `sourceQuarantineDecisionId` and deterministically by `sourceQuarantineDecisionContentSha256`. Later eligibility decisions use ordinary same-chain predecessors. Missing, ineffective, revoked, superseded, stale, mismatched, or changed-byte release lineage is invalid.

## 7. ContainmentEdge and MemberExtractionObservation

Links an immutable submitted container to each successfully extracted member.

| Field | Type | Rules |
|---|---|---|
| `edgeId` | content-derived ID | Stable over parent hash, member hash, path, sequence, extractor version. |
| `parentArtifactId`, `childArtifactId` | UUID | Required; no self/cycle. |
| `parentSha256`, `childSha256` | SHA-256 | Required and independently verified for successful extraction. |
| `observedMemberPath` | string | Exact archive path. |
| `normalizedDisplayPath` | string | Traversal-safe display form. |
| `sequence` | integer | Observed extraction order; retained as evidence. |
| `compressedSize`, `expandedSize`, `crc32` | integer/string/null | Observations only. |
| `extractionResult` | enum | `success`, `partial`, `unsupported`, `encrypted`, `corrupt`, `blocked-limit`, `failed`. |
| `extractorId`, `extractorVersion` | string | Required. |

Failed or unobserved members do not receive child ArtifactRecords; failure scope remains on the parent extraction result.

### MemberExtractionObservation

Represents an observed archive member that did not produce a successful child artifact. It requires parent artifact identity/hash, observed member path, extractor identity/version, extraction sequence, available compressed/expanded size and CRC, an outcome of `unsupported`, `encrypted`, `corrupt`, `blocked-limit`, or `failed`, and a failure reason. `childArtifactId` and `childSha256` are prohibited. This keeps failed-member evidence distinct from successful containment edges and never invents an unobserved member.

## 8. ExtractionResult and NormalizedEvidenceRecord

### ExtractionResult

| Field | Type | Rules |
|---|---|---|
| `extractionId` | content-derived ID | Stable by artifact hash, locator, parser version. |
| `artifactId`, `sourceSha256` | identifiers | Required. |
| `parserId`, `parserVersion` | string | Required. |
| `sourceLocator` | string/null | Page/sheet/cell/member/line/field locator where determinable. |
| `rawValue` | typed union/null | Preserved exactly where representable; binary stays referenced. |
| `status` | enum | `success`, `partial`, `unsupported`, `unreadable`, `blocked`, `failed`. |
| `limitations` | string array | Required for non-success. |

### NormalizedEvidenceRecord

| Field | Type | Rules |
|---|---|---|
| `normalizedRecordId` | content-derived ID | Stable. |
| `extractionId`, `artifactId`, `sourceSha256`, `sourceLocator` | lineage | Required. |
| `rawValue` | typed union | Never overwritten. |
| `normalizedValue` | typed union/null | Null when invalid/unresolved. |
| `valueKind` | enum | `text`, `date`, `integer`, `decimal-string`, `boolean`, `null`, `structured`. |
| `normalizationRuleId`, `normalizationRuleVersion` | string | Required. |
| `confidence`, `validationStatus` | number/enum | Confidence is not approval. |

## 9. ScreeningResult and QuarantineDecision

### ScreeningResult

| Field | Type | Rules |
|---|---|---|
| `screeningResultId` | content-derived ID | Stable by hash/rule/finding. |
| `artifactId`, `sha256` | identifiers | Required. |
| `ruleId`, `ruleVersion` | string | Required. |
| `category` | enum | `authorized-pii`, `unauthorized-pii`, `secret`, `executable`, `macro`, `embedded-object`, `external-link`, `archive-risk`, `media-mismatch`, `malware-indicator`, `unsupported`, `other`. |
| `outcome` | enum | `passed`, `failed`, `blocked`, `inconclusive`, `unsupported`, `error`. |
| `severity` | enum | `informational`, `warning`, `error`, `critical`. |
| `evidence`, `limitations` | array | No claim beyond checks actually performed. |
| `createdAt` | timestamp | Audit metadata. |

`passed` means only that the named/versioned rule found no condition; it never means “malware free.”

### QuarantineDecision

| Field | Type | Rules |
|---|---|---|
| `decisionId` | UUID | Immutable event identity. |
| `decisionContentSha256`, `appendOrdinal`, `priorDecisionContentSha256` | hash/integer/hash-null | Deterministic decision identity and gapless predecessor replay; excludes UUID, actor, rationale, and timestamp from the content hash. |
| `artifactId`, `sha256`, `findingIds` | identifiers | Release is hash/finding bound. |
| `action` | enum | Human-only `final-quarantine`, `continue-quarantine`, `release`, `reject`, `revoke`, `inherit-release`, `supersede`. Automated safety states belong to ScreeningOutcome, not QuarantineDecision. |
| `reviewer` | ReviewerIdentity | Always human. Automated screening/re-screening creates findings and `screening-pending`, `rescreen-required`, `provisional-quarantine`, or `provisional-safety-block` only. |
| `timestamp`, `rationale` | timestamp/string | Required. |
| `priorStatus`, `resultingStatus` | enum | Required; final result is `released`, `final-quarantine`, `rejected`, `revoked`, or `superseded`. |
| `priorDecisionId`, `priorDecisionContentSha256` | UUID/SHA-256 or null | Sole same-chain predecessor linkage. Both null at ordinal 1; both identify the immediate same-artifact predecessor at later ordinals. |

Different hashes can never share or inherit a release decision. Inherited release requires explicit human confirmation and a current effective prior release for byte-identical SHA-256. Changed bytes create a new ArtifactRecord and independent screening lifecycle; the old artifact's disposition history remains immutable. Automated provisional blocking is a ScreeningOutcome, not a continued human-final quarantine, and needs no prior human decision.

## 10. ClassificationProposal

| Field | Type | Rules |
|---|---|---|
| `proposalKey` | content-derived identifier | Stable deterministic proposal identity; any execution UUID is operational metadata. |
| `artifactId`, `sha256` | identifiers | Required. |
| `dimension` | enum | `document-category`, `source-role`. |
| `proposedValue` | controlled vocabulary value | Required. |
| `authorityCandidate` | boolean | May be true only for a source-role proposal; never grants authority. |
| `confidence` | number 0..1 | Never approval. |
| `supportingEvidence` | evidence reference array | Required. |
| `classifierId`, `classifierVersion`, `proposedAt` | string/timestamp | Required. |
| `status` | enum | Immutable source state: `proposed` or `unresolved` only. |
| `decisionHistory` | ClassificationApproval references | Append-only typed human chain; never copied into proposal status. |
| `reusedFromClassificationId` | UUID/null | Same-hash only; traceable to approved source. |

Effective approved, rejected, revoked, or superseded classification status is computed by timestamp-independent replay of the valid same-proposal, same-artifact typed human chain. The proposal remains unchanged, and classification approval does not confer document authority/canonical status.

### ClassificationApproval

A typed human review record separate from the deterministic proposal. It records approval identity, deterministic decision-content hash, append ordinal, immediate predecessor ID/content hash, proposal key, exact artifact SHA-256, approve/reject/revoke/supersede type and result, human actor, informational decision time, rationale, and ruleset/schema versions. It can create a computed classification projection but cannot mutate ClassificationProposal or create an AuthorityDecision.

## 11. EvidenceRelationship

| Field | Type | Rules |
|---|---|---|
| `relationshipId` | UUID | Immutable proposal identity. |
| `fromArtifactId`, `toArtifactId` | UUID | Directional; required. |
| `relationshipType` | enum | `exact-duplicate`, `near-duplicate`, `amendment`, `supersession`, `replacement`, `authority`, `conflict`, `effective-period`. |
| `proposedBy`, `proposedAt` | operational source/timestamp | Required in the linked proposal execution record and excluded from deterministic relationship content. |
| `ruleVersion` | string | Required deterministic rule identity. |
| `confidence`, `supportingEvidence` | number/array | Required for automated proposal. |
| `status` | enum | Deterministic source state: `proposed` or `unresolved` only. |
| `decisionHistory` | RelationshipDecision references | Append-only operational chain; never copied into `status`. |

All relationship source records remain proposal-only. Exact duplicate byte identity is recorded separately by exact SHA-256 linkage and does not turn a relationship proposal into an approved record.

### RelationshipDecision

A typed human decision over one EvidenceRelationship. It records `decisionId`, deterministic `decisionContentSha256`, gapless `appendOrdinal`, immediate predecessor ID/content hash, relationship key, exact subject/target identities and artifact SHA-256 values, approve/reject/revoke/supersede type, human actor, rationale, evidence considered, informational timestamp, resulting governed status, and rule-set/schema versions. Effective status is a computed projection of timestamp-independent deterministic replay; it is never written into the proposal. Orphan/system/missing/wrong-type/wrong-subject/wrong-target/stale-hash/branched/cyclic/ineffective chains and incomplete manifests cannot produce approval.

## 11A. AuthorityDecision

Authoritative downstream use is governed separately from classification approval.

| Field | Type | Rules |
|---|---|---|
| `authorityDecisionId` | UUID | Immutable decision-record identity. |
| `artifactId`, `artifactSha256` | identifiers | Decision applies only to these exact bytes. |
| `sourceRoleProposalId` | identifier | References the `authority-candidate` source-role proposal for the exact artifact. |
| `classificationApprovalId` | UUID | References the separate human approval of that same source-role proposal and artifact SHA-256; approval alone is insufficient. |
| `sourceRoleProposalArtifactSha256`, `classificationApprovalArtifactSha256` | SHA-256 | MUST equal `artifactSha256`; cross-record validation rejects mismatches. |
| `decision` | enum | `approved`, `rejected`, `revoked`, `superseded`. |
| `approver`, `decisionTimestamp`, `rationale`, `ruleSetVersion` | identity/timestamp/string | Required human decision evidence and governing rules. |
| `priorDecisionId` | UUID/null | Required reference when revoking or superseding; never overwrite prior decisions. |
| `statusHistory` | StatusEvent references | Append-only. |

A changed SHA-256 requires a new AuthorityDecision. Authority is effective only while its linked classification approval remains the current-effective same-artifact approval. Revocation, supersession, ineffectiveness, stale hashes, or changed bytes block dependent authority; renewal requires new exact current lineage and a new typed decision.

## 12. PopulationCandidateProfile

| Field | Type | Rules |
|---|---|---|
| `candidateKey` | SHA-256 | Lowercase hash of canonical deterministic candidate content excluding candidateKey and all UUID/timestamp/UI/path/operational/computed-projection fields. |
| `artifactId`, `artifactSha256` | identifiers | Required; the contracted candidate artifact hash matches its enclosing normalized source hash. |
| `candidateStatus` | enum | Deterministic source state: `proposed` or `unresolved` only. |
| `confidence` | number | Never approval. |
| `evidence` | EvidenceReference array | Set-like only when explicitly schema-typed as PopulationCandidate; sort by evidenceKey then profile-canonical item bytes. Arbitrary shape-matched objects receive no intrinsic semantics. |
| `sheetsOrSections`, `observedFields`, `recordCounts` | structured observations | No invented counts/fields. |
| `cellObservations` | counts | Distinguish missing, blank, malformed, formula, zero, nonzero. |
| `sensitivity` | enum | `authorized-real`, `de-identified`, `synthetic-mock`, `unknown`. |
| `decisionHistory` | PopulationCandidateDecision references | Append-only typed human chain keyed to the exact candidate and artifact SHA-256; never copied into `candidateStatus`. |

EvidenceReference and manifest-local PopulationEvidenceObservation share one `evidenceKey`, derived from identical profile-canonical artifact/citation/locator/kind/optional-value content. Each reference resolves by evidenceKey to exactly one observation and every field agrees. Keys and citation IDs are unique. Explicitly typed candidates use set semantics; arbitrary export objects use recursive fallback and do not acquire semantics from shape.

## 13. ReviewEvent, StatusEvent, and ProvenanceEvent

### ReviewerIdentity

| Field | Type | Rules |
|---|---|---|
| `reviewerKey` | string | Stable asserted organizational key; not a participant identifier. |
| `displayName` | string | Required for human-readable audit. |
| `authorityContext` | string | Role/policy basis asserted for the action. |

### ReviewEvent

| Field | Type | Rules |
|---|---|---|
| `eventId` | UUID | Immutable. |
| `subjectType`, `subjectId` | string/identifier | Required. |
| `action` | controlled value | Approve/reject/reclassify/release/revoke/resolve/etc. |
| `reviewer`, `timestamp`, `rationale` | identity/timestamp/string | Required. |
| `evidenceReferences` | array | Required where decision relies on evidence. |
| `priorStatus`, `resultingStatus` | string | Required. |

### StatusEvent

Records every automated or human state transition with subject, source, time, rationale, prior/resulting states, attempt, and rule version.

### ProvenanceEvent

Records receipt, custody, preservation, integrity verification, extraction, normalization, export, and import without deleting previous events.

## 14. ValidationResult and UnresolvedItem

### ValidationResult

| Field | Type | Rules |
|---|---|---|
| `validationId` | content-derived ID or UUID | Content-derived for deterministic checks; UUID for operational checks. |
| `subjectType`, `subjectId` | string/identifier | Required. |
| `checkPerformed` | string | Human-readable, exact description of the check; required unless both definition fields are present. |
| `checkDefinitionId`, `checkDefinitionVersion` | string | Stable check definition and version; both required when `checkPerformed` is absent. Both forms may be retained together. |
| `findingCode` | string | Stable machine-readable check/finding code. |
| `outcome` | enum | `passed`, `failed`, `blocked`, `inconclusive`, `unsupported`, `error`. |
| `severity`, `evidence`, `limitations` | structured | Required; empty limitations allowed only for conclusive outcomes. |
| `affectedArtifactSha256` | SHA-256/null | Required when the subject is or derives from an artifact. |
| `deterministicResultPayload` | object/null | Canonicalizable content-derived result when applicable. |
| `blocksDownstream` | boolean | Explicit. |

The linked ValidationExecutionRecord supplies the required check timestamp and actor outside the deterministic payload. ScreeningExecutionRecord and ClassificationProposalRecord similarly preserve screening/proposal timestamps without contaminating deterministic content hashes.

### UnresolvedItem

| Field | Type | Rules |
|---|---|---|
| `unresolvedItemId` | UUID | Immutable. |
| `scope`, `subjectReferences` | structured | Required. |
| `issueType` | controlled vocabulary | Conflict, ambiguity, missing input, failed check, unsupported format, integrity issue, etc. |
| `evidence`, `competingPossibilities`, `downstreamConsequence` | structured | Preserve uncertainty. |
| `responsibleQueueOrReviewer` | string/null | Explicit assignment state. |
| `status` | enum | Deterministic source state only: `open` or `assigned`. |
| `resolutionHistory` | UnresolvedItemDecision references | Append-only human-only decisions; effective `resolved`, `accepted-risk`, `reopened`, or `superseded` state is computed by replay and never written into the source item. |

## 15. EvidenceManifest

An export/reconciliation projection, not a mutable source of history.

| Field | Type | Rules |
|---|---|---|
| `schemaVersion`, `producerVersion`, `ruleSetVersion` | string | Required. |
| `snapshotId` | SHA-256 | Required canonical snapshot identity. |
| `deterministicPayload` | object | Required canonicalizable content-derived records and stable content references; excludes random UUIDs, timestamps, session identity, and UI state. |
| `contentManifestId` | SHA-256 | Required lowercase SHA-256 of canonical `deterministicPayload`. |
| `operationalMetadata` | object | Separately linked case/attempt/record UUIDs, run/reviewer timestamps, session identifiers, UI state, and labeled execution metadata excluded from deterministic hash. |
| `reconciliation` | two ledgers and counts | Each discovered record appears once in the origin ledger (`source-artifact`/`extracted-member`) and once in the terminal accounting ledger (`accepted-for-processing`/`provisional-safety-block`/`pending-human-disposition`/`final-human-disposition-recorded`/`failed`/`duplicate`/`excluded`). Both independently balance to `discoveredRecordTotal`; one entry in each ledger is required, not double counting. Accounting categories never confer release or a governed final state. US2 may reconcile entirely provisional records; US3 human decisions remain separate. |
| `validationSummary` | counts/status | Must identify blocking/inconclusive results. |

The deterministic payload contains typed references or embedded records for artifacts, containment edges, failed-member observations, extraction results, screening findings/outcomes, immutable classification proposals, evidence relationships, typed population-candidate sources, unresolved items, validation results, acquisition payload hashes/registrations/rerun triggers, and reconciliation ledgers. Operational metadata contains typed quarantine and artifact-eligibility decisions, classification/relationship/population/authority decisions, acquisition record UUIDs, acquisition lineage nodes/edges, proposal decision history, and promoted governed facts. Generic events may supplement but never replace typed governed records.

## 16. DeidentifiedExport

A governed export envelope supports either `de-identified-real-data` or `synthetic-mock-data`; the modes cannot be conflated.

| Field | Type | Rules |
|---|---|---|
| `deterministicPayload` | object | Canonical source workspace reference, snapshot/artifact SHA-256 values, purpose, destination, sensitivity, field allowlist, direct/indirect removals, transformations, retained generalized quasi-fields, risks, limitations, validator identity/version, findings, and records. |
| `rawParticipantPiiExcluded`, `rawDirectOrIndirectIdentifiersExcluded` | boolean | Required constants `true`. |
| `deterministicPayloadSha256` | SHA-256 | Lowercase hash of canonical deterministic payload only. |
| `operationalMetadata` | object | Export UUID, source case/workspace operational reference, created timestamp, provenance, and append-only human approval history. |
| `humanApprovalHistory` | decision array | Required for de-identified real-data packages; every actor is human, every record binds the enclosing deterministic payload hash, and effective status comes from ordinal/predecessor replay. |
| `retainedGeneralizedQuasiFields` | array | Each entry requires field name, transformation/generalization, justification, residual-risk result, and validation status; only passed, acceptable-non-identifying fields may be externally eligible. |

Every exported record property must appear in `allowedOutputFields`; raw direct or indirect identifiers and all non-allowlisted fields are blocking validation failures. Operational UUIDs and timestamps never alter deterministic export identity. Feature 009 creates, validates, imports, and stores packages locally but does not transmit them or contain an external-LLM client.

## 17. Evidence Acquisition & Structured Extraction Framework

Reusable intake-layer infrastructure for future requesting modules. It does not implement the requesting module's interpretation, calculation, or report.

### Deterministic acquisition payloads

| Field | Type | Rules |
|---|---|---|
| `deterministicRequestPayload` | object | Requesting-module identifier, missing facts, candidate types, recommendation-only priorities, schema/instruction identities, versions and content hashes, and logical rerun trigger. |
| `requestPayloadSha256` | SHA-256 | Hash of canonical deterministic request payload only. |
| `deterministicPackagePayload` | object | Request hash, artifact hashes, registered schema/instruction identities and hashes, and local-only transmission policy. |
| `packagePayloadSha256` | SHA-256 | Hash of canonical deterministic package payload only. |
| `deterministicProposalPayload` | object/null | Request/package hashes, artifact hashes, proposed facts, citations, uncertainty, conflicts, registrations, and logical rerun trigger. |
| `proposalPayloadSha256` | SHA-256/null | Hash of canonical deterministic proposal payload only. |

PBGC Case Workbench Canonicalization Profile v1 defines deterministic fields, exclusions, NFC, key order, registered arrays, recursive ordered fallback, duplicates, null/absence, and UTF-8. RFC 8785 governs only number serialization. Intrinsic rules require explicit schema typing; arbitrary objects are never duck typed.

### Operational metadata and ProposalDecisionRecord

Operational metadata contains request/package/proposal UUIDs, timestamps, storage paths, runtime status, UI state, transport metadata, and append-only proposal decisions. Each decision records decision ID, positive `appendOrdinal`, exact proposal hash, approve/reject/revoke/supersede type, human actor, rationale, informational timestamp, predecessor ID and deterministic predecessor-content hash, resulting governed status, and rule-set/schema versions. Ordinal 1 has no predecessor; every later ordinal increments exactly once and points to the immediately preceding decision ID/content hash. Decision content hashing excludes all UUIDs, actor, rationale, and timestamp. Replay follows ordinal/predecessor only, never timestamps. Allowed transitions are no-decision→approve/reject, approve→revoke/supersede, reject→supersede, and revoked→supersede. Rejection cannot be revoked; supersession targets the effective prior decision; gaps, branches, cycles, duplicates, or ineffective targets are invalid.

### Acquisition lineage

Typed nodes and edges preserve request → package → proposal → decision → promoted fact, plus request → schema, instruction, and rerun-trigger links. Each promoted fact requires a stable fact key, valid JSON Pointer into `proposedExtractedFacts`, `factContentSha256` over canonical `{factKey, factJsonPointer, value}`, proposal hash, current effective approval ID, exact artifact hashes, supporting citation IDs, target governed-record type/ID, and promotion rule-set/schema versions. Request/package/proposal nodes use their deterministic payload hashes; decision nodes hash only ordinal, predecessor, proposal hash, decision type/result, and versions; promoted-fact nodes use `factContentSha256`; rerun nodes hash deterministic trigger content. Operational UUIDs, actors, rationale, and timestamps never affect these hashes. Validation rejects invalid or absent pointers, ambiguous multi-fact promotion, fact/citation/artifact hash mismatches, cross-proposal or revoked approval, conflicting duplicate promotion, orphan nodes, broken rerun lineage, and duplicate IDs.

## Invariants

1. No production Case exists without an authoritative PBGC identifier and internal UUID.
2. No ContentObject is downstream eligible before successful post-write hash verification.
3. No original object path is overwritten by the application.
4. No extracted member exists without a preserved parent container and ContainmentEdge.
5. No changed snapshot resumes an existing attempt.
6. No artifact, classification, relationship, or population-candidate deterministic source record stores human-final status; effective status or eligibility is computed only from a valid same-subject, exact-artifact typed human-decision chain, and an incomplete manifest cannot claim approval.
7. No release applies to a different SHA-256.
8. No real participant PII is stored in Git or transmitted by the production runtime.
9. No raw observed participant value is replaced by a normalized/default value.
10. No manifest claims a check or execution that lacks a corresponding actual event/result.
11. No artifact is authoritative downstream without a separate active human AuthorityDecision for its exact SHA-256.
12. Snapshot identity and manifest content identity are lowercase SHA-256 values; operational UUIDs never substitute for them.
13. Every final governed decision that permits or blocks downstream use is made by a human actor; a system actor may only propose, inspect, screen, hash, parse, or record system events.
14. An AuthorityDecision is invalid unless its source-role proposal, human classification approval, and authority decision all reference the same artifact SHA-256.
15. A ValidationResult identifies the exact check through `checkPerformed`, or through both a check-definition identifier and version.
16. Every discovered record appears exactly once in the origin ledger and exactly once in the terminal-disposition accounting ledger; each ledger independently balances to the discovered-record total. Accounting classification never confers governed status, and one appearance in each separate ledger is required rather than double counting.
17. A human export or extraction-proposal approval is invalid when its referenced payload/proposal hash differs from the enclosing deterministic hash.
18. Raw direct or indirect identifiers are prohibited from external-use packages; retained generalized quasi-fields require passed non-identifying residual-risk evidence.
19. Evidence acquisition and structured extraction packages remain local, proposal-only, and downstream-blocked until exact-hash human approval.
20. Acquisition request, package, and proposal hashes cover canonical deterministic payloads only; operational metadata changes cannot change them.
21. Proposal decision histories are append-only, human-only, same-proposal hash chains; revocation and supersession require valid prior decisions.
22. Automated safety states and terminal accounting categories cannot satisfy a final quarantine disposition; transition to `released`, `final-quarantine`, `rejected`, `revoked`, or `superseded` requires a typed human decision.
23. Acquisition decision status is replayed only through the gapless, non-branching append-ordinal predecessor chain; timestamp order has no governing effect.
24. Every promoted governed fact resolves to exactly one proposal fact location and matching canonical fact-content hash, citations, artifacts, and current effective approval.
25. User-facing terminology never presents an accounting category or provisional security state as a human-final, legal, authoritative, or released disposition; every block explains cause, required review/evidence, and next action.
26. Every population evidenceKey and candidateKey recomputes from its defined canonical deterministic projection; each candidate decision resolves to exactly one matching manifest candidate and exact artifact/evidence identity.
27. An unregistered array at any deterministic nesting depth, including inside proposedExtractedFacts, is valid order-significant content and is never rejected solely for lacking a path annotation.
28. Every typed governed-decision family has a complete transition matrix. Replay is same-subject, human-only where final, gapless, non-branching, predecessor-content-hash verified, ordinal ordered, and timestamp independent; prohibited transitions and ineffective supersession fail closed.
29. RFC 8785 governs every finite JSON number in deterministic content. Exact lexical decimals use canonical decimal strings and never binary JSON numbers.
30. UnresolvedItem source status is open or assigned only; every effective resolution status is a non-mutating projection of a complete typed human decision chain.
