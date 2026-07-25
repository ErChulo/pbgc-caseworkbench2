# Feature Specification: Case Intake and Evidence Normalization

**Feature Branch**: `009-case-intake-normalization`

**Created**: 2026-07-18

**Status**: Draft

**Input**: User description: "Build the first bounded feature for PBGC Case Workbench 2: Case Intake and Evidence Normalization."

## Clarifications

### Session 2026-07-18

- Q: Must expected, authorized participant PII be quarantined solely because it is PII? → A: No. It may be processed locally under sensitive-data controls; external LLM use requires de-identification, while unauthorized, misrouted, excessive, or unverifiable PII is quarantined.
- Q: For a submitted container, which bytes must be preserved as original evidence? → A: Preserve and hash both the immutable submitted container and every successfully extracted member as an independently inventoried artifact with parent-child containment lineage.
- Q: What is the scope of an authorized quarantine release? → A: A release applies only to the exact artifact SHA-256 and reviewed findings; changed bytes require a new artifact record, screening, quarantine determination, and release decision.
- Q: When may an interrupted intake attempt resume in place? → A: Only when its immutable package snapshot is unchanged; any added, removed, renamed, or changed artifact requires a new linked intake attempt.
- Q: May an automated document-category or source-role classification become final without human approval? → A: No. Automated classifications remain proposed until an authorized human approves them; confidence thresholds never constitute approval.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a Controlled Case Intake (Priority: P1)

An authorized caseworker creates a terminated-plan case using the required authoritative PBGC case identifier. The system assigns a separate immutable internal UUID, records who initiated intake and when, and prevents an accidental second production case for the same authoritative identifier.

**Why this priority**: Every evidence record and downstream artifact needs a stable, case-independent identity before evidence can be accepted safely.

**Independent Test**: Create a production case with a previously unused authoritative identifier and verify that the resulting case record has both identities, complete creation provenance, and no case-specific hard-coded defaults.

**Acceptance Scenarios**:

1. **Given** an authorized user and an unused authoritative PBGC case identifier, **When** the user creates a production case, **Then** the system creates one case with that identifier and a new immutable internal UUID.
2. **Given** an existing production case with the same authoritative identifier, **When** a user attempts normal production-case creation, **Then** creation stops, the existing case is presented, and no second production case is created.
3. **Given** a duplicate authoritative identifier, **When** an authorized human explicitly chooses to resume intake, **Then** the new intake session is linked to the existing case with the decision and actor recorded.
4. **Given** a duplicate authoritative identifier, **When** an authorized human approves a separately designated test, training, or duplicate-investigation case, **Then** the new case has a distinct UUID, a non-production purpose, and a traceable approval record.

---

### User Story 2 - Inventory and Preserve a Case Package (Priority: P1)

An authorized caseworker submits a package containing plan documents, amendments, collective bargaining agreements, notices, actuarial reports, participant data, workpapers, correspondence, and related evidence. Each original artifact is preserved immutably and represented in a reproducible inventory with its hash, provenance, receipt context, and processing status.

**Why this priority**: An immutable, complete inventory is the minimum auditable product of intake and is required before extraction or review can be trusted.

**Independent Test**: Submit a mixed-format package and verify that every discovered artifact receives exactly one inventory entry, an independently reproducible SHA-256 value, source provenance, byte size, and an immutable-original reference.

**Acceptance Scenarios**:

1. **Given** a package with supported and unsupported artifacts, **When** intake completes, **Then** every discovered artifact appears in the manifest with an outcome and no original source bytes are altered.
2. **Given** two byte-identical artifacts with different filenames, **When** they are hashed, **Then** the system establishes an exact-duplicate relationship automatically and preserves both receipt records.
3. **Given** an interrupted intake, **When** intake resumes, **Then** already verified artifacts are not duplicated, incomplete work is identified, and the final manifest is reproducible.
4. **Given** an unreadable or corrupt artifact, **When** it cannot be normalized, **Then** its original is retained, the failure is recorded, and unaffected artifacts continue through intake.
5. **Given** a submitted container with readable members, **When** extraction completes, **Then** the immutable container and every successfully extracted member have separate inventory entries and SHA-256 hashes linked by parent-child containment lineage.
6. **Given** a container whose extraction is partial or fails, **When** intake records the result, **Then** the container remains preserved, successful members remain inventoried, the failure and missing scope are explicit, and no unobserved member is invented.
7. **Given** an interrupted attempt whose recorded package snapshot is unchanged, **When** intake resumes in place, **Then** successfully processed artifacts are reused without duplication and results match uninterrupted processing of that snapshot.
8. **Given** an interrupted attempt whose package has an added, removed, renamed, or changed artifact, **When** intake restarts, **Then** a new linked attempt is created with a divergence reason and the interrupted attempt remains unchanged.

---

### User Story 3 - Screen and Quarantine Unsafe Artifacts (Priority: P1)

An authorized reviewer receives artifact-level screening results for suspected participant PII, secrets, malware, macros, embedded scripts, executables, external links, and other risky binary content. Affected artifacts are quarantined while unaffected artifacts continue, and only an authorized human can release a quarantined artifact.

**Why this priority**: Real case evidence may contain sensitive data and active content; unsafe material must not enter downstream processing or Git merely because the package was accepted.

**Independent Test**: Submit a package containing one flagged macro-enabled artifact and one clean text artifact; verify that only the flagged artifact is quarantined, the clean artifact proceeds, and no execution claim is recorded.

**Acceptance Scenarios**:

1. **Given** an artifact with suspected unsafe content, **When** automated screening flags it, **Then** the artifact enters a distinct `provisional-quarantine` or `provisional-safety-block` state, remains excluded from downstream extraction, and is linked to the screening findings without being represented as a human-final disposition.
2. **Given** a package containing quarantined and unaffected artifacts, **When** intake continues, **Then** unaffected artifacts proceed and package status accurately reflects partial completion.
3. **Given** an artifact in a provisional safety state, **When** an authorized reviewer releases, finally quarantines, rejects, or revokes it, **Then** a typed human decision records reviewer identity, timestamp, rationale, prior status, and the distinct final resulting status.
4. **Given** an Office file or binary artifact that was inspected but not executed, **When** results are reported, **Then** no result claims that macros, embedded code, Office applications, or untrusted binaries were safely executed.
5. **Given** expected participant PII authorized for the production case, **When** local deterministic intake processes it under sensitive-data controls, **Then** the artifact is not quarantined solely because it contains PII and no real participant PII leaves the user's device.
6. **Given** a workflow that would send population information to an external LLM, **When** direct or indirect identifiers and unnecessary PII have not been removed and replaced with a non-identifying general key, **Then** transmission is blocked.
7. **Given** a released artifact whose bytes change through a new version, re-export, or new receipt, **When** the changed artifact is ingested, **Then** it receives a new inventory record and cannot inherit the prior release decision.
8. **Given** a newly received artifact whose SHA-256 exactly matches a released artifact, **When** byte identity is verified, **Then** it may inherit the same release state only with explicit linkage to the reviewed artifact and with separate receipt provenance preserved.

---

### User Story 4 - Classify Evidence and Propose Relationships (Priority: P2)

An evidence reviewer receives deterministic classifications, extracted date metadata, and proposed relationships while retaining final human control over authority, supersession, amendment, near-duplicate, conflict, replacement, and effective-period decisions.

**Why this priority**: Downstream rule extraction needs organized evidence, but automated intake must not make legal, actuarial, or source-authority conclusions.

**Independent Test**: Submit related plan documents and amendments and verify that classifications and relationship source records include evidence and confidence, remain proposal-only, and produce an approved or rejected computed projection only through deterministic replay of a valid same-subject typed human-decision chain without mutating the proposal.

**Acceptance Scenarios**:

1. **Given** a classifiable artifact, **When** normalization completes, **Then** it has a document category, source role, extracted date candidates, confidence, and review status.
2. **Given** two similar but non-identical artifacts, **When** a near-duplicate is suggested, **Then** the relationship remains proposed until an authorized human acts.
3. **Given** an apparent amendment, supersession, authority, conflict, replacement, or effective-period relationship, **When** the system identifies it, **Then** it records a proposal without finalizing the relationship.
4. **Given** a reviewer decision on a proposed relationship, **When** the decision is appended, **Then** the proposal remains unchanged and the typed decision chain retains exact subject and target identity, artifact hashes, decision-content hash, predecessor linkage, reviewer identity, timestamp, rationale, and evidence considered; the effective final status is a computed projection of valid replay.
5. **Given** an automated document-category or source-role classification at any confidence, **When** it is produced and later reviewed, **Then** the ClassificationProposal remains `proposed` or `unresolved`; only a separate valid typed human-decision chain produces a computed final projection with visible provenance.
6. **Given** an exact duplicate of an artifact with an approved classification, **When** matching SHA-256 verifies byte identity, **Then** the duplicate may reuse that classification only with explicit traceability to the approved source record and separate provenance.

---

### User Story 5 - Detect and Normalize Population Files (Priority: P2)

An intake analyst can identify likely participant-population files and obtain a structural profile and validation findings without changing, inventing, correcting, or imputing participant data.

**Why this priority**: Later population profiling depends on knowing which artifacts may contain participant records while preserving missing and invalid values exactly as evidence.

**Independent Test**: Submit a representative population file containing missing and malformed values and verify that it is identified as a candidate, its structure is described, and all source values remain unchanged with explicit findings.

**Acceptance Scenarios**:

1. **Given** a likely participant file, **When** intake inspects its structure, **Then** the system records a recomputable candidateKey, typed evidenceKey references to exact artifacts and cited locations, observed fields and record counts where readable, and its sensitivity classification.
2. **Given** missing, invalid, or unexpected participant values, **When** normalization runs, **Then** those values are preserved and reported rather than filled, corrected, or converted to zero.
3. **Given** an ambiguous file, **When** population-file detection is inconclusive, **Then** the artifact remains unresolved and is routed to human review.
4. **Given** a proposed population candidate and a valid same-subject typed human-decision chain, **When** effective status is requested, **Then** the system computes the final status from deterministic replay without mutating the proposal record; absent, stale, revoked, branched, superseded, system-authored, or mismatched decisions leave downstream use blocked.

---

### User Story 6 - Produce Auditable Normalized Outputs (Priority: P2)

A downstream user receives a deterministic evidence inventory, normalized metadata, extraction outputs, validation results, unresolved items, and lineage records that can be reproduced from the same case package without relying on narrative interpretation.

**Why this priority**: The feature succeeds only if later plan-rule, population, actuarial, and V1 work can consume controlled evidence without losing provenance or review boundaries.

**Independent Test**: Process the same unchanged package twice under the same approved rules and verify identical content-derived identifiers, hashes, classifications, normalized values, findings, and relationship proposals apart from explicitly recorded run metadata.

**Acceptance Scenarios**:

1. **Given** a completed or partially completed intake, **When** outputs are produced, **Then** each derived value links to its source artifact, extraction location where available, transformation status, and validation results.
2. **Given** identical source bytes and the same approved normalization rules, **When** the package is reprocessed, **Then** content-derived outputs are reproducible and any run-specific differences are explicitly identified.
3. **Given** an ambiguity or failed validation, **When** outputs are finalized, **Then** an unresolved item records scope, evidence, competing interpretations where applicable, consequence, owner, and status.

### Cross-Cutting Infrastructure - Evidence Acquisition & Structured Extraction Framework

Feature 009 establishes reusable intake-layer infrastructure that future modules may use to declare missing facts and request structured evidence extraction without bypassing evidence governance. It registers candidate document or report types, source-priority recommendations, extraction schemas, extraction instructions, exact source hashes, citations, uncertainty, conflicts, immutable proposal state, separately replayed human-decision status, and rerun triggers. It may create, validate, import, and store these packages locally, but it does not transmit them, call an external LLM, interpret plan provisions, calculate benefits, or produce downstream reports.

**Acceptance Scenarios**:

1. **Given** a future module with missing facts, **When** it registers an acquisition request, **Then** the local package identifies the missing facts, candidate sources, recommendation-only priorities, registered schema and instructions, and rerun trigger metadata.
2. **Given** a returned structured extraction proposal, **When** it is imported locally, **Then** it is validated against the registered schema and instructions and retains exact artifact SHA-256 links, citations, uncertainty, conflicts, and validation results.
3. **Given** an automated or unapproved extraction proposal, **When** a downstream module requests it, **Then** downstream use remains blocked until an authorized human approves the exact proposal hash.
4. **Given** an acquisition or extraction package, **When** Feature 009 processes it, **Then** no external transmission or external-LLM call occurs and no downstream interpretation, calculation, or report production is performed.

### Edge Cases

- A package is empty, contains nested containers, contains zero-byte files, or contains filenames that collide after normalization.
- The authoritative case identifier is missing, malformed, already assigned to production, or associated with a closed case.
- An artifact changes while intake is reading it, or its recorded hash does not match a later integrity check.
- Two artifacts share a filename but differ in bytes, or share bytes but differ in filename, source, or receipt context.
- A container is encrypted, password-protected, recursively nested, corrupt, or only partly readable.
- An artifact's stated date conflicts with embedded metadata, filename dates, signature dates, or dates in related evidence.
- A document spans multiple effective periods or appears to contain both authoritative and illustrative material.
- Screening services are unavailable, return inconclusive results, or disagree.
- A quarantined artifact is later released, revoked, or found to have contaminated a derived output; changed bytes arrive as a new artifact rather than replacing its immutable history.
- A population candidate has multiple sheets, repeated headers, mixed record types, formulas, hidden content, or inconsistent row widths.
- Intake stops after originals are preserved but before all classifications, extractions, or validations finish.
- A previously approved relationship is challenged or superseded by a later human decision.

## Requirements *(mandatory)*

### Functional Requirements

#### Case identity and intake control

- **FR-001**: The system MUST maintain both a required authoritative PBGC case identifier and an internally generated immutable UUID for each production case.
- **FR-002**: The internal UUID MUST be the primary immutable system identity and MUST remain unchanged for the life of the case.
- **FR-003**: The system MUST record case purpose as production, test, training, or duplicate investigation and MUST prevent a non-production case from being represented as production.
- **FR-004**: The system MUST stop normal creation when the authoritative identifier already belongs to a production case, present the existing case, and create no second production case silently.
- **FR-005**: Resuming intake into an existing case or creating a separately designated non-production case after an identifier collision MUST require an explicit authorized-human decision with actor, timestamp, rationale, and resulting linkage.
- **FR-006**: The system MUST not apply defaults or facts from any particular case, plan, employer, participant population, or reference candidate when creating a new case.
- **FR-007**: Each intake attempt MUST have a distinct identity, initiating actor, start and end timestamps, source context, status, and relationship to its case.

#### Original artifacts, hashing, and provenance

- **FR-008**: The system MUST inventory plan documents, amendments, CBAs, notices, actuarial reports, participant data, workpapers, correspondence, and other submitted case evidence without requiring all categories to be present.
- **FR-009**: The system MUST preserve the received bytes of each original artifact immutably and MUST distinguish originals from every extraction, preview, normalized record, or other derivative.
- **FR-010**: The system MUST compute and record a SHA-256 hash and byte size from each received artifact before it is eligible for downstream processing.
- **FR-011**: The system MUST verify that a preserved original still matches its recorded hash on later integrity checks and MUST quarantine or block derivatives when integrity fails.
- **FR-012**: Each artifact MUST retain available provenance including submitting actor or source, source location or transfer context, original filename, receipt timestamp, declared description, case association, and custody events.
- **FR-013**: The system MUST produce a manifest entry for every discovered artifact, including unsupported, unreadable, quarantined, failed, and omitted artifacts.
- **FR-014**: The system MUST preserve separate receipt and provenance records for artifacts with matching bytes.
- **FR-015**: The system MAY finalize an exact-duplicate relationship automatically only when SHA-256 hashes match; filename, size, metadata, or similarity alone MUST NOT establish an exact duplicate.
- **FR-015A**: A submitted container MUST remain immutable original evidence with its own SHA-256 hash and MUST NOT be replaced by, or collapsed into, its extracted members.
- **FR-015B**: Every successfully extracted container member MUST be independently inventoried with its own bytes, SHA-256 hash, provenance, status, review history, and explicit parent-child containment lineage to the submitted container.
- **FR-015C**: Member extraction metadata MUST retain the observed member path, extraction sequence, extraction result, and both the original and any normalized filename.
- **FR-015D**: Partial or failed extraction MUST preserve the container and every successfully observed member, record the failure and affected scope, and MUST NOT create records for members that were not actually observed.

#### Classification, dates, and evidence relationships

- **FR-016**: The system MUST propose a document category sufficient to distinguish plan documents, amendments, CBAs, notices, actuarial reports, participant data, workpapers, correspondence, regulatory material, training material, illustrative examples, and other evidence; every automated proposal MUST remain unapproved until an authorized human reviewer approves it.
- **FR-016A**: Each automated document-category or source-role ClassificationProposal MUST be immutable proposal evidence, store only `proposed` or `unresolved`, and record the proposed value, confidence score, supporting evidence, classifier identity and version, timestamp, and proposal status.
- **FR-016B**: A confidence threshold MUST NOT constitute approval, regardless of confidence level.
- **FR-016C**: Unapproved classifications MAY support triage, search, queue ordering, and reviewer assistance but MUST NOT be used as authoritative case facts or production downstream inputs.
- **FR-016D**: Human classification approval, rejection, revocation, supersession, or reclassification MUST be represented by a separate append-only typed human-decision chain. Effective final classification status MUST be a computed projection of valid same-proposal replay with visible decision provenance and MUST NOT mutate ClassificationProposal. The chain MUST preserve prior value, reviewer identity, timestamp, rationale, decision-content hash, predecessor linkage, prior status, resulting status, and complete history.
- **FR-016E**: An exact duplicate MAY reuse a human-approved classification only after matching SHA-256 verifies byte identity, the reuse is explicitly linked to the approved source record, and separate receipt provenance is preserved.
- **FR-017**: The system MUST separately propose a source role as authority-candidate, historical, training, illustrative, test, or unresolved; `authority-candidate` is only the candidate state after source-role classification and before a separate AuthorityDecision. Only a human-approved source-role classification may be used in production, and classification approval MUST NOT itself confer document authority or canonical status.
- **FR-017A**: Authoritative downstream use MUST require a separate human AuthorityDecision that references the source-role proposal and its separate current-effective human classification approval, proves all records apply to the same exact artifact SHA-256, and records deterministic content hashes plus operational linkage and review evidence. If the linked classification approval is revoked, superseded, ineffective, stale, or no longer matches the bytes, dependent authority becomes ineffective and downstream use is blocked. Renewed authority requires a new valid typed AuthorityDecision with exact current lineage. Classification approval alone MUST NOT confer authority.
- **FR-017B**: An authority decision MUST support approved, rejected, revoked, and superseded states without erasing prior decisions, and a changed artifact SHA-256 MUST require a new authority decision.
- **FR-018**: The system MUST capture declared and extracted date candidates, including effective, execution, adoption, issue, receipt, and supersession dates when present, while retaining each value's source and review status.
- **FR-019**: Conflicting or uncertain date candidates MUST remain visible and MUST NOT be silently collapsed into one accepted date.
- **FR-020**: Automated analysis MAY propose near-duplicate, supersession, amendment, authority, conflict, replacement, and effective-period relationships with evidence and confidence, but MUST NOT finalize them.
- **FR-021**: Every non-exact EvidenceRelationship deterministic source record MUST store only `proposed` or `unresolved`; it MUST NOT store `approved`, `rejected`, `released`, `final-quarantine`, or an equivalent human-final state. Exact-duplicate byte identity MUST be represented by its exact SHA-256 linkage rather than by mutating a relationship proposal into an approved state.
- **FR-022**: A relationship's effective approved, rejected, revoked, or superseded status MUST be a computed projection derived exclusively by deterministic replay of its applicable append-only typed human-decision chain. Each decision MUST preserve exact relationship key, subject and target identities, applicable artifact SHA-256 values, decision type, deterministic decision-content hash, predecessor ID and content hash, reviewer identity, timestamp, rationale, evidence considered, and schema/rule-set version. Orphan or system approval, a missing decision, wrong decision type/subject/target, stale or mismatched content hash, ineffective/revoked/branched/superseded approval, or incomplete manifest MUST remain downstream-blocked and MUST NOT produce a final projection.
- **FR-023**: Reprocessing MUST NOT overwrite an existing relationship proposal or its effective human-decision projection; a new contradictory finding MUST create a reviewable proposal or unresolved item.

#### Screening, quarantine, and privacy

- **FR-024**: The system MUST screen each artifact, as applicable to its type, for expected or unexpected participant PII, other sensitive data, secrets, malware, executable content, macros, embedded scripts or objects, external links, and risky binary features, while distinguishing authorized PII from unauthorized or unverifiable PII.
- **FR-025**: Unauthorized, misrouted, excessive, or unverifiable PII, or another suspected blocking risk, MUST immediately place the affected artifact in a downstream-blocked `provisional-quarantine` or `provisional-safety-block` state rather than automatically reject the entire package; expected PII authorized for the case MUST NOT trigger quarantine solely because it is PII, and unaffected artifacts MUST remain eligible to continue. Automated actors may create only `screening-pending`, `rescreen-required`, `provisional-quarantine`, or `provisional-safety-block` states and findings, never a human-final disposition.
- **FR-026**: Deterministic artifact source records MUST store only `blocked`, `proposed-only`, or `pending-human-decision` downstream eligibility. They and quarantined derivatives MUST remain excluded from governed downstream processing until an exact-hash typed human ArtifactEligibilityDecision chain—plus an effective same-artifact quarantine release where applicable—computes eligibility; the computed projection MUST NOT mutate the artifact source record. Changed bytes require a new chain and cannot inherit eligibility.
- **FR-027**: Quarantine findings MUST record category, severity or disposition, evidence, screening status, screening time, and limitations of the screening performed.
- **FR-028**: `released`, `final-quarantine`, `rejected`, `revoked`, and `superseded` are human-final disposition states. Release, final or continued quarantine, rejection, revocation, supersession, and inherited release MUST require an authorized-human typed decision that retains actor, timestamp, rationale, prior status, resulting status, and complete history. Automated screening or re-screening MAY create findings, provisional safety states, and disposition proposals but MUST NOT create or satisfy a final governed disposition.
- **FR-028A**: A quarantine release MUST be bound to the exact artifact SHA-256 and the specific screening findings reviewed.
- **FR-028B**: Changed bytes, a new version, a re-export, or a newly received copy with a different SHA-256 MUST create a new artifact inventory record and undergo a completely new screening, quarantine determination, and release lifecycle. It MUST NOT replace or modify the old artifact's immutable disposition history.
- **FR-028C**: Prior release decisions MAY be linked as historical context but MUST NOT automatically carry forward to an artifact with a different SHA-256.
- **FR-028D**: A separately received exact duplicate MAY inherit the release state of a reviewed artifact only after byte-for-byte identity is verified by matching SHA-256, the inheritance linkage is recorded, and its separate receipt provenance is preserved.
- **FR-028E**: Every final release, rejection, revocation, supersession, continued-quarantine, or inherited-release decision MUST retain the authorized human reviewer's stable identity, timestamp, rationale, prior status, resulting status, and complete status history. `revoke`, `inherit-release`, `supersede`, and continuation of an existing human-final quarantine MUST reference the current effective prior human decision for the same exact artifact SHA-256 and a valid prior state. Inherited release is permitted only for verified unchanged bytes and explicit human confirmation; changed bytes can never inherit release. Automated provisional blocking requires no prior human decision and cannot change final eligibility.
- **FR-029**: The system MUST prevent raw real-case evidence and participant-level extracted data from being designated for Git storage and MUST clearly distinguish local controlled real-case data from repository-safe de-identified, redacted, synthetic, or mock material.
- **FR-030**: The system MUST NOT execute Office macros, embedded scripts, or untrusted binaries during intake and MUST NOT claim successful execution, safety, or absence of risk based solely on inspection.
- **FR-031**: An unavailable, failed, or inconclusive screening capability MUST produce an explicit unresolved or quarantine status according to risk and MUST NOT be represented as a passed screen.
- **FR-031A**: Authorized real participant PII MUST remain local to the user's device during deterministic intake and MUST NOT be transmitted to an external LLM service.
- **FR-031B**: Before any population information is sent to an external LLM, the system MUST replace direct and indirect identifiers with a non-identifying general key and remove all PII not necessary for the approved purpose.
- **FR-031C**: LLM-assisted development, testing, demonstration, and prompt validation MUST use either a de-identified population that preserves only required actuarial fields or synthetic/mock population data; the existing PBGC mock-population approach is an approved candidate when it is generated from field structure without carrying real participant values or identifiers.
- **FR-031D**: Every de-identified-real or synthetic/mock export MUST use a separately validated export record that identifies source snapshot and artifact hashes, purpose, destination class, sensitivity, allowed fields, removed direct and indirect identifiers, transformations, retained generalized non-identifying quasi-fields, residual risks and limitations, validator identity/version, provenance, deterministic payload/hash, operational metadata, and explicit assertions that raw participant PII and raw direct or indirect identifiers are excluded. Every retained generalized quasi-field MUST record its field name, transformation or generalization, justification, residual-risk result, and validation status. Direct identifiers, raw indirect identifiers, and fields outside the approved allowlist MUST block external use; a de-identified real-data export MUST retain human approval whose payload hash equals the enclosing deterministic payload SHA-256.
- **FR-031E**: Feature 009 MAY create, validate, import, and store governed extraction or export packages locally. It MUST NOT transmit a package, call an external LLM, include an external-LLM client, or provide a server-side case-data path; any external transmission remains outside the production runtime and local-first zero-network behavior remains mandatory.

#### Population-file detection and normalization

- **FR-032**: The system MUST identify likely participant-population artifacts using observable content and metadata and MUST record the basis and confidence of each candidate designation. Every PopulationCandidate source record MUST carry a required lowercase `candidateKey`, defined as SHA-256 of its canonical deterministic content excluding `candidateKey`, UUIDs, timestamps, UI state, storage paths, operational metadata, and computed human-decision projections.
- **FR-033**: For each readable population candidate, the system MUST produce a structural profile that includes observed fields, record and sheet or section counts where determinable, source formats, and validation findings without interpreting participant entitlement.
- **FR-034**: The system MUST preserve missing, malformed, unexpected, and conflicting participant values as observed and MUST NOT invent, impute, correct, or replace them with zero.
- **FR-035**: A PopulationCandidate deterministic source record MUST store only `proposed` or `unresolved`. Its evidence and manifest-local typed observations MUST use one lowercase `evidenceKey`, the SHA-256 of PBGC Case Workbench Canonicalization Profile v1 `{artifactSha256, citationId, sourceLocator, evidenceKind, observedTextOrValue when present}`. Each reference MUST resolve by evidenceKey to exactly one observation with identical deterministic fields and canonical bytes; evidenceKey and citationId are unique and cited artifacts occur in the manifest. `PopulationCandidate.evidence` is intrinsically set-like only where a schema explicitly types the value as PopulationCandidate. Arbitrary candidate-shaped objects are never duck typed; their unregistered arrays remain order-significant. Explicitly typed candidate evidence permutations preserve candidate and enclosing manifest bytes/hashes, while genuine content changes propagate through evidenceKey, candidateKey, and manifest hash. Effective candidate status remains a non-mutating typed human-decision projection.
- **FR-036**: Participant-level normalized outputs MUST retain lineage to the precise source artifact and source location where determinable and MUST remain subject to the source artifact's quarantine and access status.

#### Outputs, review, reproducibility, and errors

- **FR-037**: The system MUST produce deterministic content payloads for the evidence manifest, artifact metadata, extraction results, classifications, relationship proposals, screening results, validation results, unresolved items, and content-derived status records.
- **FR-037A**: Each deterministic payload MUST be canonicalizable, exclude random UUIDs, timestamps, user-session identifiers, UI state, and other non-deterministic execution metadata, and have a required lowercase SHA-256 content hash.
- **FR-037B**: Operational metadata MUST remain separately linked and MAY include UUIDs, generated timestamps, user-session identifiers, UI state, and explicitly labeled non-deterministic execution metadata without changing the deterministic content hash.
- **FR-037C**: All deterministic content MUST use **PBGC Case Workbench Canonicalization Profile v1**: contract-defined deterministic-field inclusion and operational-field exclusion; Unicode NFC preprocessing; canonical object-key handling; registered set-like and order-significant arrays; recursive order-significant fallback for unregistered arrays; explicit duplicate, null, and absence rules; and UTF-8 serialization. Intrinsic array rules apply only to explicitly schema-typed values. The profile uses RFC 8785 specifically for finite JSON-number serialization, including equivalent notation and negative zero; NaN/infinities are invalid. Exact lexical decimals use the separately defined canonical decimal-string grammar. Tests MUST cover both explicitly typed candidate evidence and arbitrary candidate-shaped objects, registered permutations, meaningful fallback reordering, recursive nesting, numeric vectors and boundaries, exact decimals, and operational exclusions.
- **FR-038**: Every derived record MUST identify the source artifact hash, applicable source locator, transformation or extraction status, rule or method version, and producing intake attempt.
- **FR-039**: The system MUST preserve raw extracted values separately from normalized values and MUST record each normalization action without altering the original artifact.
- **FR-040**: Normalized dates and other controlled values MUST retain the raw observed value, normalized value if valid, convention used, confidence, and validation status.
- **FR-041**: The system MUST provide explicit human-review checkpoints for quarantine release, identifier collisions, ambiguous classifications, proposed non-exact relationships, disputed dates, population-candidate approval, and unresolved items. Every typed governed decision chain—including acquisition proposal, quarantine, artifact eligibility, classification, authority, evidence relationship, population candidate, export approval, and unresolved-item decisions—MUST have a complete transition matrix defining initial decisions, predecessor/successor states, effective and terminal states, revocation/supersession, required predecessor ID/content hash, and exact same-subject binding. Replay MUST be append-only, gapless, non-branching, ordinal/predecessor ordered, and timestamp-independent; gaps, branches, cycles, broken or stale hashes, cross-subject links, prohibited transitions, and ineffective supersession MUST fail closed.
- **FR-041A**: User-facing terminology MUST visibly distinguish accounting classifications, automated provisional security states, and human-final governed decisions. A ledger category MUST NOT be presented as a legal, authoritative, released, or human-final disposition. Every blocking state MUST explain its triggering finding or reason, required evidence or review, and available next action.
- **FR-042**: Each deterministic unresolved-item source MUST record affected scope, evidence, competing possibilities, downstream consequence, responsible reviewer or queue, and only provisional `open` or `assigned` status. Resolved, accepted-risk, reopened, and superseded are computed effective projections derived exclusively from a complete typed human UnresolvedItemDecision chain and never mutate the source item. Standalone or incomplete-manifest final-state claims MUST fail.
- **FR-043**: The system MUST represent package and artifact processing independently so that a package may be complete, partially complete, blocked, failed, or interrupted without obscuring individual artifact outcomes.
- **FR-044**: Unsupported, encrypted, corrupt, unreadable, or password-protected artifacts MUST remain in the manifest with their preserved original, explicit limitation, and review or failure status.
- **FR-045**: Interrupted intake MUST be resumable without silently duplicating completed artifact records or losing prior status history.
- **FR-045A**: Each intake attempt MUST retain an immutable package snapshot of expected artifacts whose canonical identity is the lowercase SHA-256 of its canonical deterministic content; any operational snapshot-record UUID MUST be stored separately and MUST NOT serve as the snapshot identity.
- **FR-045B**: An interrupted attempt MAY resume in place only when its recorded package snapshot is unchanged; successfully processed artifacts MUST be reused without creating duplicate inventory records.
- **FR-045C**: An added, removed, renamed, or changed artifact MUST NOT be silently absorbed into an interrupted attempt and MUST instead create a new intake attempt linked to the prior attempt with the divergence reason recorded.
- **FR-045D**: The system MUST preserve both attempts' manifests, status histories, timestamps, and lineage.
- **FR-045E**: Resuming an unchanged attempt MUST produce the same content-derived results as uninterrupted processing of the same snapshot, excluding explicitly identified run metadata.
- **FR-046**: Reprocessing the same immutable inputs under the same approved rules MUST reproduce content-derived outputs; run-specific metadata MUST be separately identified.
- **FR-047**: Validation results MUST state the subject, finding code, and either the exact check performed or both a stable check-definition identifier and version; they MUST also state outcome (`passed`, `failed`, `blocked`, `inconclusive`, `unsupported`, or `error`), severity, evidence, limitations, timestamp, affected artifact SHA-256 where applicable, rule-set version, deterministic result payload where applicable, and whether the result blocks downstream use.
- **FR-048**: The system MUST maintain two separate reconciliation ledgers over the same discovered-record set. Every discovered record MUST appear exactly once as either a source artifact or extracted member in the origin-classification ledger and exactly once as `accepted-for-processing`, `provisional-safety-block`, `pending-human-disposition`, `final-human-disposition-recorded`, `failed`, `duplicate`, or `excluded` in the mutually exclusive terminal-disposition accounting ledger. Each ledger MUST independently balance to the discovered-record total; appearing once in each separate ledger is required and is not double counting. The terminal ledger is accounting-only: it never confers release, approval, authority, or a human-final governed state. US2 MAY balance both ledgers while all governed records remain provisional; US3 establishes final governed states only through separate typed human decisions. Unsupported or unresolved detail MUST attach to one accounting category without creating another ledger entry.
- **FR-049**: The system MUST maintain end-to-end lineage from case and intake attempt through original artifact, extraction, normalized record, human decision, unresolved item, and validation result.
- **FR-050**: The feature MUST NOT perform benefit calculations, plan-provision interpretation, legal conclusions, participant-entitlement determinations, PBGC guarantee-limit processing, V1 generation, or actuarial-liability calculations.

#### Reusable evidence acquisition and structured extraction

- **FR-051**: Feature 009 MUST establish an Evidence Acquisition & Structured Extraction Framework as reusable intake-layer infrastructure for future modules without implementing those modules' interpretations, calculations, or reports.
- **FR-051A**: A requesting module MUST be able to register missing-fact declarations, candidate document or report types, recommendation-only source priorities, a versioned Draft 2020-12 extraction JSON Schema, versioned extraction instructions, and rerun-trigger metadata.
- **FR-051B**: The framework MUST generate, validate, import, and store acquisition and returned-extraction packages locally with versioned schema and instruction hashes and a local-only, no-transmission policy. It MUST separately represent `deterministicRequestPayload`, `deterministicPackagePayload`, and nullable `deterministicProposalPayload`, each with its own lowercase SHA-256 computed only from canonical deterministic content.
- **FR-051C**: Every deterministic returned extraction proposal payload MUST retain exact artifact SHA-256 linkage, precise source citations, proposed extracted facts, uncertainty, conflicts, registered schema/instruction identities and versions, and logically required requesting-module rerun metadata. UUIDs, timestamps, storage paths, runtime status, UI state, actor data, approval history, and import/export transport metadata MUST remain in separate operational metadata and MUST NOT affect any deterministic hash.
- **FR-051D**: Automated extraction and validation MUST remain proposals. Downstream use MUST remain blocked until an authorized human approves the exact deterministic proposal SHA-256 through an append-only typed decision record; current governed status MUST be derived by replaying decision history and MUST NOT be overwritten in place.
- **FR-051E**: The framework MUST reject a system actor for final proposal approval and MUST reject approval whose proposal hash differs from the returned proposal's SHA-256.
- **FR-051F**: Source-priority records MUST remain recommendations and MUST NOT confer authority, supersession, legal interpretation, or canonical status.
- **FR-051G**: The framework MUST NOT transmit packages, call an external LLM, include an external-LLM client, or execute active content; it provides local package and validation primitives only.
- **FR-051H**: Future modules MAY register schemas and instructions through this framework but MUST separately specify and approve their plan interpretation, actuarial calculation, V1, DOPT, analysis-template, Data Elements List, or report-production behavior.
- **FR-051I**: Canonical acquisition serialization MUST use UTF-8 JSON, lexicographically ordered object keys, the recursive and exact-path array rules required by FR-037C, and explicit null handling. Missing facts, candidate types, artifact hashes, schema/instruction registrations, proposed facts and their registered nested arrays, citations, lineage references, rerun triggers, and promoted facts use their documented set-like or order-significant semantics; all unregistered arrays recursively default to order-significant. Source priorities are order-significant recommendations and are valid only when supplied in ascending, unique `priority` order: a nonascending reorder or duplicate priority MUST be rejected, valid ascending input MUST canonicalize deterministically, and changing an actual priority or another semantic value in a still-valid record MUST change its hash. Repeated generation from identical deterministic inputs MUST yield byte-identical payloads and identical hashes; changes only to operational metadata MUST leave all deterministic hashes unchanged.
- **FR-051J**: Proposal decision history MUST support approve, reject, revoke, and supersede through one append-only, non-branching predecessor chain. Every record MUST include decision ID, positive integer `appendOrdinal`, exact proposal SHA-256, decision type, human actor, rationale, informational operational timestamp, prior decision ID and deterministic prior-decision content hash, resulting governed status, and rule-set/schema versions. The first record MUST have ordinal 1 and no predecessor; every later record MUST increment by exactly one and reference the immediately preceding decision ID and content hash. Effective status MUST be replayed solely in ordinal predecessor order, never timestamp order. Decision content hashes exclude UUIDs, actors, rationale, and timestamps. Valid transitions are no-decision→approve/reject, approve→revoke/supersede, reject→supersede, and revoked→supersede; rejection MUST NOT be revoked, supersession MUST target the effective prior decision, and gaps, duplicate ordinals, branches, cycles, invalid transitions, system actors, or mismatched proposal hashes MUST be rejected.
- **FR-051K**: The evidence manifest MUST retain typed lineage for acquisition requests, local packages, extraction schema/instruction registrations, returned proposals, decision records, requesting modules, rerun triggers, and promoted governed facts, including request-to-package, package-to-proposal, proposal-to-decision, and decision-to-promoted-fact edges. Each promoted fact MUST identify its stable fact key, valid canonical JSON Pointer into `proposedExtractedFacts`, lowercase SHA-256 of canonical `{factKey, factJsonPointer, value}`, source proposal hash, current effective approval decision, exact artifact hashes, supporting citation IDs, target governed-record type/ID, and promotion rule-set/schema versions. Request, package, proposal, decision, promoted-fact, and rerun-trigger node hashes MUST cover their defined deterministic projections only; operational UUIDs and timestamps MUST never affect them. Invalid pointers, absent/ambiguous facts, content-hash or citation/artifact mismatches, approval for another or revoked proposal, conflicting duplicate promotions, orphans, broken endpoints, and duplicate node IDs MUST be invalid.

### Key Entities *(include if feature involves data)*

- **Case**: A terminated-plan matter identified by an immutable internal UUID, authoritative PBGC identifier, purpose, lifecycle status, and creation provenance.
- **Intake Attempt**: A bounded submission or resumption event for one case, including actor, source context, timestamps, status, and reproducibility metadata.
- **Case Package**: The submitted collection and its declared context, immutable expected-artifact snapshot, package-level status, and reconciliation totals.
- **Original Artifact**: Immutable received bytes plus hash, size, original name, media characteristics, custody history, and controlled-storage reference.
- **Contained Artifact**: A successfully extracted member independently inventoried as evidence, with its own bytes and lifecycle plus parent-child lineage and extraction metadata linking it to the immutable submitted container.
- **Artifact Record**: Immutable deterministic inventory evidence for an original artifact, including classifications, dates, processing status, and provisional blocking state; governed downstream eligibility is a separate computed projection of an effective exact-hash typed human-decision chain and is never stored as source approval.
- **Authority Decision**: A human decision, separate from classification approval, that permits or denies authoritative downstream use for one exact artifact SHA-256 and preserves approval, revocation, and supersession history.
- **Provenance Event**: A traceable custody, submission, preservation, access, or transformation event associated with an artifact or derivative.
- **Extraction Result**: Raw content or metadata obtained from an artifact, with source locator, limitations, producing attempt, and relationship to normalized values.
- **Normalized Evidence Record**: Controlled, deterministic metadata or content derived from an extraction while retaining raw value, source lineage, confidence, and review status.
- **Screening Result**: A risk finding or completed check for sensitive or active content, with limitations and downstream-blocking effect.
- **Quarantine Decision**: The current quarantine disposition and complete human-review history for an artifact and affected derivatives.
- **Evidence Relationship**: Immutable proposal/provisional evidence for an association between artifacts, with relationship type, evidence, and confidence; effective human-final status is a separate computed projection of typed decision-chain replay with visible provenance.
- **Population Candidate Profile**: An immutable proposal/provisional, non-interpretive structural description of a likely participant file, identified by deterministic `candidateKey`, with typed evidence references, observed fields and records, sensitivity, and findings; effective human-final status is separately computed from typed decision-chain replay.
- **Validation Result**: A reproducible check outcome tied to its subject, evidence, severity, and downstream effect.
- **Unresolved Item**: A visible ambiguity, conflict, missing fact, failed check, or review need with scope, consequence, owner, and resolution history.
- **Status Event**: An append-only record of a state transition, actor or automated source, timestamp, rationale, and prior and resulting states.
- **Evidence Acquisition Request**: A future module's local declaration of missing facts, candidate source types, recommendation-only priorities, registered extraction schema/instructions, and rerun triggers.
- **Returned Extraction Proposal**: Immutable proposal/provisional evidence locally imported and schema-validated against exact artifact hashes and citations, with uncertainty and conflicts; effective human-decision status is separately derived by typed decision-chain replay and downstream use remains blocked until approval is effective.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For a test package of at least 100 mixed supported, unsupported, duplicate, and unsafe records, 100% of discovered records appear exactly once in the origin-classification ledger and exactly once in the terminal-disposition accounting ledger; each ledger independently balances to the same discovered-record total, and 0 records have a missing or multiple category within either ledger. US2 achieves this while governed records remain provisional, and 0 terminal-ledger entries alone produce release or a human-final governed state.
- **SC-002**: For every readable artifact in the acceptance corpus, 100% of recorded SHA-256 values match an independent calculation and every later integrity check detects any changed bytes.
- **SC-003**: In duplicate testing, 100% of byte-identical artifacts are identified as exact duplicates regardless of filename, and 0% of non-identical artifacts are finalized automatically as exact duplicates.
- **SC-004**: In identifier-collision testing, 100% of attempts to create a second production case stop before creation and require an explicit recorded human decision.
- **SC-005**: In mixed-risk package testing, 100% of artifacts with configured blocking findings immediately enter `provisional-safety-block` or `provisional-quarantine`, are immediately excluded from downstream use, and expose the cause, required review/evidence, and next action while unaffected artifacts continue processing. These automated states are never represented as `final-quarantine`; 100% of final quarantines require a separate typed human decision.
- **SC-006**: Every approved quarantine release and non-exact evidence relationship decision records reviewer identity, timestamp, rationale, and prior status history, with no automated final approvals.
- **SC-007**: Reprocessing unchanged inputs under the same approved rules yields identical content-derived manifests, hashes, normalized values, classifications, findings, and relationship proposals in 100% of acceptance runs, excluding explicitly labeled run metadata.
- **SC-008**: In population-file acceptance tests, 100% of source missing and invalid values remain distinguishable from valid zero values, and no participant value is invented, corrected, or imputed.
- **SC-009**: An authorized reviewer can trace any normalized value or decision to its source artifact hash, source locator when available, intake attempt, and status history in no more than three navigation steps or one exported lineage view.
- **SC-010**: In a moderated acceptance study of at least 20 authorized caseworkers representing intake and evidence-review roles, at least 19 participants (95%) MUST, on their first attempt, create a synthetic case, submit the supplied mixed synthetic package, identify every quarantined artifact, and locate every unresolved item. Participants MAY use the approved operator guide and built-in help but MUST receive no task-specific coaching after the timed attempt begins. Success is all four tasks completed without a critical error; retained evidence MUST include the participant-role profile, anonymized completion checklist, elapsed time, observed errors, assistance used, and aggregate success calculation, without participant or case PII.
- **SC-011**: For packages of up to 1,000 artifacts and 10 GB, users receive a complete initial inventory and hash/provenance status within 60 minutes under the agreed acceptance environment, with ongoing or blocked analyses clearly identified.
- **SC-012**: Across the acceptance corpus, 0 reports claim Office, macro, embedded-code, actuarial, V1, or external-system execution unless that execution is both in scope and evidenced; for this feature, such execution claims remain zero.
- **SC-013**: Across privacy acceptance tests, 0 real direct or indirect participant identifiers are transmitted to an external LLM, 100% of attempted noncompliant transmissions are blocked, and authorized local PII is not quarantined solely because it is expected PII.
- **SC-014**: For every container in the acceptance corpus, 100% of submitted containers and successfully extracted members have independently verified hashes and complete containment lineage, while 0 unobserved members are invented after partial or failed extraction.
- **SC-015**: In quarantine lifecycle testing, 100% of changed-hash artifacts receive new screening and disposition records, 0 prior releases carry forward across different hashes, and every same-hash inherited release links to the reviewed artifact and preserves separate provenance.
- **SC-016**: In interruption testing, 100% of unchanged snapshots resume without duplicate artifact records and reproduce uninterrupted content-derived results, while 100% of added, removed, renamed, or changed artifacts create a new linked intake attempt with preserved manifests and divergence history.
- **SC-017**: Across classification acceptance tests, 0 automated classifications become approved through confidence alone, 100% of production-used classifications have a traceable human approval, and every same-hash reused classification links to its approved source record.
- **SC-018**: Across framework acceptance tests, 100% of acquisition and returned-extraction packages validate against their registered schema/instruction versions, 100% of citations resolve to listed artifact SHA-256 values, 0 unapproved or hash-mismatched proposals become downstream eligible, and 0 package transmissions or external-LLM calls occur.

## Assumptions

- Users who create cases, review quarantines, or approve evidence relationships are authenticated and authorized under an external access-control policy; defining the enterprise authentication mechanism is outside this feature.
- Production case evidence and participant-level derivatives remain local to the user's device in an approved controlled environment with retention, access, backup, and disposal controls; this repository stores only specifications, code, and approved de-identified, redacted, synthetic, or mock test material.
- A package may be accepted without every expected document category; completeness is reported rather than inferred.
- Automated classification and screening results are decision support, not legal, actuarial, or document-authority determinations.
- A de-identified population retains only fields required for the approved actuarial or validation purpose, uses non-identifying general keys, and contains no direct or indirect identifiers reasonably capable of re-identifying a participant.
- Production distribution consists of one downloadable HTML artifact. It may execute directly from `file://` where the approved browser supports the required local capabilities; otherwise an approved localhost/static-origin launcher may serve the unchanged artifact but performs no server-side processing and receives or transmits no case data.
- Industry-recognized media types and common Office, PDF, text, tabular, image, archive, and structured-data formats form the initial acceptance corpus, while unsupported formats remain auditable manifest entries.
- Exact duplicates share bytes but may retain different provenance, custody, filenames, and business context.
- Date normalization uses an approved documented convention and never treats an inferred date as human-approved without review.
- Package-size and elapsed-time success criteria will be validated in a controlled acceptance environment whose resource profile is recorded with the result.

## Dependencies

- An approved device-local controlled storage environment for originals, quarantined artifacts, and participant-level derivatives.
- Defined authorized-human roles and review queues for case collisions, quarantine, evidence relationships, population candidates, and unresolved items.
- A designated approving authority for artifact authority decisions and the local-first architecture decision record.
- Approved screening capabilities and documented limitations for supported artifact types.
- Versioned controlled vocabularies for document categories, source-role categories, statuses, relationship types, validation outcomes, and unresolved-item types.
- Downstream consumers must honor quarantine, approval, lineage, and unresolved-item statuses rather than treating all normalized records as production-ready.

## Risks

- Encrypted, proprietary, damaged, or unusually complex binaries may prevent complete screening or extraction and increase the human-review queue.
- Automated similarity and date extraction may create plausible but incorrect proposals; human approval boundaries are therefore mandatory.
- Large packages and nested containers may delay full screening even after the initial inventory is available.
- Sensitive data may propagate into temporary or derived artifacts unless every derivative inherits source access and quarantine controls.
- Reference-library examples may be mistaken for approved case evidence unless source-role and canonical-approval boundaries remain explicit.

## Unresolved Questions

- No material business-rule questions remain for specification. Acceptance-environment resource profiles, controlled vocabularies, authorization roles, retention policy, screening-tool selections, and the setup-phase browser feasibility decision must be resolved through the approved ADR or operational policies before production release without weakening these requirements.
